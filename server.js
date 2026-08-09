import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import agentRoutes from './src/api/agentRoutes.js';
import config from './src/config/env.js';
import { dbAll } from './src/database/db.js';
import { registerOrchestrator, getOrchestrator } from './src/agent/orchestrator.js';
import { createScheduler } from './src/agent/scheduler.js';
import { attachSseToOrchestrator } from './src/api/agentRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Serve static frontend ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Mount API routes ───────────────────────────────────────────────────────
app.use('/api/agent', agentRoutes);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: config.nodeEnv,
    autonomousInterval: `${config.autonomousInterval}s`,
    timestamp: new Date().toISOString(),
  });
});

// ── SPA fallback ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Restore agents from DB on startup ─────────────────────────────────────
function restoreAgents() {
  try {
    const agents = dbAll(`SELECT agent_id, persona_json FROM agents`);
    for (const agent of agents) {
      const agentId = agent.agent_id;
      if (getOrchestrator(agentId)) continue;

      const persona = JSON.parse(agent.persona_json);
      const orch = registerOrchestrator(agentId, persona);

      // Re-attach SSE broadcasting for this agent
      attachSseToOrchestrator(agentId, orch);

      const scheduler = createScheduler(agentId, orch);
      scheduler.start();
      console.log(`[Restore] Agent ${agentId} (${persona.name} / ${persona.domain}) resumed`);
    }
    if (agents.length > 0) {
      console.log(`[Restore] ${agents.length} agent(s) back online with autonomous schedulers`);
    }
  } catch (err) {
    console.error('[Restore] Error restoring agents:', err.message);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  restoreAgents();

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   🤖  AUTONOMOUS AI CREATOR — HACKATHON BUILD             ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║   Server:   http://localhost:${config.port}                       ║`);
  console.log(`║   Mode:     ${config.isDev ? 'DEVELOPMENT' : 'PRODUCTION       '}                            ║`);
  console.log(`║   Interval: ${config.autonomousInterval}s per cycle                          ║`);
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║   REQUIRED HACKATHON ENDPOINTS:                           ║');
  console.log('║   POST /api/agent/init    ← Initialize agent (once)      ║');
  console.log('║   GET  /api/agent/feed    ← Feed (newest posts first)     ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║   DASHBOARD ENDPOINTS:                                    ║');
  console.log('║   GET  /api/agent/status                                  ║');
  console.log('║   GET  /api/agent/events  ← SSE real-time stream          ║');
  console.log('║   GET  /api/agent/timeline                                ║');
  console.log('║   GET  /api/agent/editorial                               ║');
  console.log('║   GET  /api/agent/memory                                  ║');
  console.log('║   POST /api/agent/run     ← Manual cycle trigger          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
});

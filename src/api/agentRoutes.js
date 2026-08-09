/**
 * API Routes for Hackathon Requirements
 *
 * POST /api/agent/init   — Initialize agent (called exactly once)
 * GET  /api/agent/feed   — Return posts newest first (?agentId=)
 *
 * Plus additional endpoints for dashboard:
 * GET  /api/agent/status
 * GET  /api/agent/events   (SSE)
 * GET  /api/agent/timeline
 * GET  /api/agent/editorial
 * GET  /api/agent/memory
 * POST /api/agent/run
 * POST /api/agent/scheduler
 * GET  /api/agent/personas
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../database/db.js';
import { buildPersona, PERSONA_PRESETS } from '../config/personas.js';
import { registerOrchestrator, getOrchestrator } from '../agent/orchestrator.js';
import { createScheduler, getScheduler } from '../agent/scheduler.js';

const router = express.Router();

// ─── SSE client registry (per agentId) ──────────────────────────────────────
const sseClients = new Map(); // agentId → Set<res>

function broadcast(agentId, data) {
  const clients = sseClients.get(agentId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of [...clients]) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

// ─── Middleware: resolve agentId (from query or body) ────────────────────────
function requireAgent(req, res, next) {
  const agentId = req.query.agentId || req.body?.agentId;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  const agent = dbGet(`SELECT * FROM agents WHERE agent_id=?`, [agentId]);
  if (!agent) return res.status(404).json({ error: `Agent '${agentId}' not found. Call POST /api/agent/init first.` });

  req.agentId = agentId;
  req.agentPersona = JSON.parse(agent.persona_json);
  next();
}

// ─── POST /api/agent/init ────────────────────────────────────────────────────
router.post('/init', async (req, res) => {
  try {
    const { persona: personaInput = {} } = req.body;

    // Build full persona from input
    const persona = buildPersona(personaInput);

    // Generate a stable agentId
    const agentId = `agent-${uuidv4().split('-')[0]}`;

    // Persist agent
    dbRun(
      `INSERT INTO agents (agent_id, persona_json) VALUES (?, ?)`,
      [agentId, JSON.stringify(persona)]
    );

    // Create orchestrator
    const orch = registerOrchestrator(agentId, persona);

    // Wire up SSE broadcasting for this agent's events
    orch.on('pipeline_event', (event) => {
      broadcast(agentId, event);
    });

    // Create + start autonomous scheduler immediately
    const scheduler = createScheduler(agentId, orch);
    scheduler.start();

    // Run one initial cycle immediately so there's content right away
    setTimeout(() => {
      orch.runCycle().catch(e => console.error('[Init cycle error]', e.message));
    }, 500);

    console.log(`[API] Agent initialized: ${agentId} (${persona.name} / ${persona.domain})`);

    return res.status(200).json({
      agentId,
      persona: {
        name: persona.name,
        domain: persona.domain,
        handle: persona.handle,
        mission: persona.mission,
      },
      scheduler: {
        intervalSeconds: scheduler.intervalSeconds,
        mode: process.env.NODE_ENV === 'production' ? 'PROD' : 'DEV',
      },
    });
  } catch (err) {
    console.error('[POST /api/agent/init]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/feed ─────────────────────────────────────────────────────
router.get('/feed', requireAgent, (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 100);
    const offset = parseInt(req.query.offset, 10) || 0;

    const orch = getOrchestrator(req.agentId);
    const posts = orch
      ? orch.getFeed(limit, offset)
      : dbAll(
          `SELECT * FROM posts WHERE agent_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [req.agentId, limit, offset]
        ).map(row => ({
          id: row.id,
          createdAt: row.created_at,
          text: row.text,
          rationale: row.rationale,
          sources: JSON.parse(row.sources_json || '[]'),
        }));

    return res.status(200).json({ posts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/status ───────────────────────────────────────────────────
router.get('/status', requireAgent, (req, res) => {
  try {
    const orch = getOrchestrator(req.agentId);
    const scheduler = getScheduler(req.agentId);

    if (!orch) return res.status(404).json({ error: 'Orchestrator not found' });

    return res.status(200).json({
      ...orch.getStatus(),
      scheduler: scheduler?.getStatus() || null,
      autonomousMode: true,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/events (SSE) ─────────────────────────────────────────────
router.get('/events', requireAgent, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const agentId = req.agentId;
  if (!sseClients.has(agentId)) sseClients.set(agentId, new Set());
  sseClients.get(agentId).add(res);

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', agentId, timestamp: new Date().toISOString() })}\n\n`);

  // Keep-alive ping every 30s
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
  }, 30000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.get(agentId)?.delete(res);
  });
});

// ─── GET /api/agent/timeline ─────────────────────────────────────────────────
router.get('/timeline', requireAgent, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 60;
    const orch = getOrchestrator(req.agentId);
    const timeline = orch ? orch.getActivityTimeline(limit) : [];
    return res.status(200).json({ timeline });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/editorial ────────────────────────────────────────────────
router.get('/editorial', requireAgent, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 60;
    const orch = getOrchestrator(req.agentId);
    const logs = orch ? orch.getEditorialLog(limit) : [];
    return res.status(200).json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/memory ───────────────────────────────────────────────────
router.get('/memory', requireAgent, (req, res) => {
  try {
    const orch = getOrchestrator(req.agentId);
    const stats = orch ? orch.getMemoryStats() : {};
    return res.status(200).json({ memory: stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent/run ─────────────────────────────────────────────────────
router.post('/run', requireAgent, async (req, res) => {
  try {
    const orch = getOrchestrator(req.agentId);
    if (!orch) return res.status(404).json({ error: 'Orchestrator not found' });

    const injectTopic = req.body?.topic || null;
    const result = await orch.runCycle(injectTopic);
    return res.status(200).json({ result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agent/scheduler ───────────────────────────────────────────────
router.post('/scheduler', requireAgent, (req, res) => {
  try {
    const scheduler = getScheduler(req.agentId);
    if (!scheduler) return res.status(404).json({ error: 'Scheduler not found' });

    const { action, intervalSeconds } = req.body;
    if (intervalSeconds) scheduler.setInterval(intervalSeconds);
    if (action === 'start') scheduler.start();
    else if (action === 'stop' || action === 'pause') scheduler.stop();

    return res.status(200).json({ scheduler: scheduler.getStatus() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/personas ──────────────────────────────────────────────────
router.get('/personas', (req, res) => {
  return res.status(200).json({ presets: PERSONA_PRESETS });
});

// ─── Named export for server.js to attach SSE on restart ─────────────────────
export function attachSseToOrchestrator(agentId, orch) {
  orch.on('pipeline_event', (event) => {
    broadcast(agentId, event);
  });
}

export default router;

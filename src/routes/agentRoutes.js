import express from 'express';
import { db } from '../services/db.js';
import { orchestrator } from '../services/orchestrator.js';
import { scheduler } from '../services/scheduler.js';
import { memory } from '../services/memory.js';
import { DEFAULT_PERSONAS } from '../config/defaultPersonas.js';

const router = express.Router();

// SSE Clients registry
let sseClients = [];

// Subscribe to Orchestrator stage events and broadcast to connected SSE clients
orchestrator.on('stage_change', (payload) => {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(data);
    } catch (e) {
      // client disconnected
    }
  });
});

/**
 * GET /agent/events
 * Real-time SSE stream for orchestrator pipeline visualization
 */
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ stage: 'CONNECTED', status: orchestrator.getStatus() })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

/**
 * POST /agent/init
 * Persona Setup & System Initialization
 */
router.post('/init', (req, res) => {
  try {
    const {
      name,
      handle,
      avatar,
      role,
      bio,
      tone,
      styleGuide,
      topics,
      searchKeywords,
      scheduleMinutes,
      editorialStrictness,
      minScoreThreshold,
      presetId
    } = req.body;

    let updatedPersona;

    if (presetId) {
      const preset = DEFAULT_PERSONAS.find(p => p.id === presetId);
      if (preset) {
        updatedPersona = db.setActivePersona(preset);
      }
    }

    if (!updatedPersona) {
      const existing = db.getActivePersona();
      updatedPersona = db.setActivePersona({
        name: name || existing.name,
        handle: handle || existing.handle,
        avatar: avatar || existing.avatar,
        role: role || existing.role,
        bio: bio || existing.bio,
        tone: tone || existing.tone,
        styleGuide: styleGuide || existing.styleGuide,
        topics: Array.isArray(topics) ? topics : (topics ? topics.split(',').map(s => s.trim()) : existing.topics),
        searchKeywords: Array.isArray(searchKeywords) ? searchKeywords : (searchKeywords ? searchKeywords.split(',').map(s => s.trim()) : existing.searchKeywords),
        scheduleMinutes: scheduleMinutes ? parseInt(scheduleMinutes, 10) : existing.scheduleMinutes,
        editorialStrictness: editorialStrictness || existing.editorialStrictness,
        minScoreThreshold: minScoreThreshold ? parseInt(minScoreThreshold, 10) : existing.minScoreThreshold
      });
    }

    if (updatedPersona.scheduleMinutes) {
      scheduler.setIntervalMinutes(updatedPersona.scheduleMinutes);
    }

    return res.status(200).json({
      success: true,
      message: 'Agent persona successfully initialized and orchestrator updated.',
      persona: updatedPersona,
      scheduler: scheduler.getStatus()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /agent/feed
 * Newest posts first with Rationale, Sources, and Persona info
 */
router.get('/feed', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const tag = req.query.tag || null;

    const posts = db.getPosts(limit, offset, tag);
    const activePersona = db.getActivePersona();

    return res.status(200).json({
      success: true,
      count: posts.length,
      total: db.posts.length,
      activePersona: {
        name: activePersona.name,
        handle: activePersona.handle,
        avatar: activePersona.avatar,
        role: activePersona.role
      },
      posts
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /agent/run
 * Manually trigger an immediate Orchestrator run cycle
 */
router.post('/run', async (req, res) => {
  try {
    const customPrompt = req.body?.customPrompt || null;
    const result = await orchestrator.runCycle(customPrompt);
    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /agent/status
 * Orchestrator and Scheduler health and metrics
 */
router.get('/status', (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      orchestrator: orchestrator.getStatus(),
      scheduler: scheduler.getStatus()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /agent/editorial-logs
 * Audit trail of Editorial Judge decisions (accepted & rejected with reasons)
 */
router.get('/editorial-logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = db.getEditorialLogs(limit);
    return res.status(200).json({
      success: true,
      total: logs.length,
      logs
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /agent/memory
 * Inspect memory items and persona theme continuity
 */
router.get('/memory', (req, res) => {
  try {
    const activePersona = db.getActivePersona();
    const memoryContext = memory.getPersonaMemoryContext(activePersona.id);
    const memoryItems = db.getMemoryItems(50);
    return res.status(200).json({
      success: true,
      memoryContext,
      recentMemoryNodes: memoryItems
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /agent/scheduler
 * Control scheduler (start/pause/interval)
 */
router.post('/scheduler', (req, res) => {
  try {
    const { action, intervalMinutes } = req.body;
    if (intervalMinutes) {
      scheduler.setIntervalMinutes(intervalMinutes);
    }

    if (action === 'start') {
      scheduler.start();
    } else if (action === 'pause' || action === 'stop') {
      scheduler.stop();
    }

    return res.status(200).json({
      success: true,
      scheduler: scheduler.getStatus()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /agent/personas
 * List available presets
 */
router.get('/personas', (req, res) => {
  return res.status(200).json({
    success: true,
    presets: DEFAULT_PERSONAS,
    active: db.getActivePersona()
  });
});

export default router;

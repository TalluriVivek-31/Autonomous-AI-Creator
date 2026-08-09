/**
 * Autonomous Agent Orchestrator
 *
 * Coordinates the full autonomous pipeline:
 * DISCOVER → NORMALIZE → DUPLICATE CHECK → EDITORIAL JUDGE →
 * RELEVANCE SCORE → PERSONA WRITE → VALIDATE → MEMORY STORE → FEED
 *
 * Emits activity events for real-time UI updates.
 */

import EventEmitter from 'events';
import { dbRun, dbGet, dbAll } from '../database/db.js';
import { DiscoveryService } from './discovery.js';
import { MemoryEngine } from './memory.js';
import { EditorialJudge } from './editor.js';
import { PersonaWriter } from './writer.js';
import { validatePost, generatePostId } from './validator.js';

export class Orchestrator extends EventEmitter {
  constructor(agentId, persona) {
    super();
    this.agentId = agentId;
    this.persona = persona;
    this.isProcessing = false;
    this.currentStage = 'IDLE';

    this.discovery = new DiscoveryService(agentId);
    this.memory = new MemoryEngine(agentId);
    this.editor = new EditorialJudge(agentId);
    this.writer = new PersonaWriter(agentId);
  }

  // ── Event helpers ─────────────────────────────────────────────────────────

  emitEvent(type, payload = {}) {
    const event = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    // Persist event to DB for timeline view
    try {
      dbRun(
        `INSERT INTO activity_events (id, agent_id, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [event.id, this.agentId, type, JSON.stringify(payload), event.timestamp]
      );
    } catch { /* non-critical */ }

    this.currentStage = type;
    this.emit('pipeline_event', event);
    return event;
  }

  // ── Main pipeline ─────────────────────────────────────────────────────────

  async runCycle(injectTopic = null) {
    if (this.isProcessing) {
      return { status: 'BUSY', message: 'Cycle already in progress' };
    }

    this.isProcessing = true;
    const cycleStart = Date.now();
    const cycleId = `cycle-${Date.now()}`;

    try {
      this.emitEvent('CYCLE_START', { cycleId, persona: this.persona.name });

      // ── 1. TOPIC DISCOVERY ─────────────────────────────────────────────────
      this.emitEvent('DISCOVERING', {
        message: `Scanning live sources for ${this.persona.domain} topics…`,
        persona: this.persona.name,
      });

      let candidates = await this.discovery.discover(this.persona);

      // Inject custom topic if provided (e.g. from UI)
      if (injectTopic) {
        candidates.unshift({
          id: `inject-${Date.now()}`,
          title: injectTopic,
          url: '',
          sourceName: 'User Injection',
          summary: `Breaking topic injected for immediate evaluation: ${injectTopic}`,
          publishedAt: new Date().toISOString(),
          discoveredAt: new Date().toISOString(),
          fingerprint: `inject-${Date.now()}`,
        });
      }

      this.emitEvent('TOPICS_DISCOVERED', {
        count: candidates.length,
        topics: candidates.map(c => ({ title: c.title, source: c.sourceName })),
      });

      if (candidates.length === 0) {
        this.emitEvent('CYCLE_END', { status: 'NO_TOPICS', durationMs: Date.now() - cycleStart });
        this.isProcessing = false;
        this.currentStage = 'IDLE';
        return { status: 'NO_TOPICS' };
      }

      // ── 2. EVALUATE EACH CANDIDATE ────────────────────────────────────────
      this.emitEvent('EVALUATING', {
        message: `Editorial Judge evaluating ${candidates.length} candidates…`,
        threshold: this.persona.minScoreToPublish || 68,
      });

      let selectedTopic = null;
      let selectedEditorial = null;
      const evaluated = [];

      for (const topic of candidates) {
        // Duplicate / novelty check
        const noveltyResult = await this.memory.checkNovelty(topic.title, topic.summary);

        // Editorial evaluation
        const editorialResult = this.editor.evaluate(topic, this.persona, noveltyResult);

        evaluated.push({ topic, noveltyResult, editorialResult });

        this.emitEvent('TOPIC_EVALUATED', {
          title: topic.title,
          verdict: editorialResult.verdict,
          score: editorialResult.totalScore,
          threshold: editorialResult.threshold,
          reason: editorialResult.reason,
          novelty: noveltyResult.similarity,
        });

        if (editorialResult.verdict === 'PUBLISH' && !selectedTopic) {
          selectedTopic = topic;
          selectedEditorial = editorialResult;
        }
      }

      if (!selectedTopic) {
        this.emitEvent('ALL_REJECTED', {
          message: 'All candidates rejected by Editorial Judge. Quality standard maintained.',
          evaluated: evaluated.length,
        });

        // Record rejected topics in memory so we don't re-discover them
        for (const { topic, editorialResult } of evaluated) {
          this.memory.recordRejectedTopic(topic, editorialResult.reason);
        }

        this.isProcessing = false;
        this.currentStage = 'IDLE';
        return { status: 'ALL_REJECTED', evaluated: evaluated.length };
      }

      // ── 3. WRITE POST ──────────────────────────────────────────────────────
      this.emitEvent('WRITING', {
        topic: selectedTopic.title,
        score: selectedEditorial.totalScore,
        voice: this.persona.writingStyle?.substring(0, 80),
      });

      const memoryContext = this.memory.getContext();
      let draft;
      let writeAttempts = 0;

      while (writeAttempts < 3) {
        writeAttempts++;
        try {
          draft = await this.writer.write(selectedTopic, this.persona, memoryContext, selectedEditorial);
          if (draft && draft.text) break;
        } catch (err) {
          this.emitEvent('WRITE_RETRY', { attempt: writeAttempts, error: err.message });
          if (writeAttempts >= 3) throw err;
          await new Promise(r => setTimeout(r, 500 * writeAttempts));
        }
      }

      // ── 4. VALIDATE ────────────────────────────────────────────────────────
      this.emitEvent('VALIDATING', { textLength: draft.text?.length });

      const postId = generatePostId();
      const createdAt = new Date().toISOString();

      const postDraft = {
        id: postId,
        text: (draft.text || '').trim(),
        rationale: (draft.rationale || '').trim(),
        sources: Array.isArray(draft.sources) ? draft.sources.filter(Boolean) : [selectedTopic.url].filter(Boolean),
        createdAt,
        tags: draft.tags || [],
        editorialScore: selectedEditorial.totalScore,
      };

      const validation = validatePost(postDraft, this.agentId);
      if (!validation.valid) {
        this.emitEvent('VALIDATION_FAILED', { errors: validation.errors });
        this.isProcessing = false;
        this.currentStage = 'IDLE';
        return { status: 'VALIDATION_FAILED', errors: validation.errors };
      }

      // ── 5. PERSIST POST ────────────────────────────────────────────────────
      this.emitEvent('SAVING', { postId });

      dbRun(
        `INSERT INTO posts (id, agent_id, text, rationale, sources_json, editorial_score, tags_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          postDraft.id,
          this.agentId,
          postDraft.text,
          postDraft.rationale,
          JSON.stringify(postDraft.sources),
          postDraft.editorialScore,
          JSON.stringify(postDraft.tags),
          postDraft.createdAt,
        ]
      );

      // ── 6. UPDATE MEMORY ────────────────────────────────────────────────────
      this.emitEvent('MEMORY_UPDATE', {
        postId,
        title: selectedTopic.title,
      });

      this.memory.recordPublishedPost(postDraft);

      // Record rejected topics in memory too
      for (const { topic, editorialResult } of evaluated) {
        if (editorialResult.verdict === 'REJECT') {
          this.memory.recordRejectedTopic(topic, editorialResult.reason);
        }
      }

      // Update scheduler stats
      try {
        dbRun(
          `UPDATE scheduler_state SET total_cycles=total_cycles+1, last_run_at=? WHERE agent_id=?`,
          [new Date().toISOString(), this.agentId]
        );
      } catch { /* non-critical */ }

      // ── 7. PUBLISH ─────────────────────────────────────────────────────────
      this.emitEvent('PUBLISHED', {
        postId,
        title: selectedTopic.title,
        score: selectedEditorial.totalScore,
        durationMs: Date.now() - cycleStart,
      });

      this.isProcessing = false;
      this.currentStage = 'IDLE';

      return {
        status: 'SUCCESS',
        post: postDraft,
        topic: selectedTopic,
        editorialScore: selectedEditorial.totalScore,
        evaluated: evaluated.length,
        durationMs: Date.now() - cycleStart,
      };

    } catch (err) {
      this.emitEvent('CYCLE_ERROR', { error: err.message });
      this.isProcessing = false;
      this.currentStage = 'IDLE';
      console.error(`[Orchestrator ${this.agentId}] Error:`, err);
      return { status: 'ERROR', error: err.message };
    }
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  getStatus() {
    const schedulerState = dbGet(
      `SELECT * FROM scheduler_state WHERE agent_id=?`,
      [this.agentId]
    );
    const totalPosts = dbGet(`SELECT COUNT(*) as c FROM posts WHERE agent_id=?`, [this.agentId])?.c || 0;
    const totalTopics = dbGet(`SELECT COUNT(*) as c FROM topics WHERE agent_id=?`, [this.agentId])?.c || 0;
    const totalRejected = dbGet(`SELECT COUNT(*) as c FROM editorial_log WHERE agent_id=? AND verdict='REJECT'`, [this.agentId])?.c || 0;
    const lastPost = dbGet(`SELECT created_at FROM posts WHERE agent_id=? ORDER BY created_at DESC LIMIT 1`, [this.agentId]);

    return {
      agentId: this.agentId,
      persona: { name: this.persona.name, domain: this.persona.domain },
      isProcessing: this.isProcessing,
      currentStage: this.currentStage,
      stats: {
        totalPosts,
        totalTopicsDiscovered: totalTopics,
        totalRejected,
        lastPublishedAt: lastPost?.created_at || null,
        totalCycles: schedulerState?.total_cycles || 0,
      },
      scheduler: schedulerState ? {
        isRunning: schedulerState.is_running === 1,
        intervalSeconds: schedulerState.interval_seconds,
        nextRunAt: schedulerState.next_run_at,
        lastRunAt: schedulerState.last_run_at,
        startedAt: schedulerState.started_at,
      } : null,
    };
  }

  getActivityTimeline(limit = 40) {
    return dbAll(
      `SELECT * FROM activity_events WHERE agent_id=? ORDER BY created_at DESC LIMIT ?`,
      [this.agentId, limit]
    ).map(row => ({
      ...row,
      payload: JSON.parse(row.payload_json || '{}'),
    }));
  }

  getFeed(limit = 50, offset = 0) {
    const rows = dbAll(
      `SELECT * FROM posts WHERE agent_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [this.agentId, limit, offset]
    );
    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      text: row.text,
      rationale: row.rationale,
      sources: JSON.parse(row.sources_json || '[]'),
      tags: JSON.parse(row.tags_json || '[]'),
      editorialScore: row.editorial_score,
    }));
  }

  getEditorialLog(limit = 50) {
    return dbAll(
      `SELECT * FROM editorial_log WHERE agent_id=? ORDER BY evaluated_at DESC LIMIT ?`,
      [this.agentId, limit]
    ).map(row => ({
      ...row,
      criteria: JSON.parse(row.criteria_json || '{}'),
    }));
  }

  getMemoryStats() {
    return this.memory.getMemoryStats();
  }
}

// Registry of active orchestrators keyed by agentId
const registry = new Map();

export function getOrchestrator(agentId) {
  return registry.get(agentId) || null;
}

export function registerOrchestrator(agentId, persona) {
  if (registry.has(agentId)) return registry.get(agentId);
  const orch = new Orchestrator(agentId, persona);
  registry.set(agentId, orch);
  return orch;
}

/**
 * Autonomous Scheduler
 *
 * After /api/agent/init is called, this starts automatically.
 * Runs every N seconds (configurable via env vars).
 * The evaluator NEVER needs to click anything or call another endpoint.
 */

import { dbRun, dbGet } from '../database/db.js';
import config from '../config/env.js';

// Active scheduler timers keyed by agentId
const timers = new Map();

export class AgentScheduler {
  constructor(agentId, orchestrator) {
    this.agentId = agentId;
    this.orchestrator = orchestrator;
    this.isRunning = false;
    this.intervalSeconds = config.autonomousInterval;
    this.timer = null;
    this.nextRunAt = null;
    this.lastRunAt = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Persist state
    this._persistState();
    this._scheduleNext();

    console.log(
      `[Scheduler:${this.agentId}] Started — cycle every ${this.intervalSeconds}s ` +
      `(${config.isDev ? 'DEV' : 'PROD'} mode)`
    );
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
    this._persistState();
    console.log(`[Scheduler:${this.agentId}] Stopped`);
  }

  setInterval(seconds) {
    this.intervalSeconds = Math.max(10, Math.min(86400, parseInt(seconds, 10) || this.intervalSeconds));
    if (this.isRunning) {
      if (this.timer) clearTimeout(this.timer);
      this._scheduleNext();
    }
    this._persistState();
    return this.intervalSeconds;
  }

  _scheduleNext() {
    if (this.timer) clearTimeout(this.timer);

    this.nextRunAt = new Date(Date.now() + this.intervalSeconds * 1000).toISOString();
    this._persistState();

    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;

      this.lastRunAt = new Date().toISOString();
      console.log(`[Scheduler:${this.agentId}] Running autonomous cycle at ${this.lastRunAt}`);

      try {
        const result = await this.orchestrator.runCycle();
        console.log(`[Scheduler:${this.agentId}] Cycle complete — status: ${result.status}`);
      } catch (err) {
        console.error(`[Scheduler:${this.agentId}] Cycle error:`, err.message);
      }

      // Schedule next tick regardless of outcome (autonomous = resilient)
      if (this.isRunning) {
        this._scheduleNext();
      }
    }, this.intervalSeconds * 1000);
  }

  _persistState() {
    try {
      dbRun(
        `INSERT INTO scheduler_state (agent_id, is_running, interval_seconds, next_run_at, last_run_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           is_running=excluded.is_running,
           interval_seconds=excluded.interval_seconds,
           next_run_at=excluded.next_run_at,
           last_run_at=excluded.last_run_at`,
        [
          this.agentId,
          this.isRunning ? 1 : 0,
          this.intervalSeconds,
          this.nextRunAt,
          this.lastRunAt,
        ]
      );
    } catch { /* non-critical */ }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalSeconds: this.intervalSeconds,
      nextRunAt: this.nextRunAt,
      lastRunAt: this.lastRunAt,
      secondsUntilNextRun: this.nextRunAt
        ? Math.max(0, Math.round((new Date(this.nextRunAt).getTime() - Date.now()) / 1000))
        : null,
    };
  }
}

export function createScheduler(agentId, orchestrator) {
  if (timers.has(agentId)) {
    timers.get(agentId).stop();
  }
  const s = new AgentScheduler(agentId, orchestrator);
  timers.set(agentId, s);
  return s;
}

export function getScheduler(agentId) {
  return timers.get(agentId) || null;
}

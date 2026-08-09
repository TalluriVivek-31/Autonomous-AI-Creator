import { orchestrator } from './orchestrator.js';
import { db } from './db.js';

export class AgentScheduler {
  constructor() {
    this.timer = null;
    this.isRunning = false;
    this.intervalMinutes = 5;
    this.nextRunTime = null;
    this.lastRunTime = null;
  }

  init() {
    const persona = db.getActivePersona();
    this.intervalMinutes = persona.scheduleMinutes || 5;
    this.start();
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    db.setSchedulerStatus(true);
    this.scheduleNextTick();
    console.log(`[Scheduler] Autonomous agent timer started (Running every ${this.intervalMinutes} mins)`);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    this.nextRunTime = null;
    db.setSchedulerStatus(false);
    console.log('[Scheduler] Autonomous agent timer paused');
  }

  scheduleNextTick() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.nextRunTime = new Date(Date.now() + intervalMs).toISOString();

    this.timer = setTimeout(async () => {
      if (!this.isRunning) return;
      console.log(`[Scheduler] Ticking autonomous run cycle (${new Date().toLocaleTimeString()})...`);
      this.lastRunTime = new Date().toISOString();

      try {
        await orchestrator.runCycle();
      } catch (err) {
        console.error('[Scheduler] Error during scheduled cycle:', err.message);
      }

      // Schedule next tick if still active
      if (this.isRunning) {
        this.scheduleNextTick();
      }
    }, intervalMs);
  }

  setIntervalMinutes(minutes) {
    const mins = Math.max(1, Math.min(1440, parseInt(minutes, 10) || 5));
    this.intervalMinutes = mins;

    // Update persona config
    db.setActivePersona({ scheduleMinutes: mins });

    if (this.isRunning) {
      this.scheduleNextTick();
    }
    return this.intervalMinutes;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      nextRunTime: this.nextRunTime,
      lastRunTime: this.lastRunTime,
      secondsUntilNextRun: this.nextRunTime
        ? Math.max(0, Math.round((new Date(this.nextRunTime).getTime() - Date.now()) / 1000))
        : null
    };
  }
}

export const scheduler = new AgentScheduler();

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_ACTIVE_PERSONA, DEFAULT_PERSONAS } from '../config/defaultPersonas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const PERSONA_FILE = path.join(DATA_DIR, 'persona.json');
const EDITORIAL_LOGS_FILE = path.join(DATA_DIR, 'editorial_logs.json');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

function readJson(file, defaultData) {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
  return defaultData;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err.message);
  }
}

export class Database {
  constructor() {
    this.posts = readJson(POSTS_FILE, []);
    this.activePersona = readJson(PERSONA_FILE, DEFAULT_ACTIVE_PERSONA);
    this.personas = DEFAULT_PERSONAS;
    this.editorialLogs = readJson(EDITORIAL_LOGS_FILE, []);
    this.memoryItems = readJson(MEMORY_FILE, []);
    this.stats = readJson(STATS_FILE, {
      totalRuns: 0,
      totalAccepted: 0,
      totalRejected: 0,
      lastRunTimestamp: null,
      schedulerRunning: true
    });
  }

  // Persona Management
  getActivePersona() {
    return this.activePersona;
  }

  setActivePersona(personaData) {
    this.activePersona = {
      ...this.activePersona,
      ...personaData,
      updatedAt: new Date().toISOString()
    };
    writeJson(PERSONA_FILE, this.activePersona);
    return this.activePersona;
  }

  getAllPersonas() {
    return this.personas;
  }

  // Posts Management
  getPosts(limit = 50, offset = 0, tag = null) {
    let filtered = [...this.posts];
    if (tag) {
      filtered = filtered.filter(p => p.tags && p.tags.includes(tag));
    }
    // Return newest posts first
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return filtered.slice(offset, offset + limit);
  }

  getPostById(id) {
    return this.posts.find(p => p.id === id);
  }

  savePost(post) {
    const postRecord = {
      id: post.id || `post-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: post.timestamp || new Date().toISOString(),
      content: post.content,
      rationale: post.rationale,
      sources: post.sources || [],
      editorialScore: post.editorialScore || 85,
      persona: {
        id: this.activePersona.id,
        name: this.activePersona.name,
        handle: this.activePersona.handle,
        avatar: this.activePersona.avatar,
        role: this.activePersona.role
      },
      tags: post.tags || [],
      metrics: {
        likes: Math.floor(Math.random() * 45) + 5,
        reposts: Math.floor(Math.random() * 18) + 2,
        bookmarks: Math.floor(Math.random() * 25) + 3,
        views: Math.floor(Math.random() * 1200) + 180
      }
    };

    // Prepend so newest is first in memory
    this.posts.unshift(postRecord);
    writeJson(POSTS_FILE, this.posts);

    // Increment stats
    this.stats.totalAccepted += 1;
    writeJson(STATS_FILE, this.stats);

    return postRecord;
  }

  // Editorial Logs Management
  logEditorialDecision(decision) {
    const logEntry = {
      id: `judge-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      candidateTopic: decision.candidateTopic,
      sourceUrl: decision.sourceUrl || null,
      verdict: decision.verdict, // 'ACCEPTED' | 'REJECTED'
      score: decision.score,
      reasoning: decision.reasoning,
      criteriaBreakdown: decision.criteriaBreakdown || {},
      personaId: this.activePersona.id
    };

    this.editorialLogs.unshift(logEntry);
    if (this.editorialLogs.length > 200) {
      this.editorialLogs = this.editorialLogs.slice(0, 200);
    }
    writeJson(EDITORIAL_LOGS_FILE, this.editorialLogs);

    if (decision.verdict === 'REJECTED') {
      this.stats.totalRejected += 1;
    }
    writeJson(STATS_FILE, this.stats);

    return logEntry;
  }

  getEditorialLogs(limit = 40) {
    return this.editorialLogs.slice(0, limit);
  }

  // Memory Management
  saveMemoryItem(item) {
    const memoryRecord = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      text: item.text,
      type: item.type, // 'POST_TOPIC' | 'REJECTED_IDEA' | 'ENTITY_MENTION'
      keywords: item.keywords || [],
      metadata: item.metadata || {}
    };

    this.memoryItems.unshift(memoryRecord);
    if (this.memoryItems.length > 500) {
      this.memoryItems = this.memoryItems.slice(0, 500);
    }
    writeJson(MEMORY_FILE, this.memoryItems);
    return memoryRecord;
  }

  getMemoryItems(limit = 100) {
    return this.memoryItems.slice(0, limit);
  }

  // Stats & System
  getStats() {
    return {
      ...this.stats,
      activePersonaName: this.activePersona.name,
      totalPosts: this.posts.length,
      totalLogs: this.editorialLogs.length,
      totalMemoryNodes: this.memoryItems.length
    };
  }

  recordRun() {
    this.stats.totalRuns += 1;
    this.stats.lastRunTimestamp = new Date().toISOString();
    writeJson(STATS_FILE, this.stats);
  }

  setSchedulerStatus(isRunning) {
    this.stats.schedulerRunning = isRunning;
    writeJson(STATS_FILE, this.stats);
  }
}

export const db = new Database();

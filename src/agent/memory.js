/**
 * Memory Engine — SQLite-backed semantic memory
 *
 * Tracks: published posts, discovered topics, rejected topics,
 * source URLs, and fingerprints to prevent duplication.
 */

import { dbRun, dbGet, dbAll } from '../database/db.js';

// Stop words for lightweight tokenization
const STOP = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','he','in','is',
  'it','its','of','on','that','the','to','was','were','will','with','new',
  'how','why','what','who','this','but','not','have','more','also','can',
  'they','their','we','our','you','your','my','do','using','use','used'
]);

/** Tokenise a string into meaningful keywords */
function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

/** Jaccard similarity between two token arrays */
function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Create a lightweight text fingerprint (sorted top-12 keywords joined) */
export function fingerprint(text = '') {
  const tokens = [...new Set(tokenize(text))].sort();
  return tokens.slice(0, 12).join('|');
}

export class MemoryEngine {
  constructor(agentId) {
    this.agentId = agentId;
  }

  // ── Topic novelty check ────────────────────────────────────────────────────

  /**
   * Returns { isDuplicate, similarity, matchedTitle }
   * Check against both published posts AND already-evaluated topics
   */
  async checkNovelty(candidateTitle, candidateSnippet = '') {
    const candidateTokens = tokenize(`${candidateTitle} ${candidateSnippet}`);
    const fp = fingerprint(`${candidateTitle} ${candidateSnippet}`);

    // Exact fingerprint check (fastest path) - ignore PENDING as we are currently evaluating it
    const exactMatch = dbGet(
      `SELECT 1 FROM topics WHERE agent_id=? AND fingerprint=? AND status != 'PENDING' LIMIT 1`,
      [this.agentId, fp]
    );
    if (exactMatch) {
      return { isDuplicate: true, similarity: 1.0, matchedTitle: candidateTitle, reason: 'Exact fingerprint match in topic history' };
    }

    // Semantic similarity against published post content
    const recentPosts = dbAll(
      `SELECT id, text FROM posts WHERE agent_id=? ORDER BY created_at DESC LIMIT 40`,
      [this.agentId]
    );
    let maxSim = 0;
    let matchedTitle = null;
    for (const post of recentPosts) {
      const sim = jaccard(candidateTokens, tokenize(post.text));
      if (sim > maxSim) { maxSim = sim; matchedTitle = post.text.substring(0, 80); }
    }

    // Semantic similarity against memory nodes
    const memNodes = dbAll(
      `SELECT text, fingerprint FROM memory WHERE agent_id=? ORDER BY created_at DESC LIMIT 60`,
      [this.agentId]
    );
    for (const node of memNodes) {
      const sim = jaccard(candidateTokens, tokenize(node.text));
      if (sim > maxSim) { maxSim = sim; matchedTitle = node.text.substring(0, 80); }
    }

    const isDuplicate = maxSim > 0.42;
    return {
      isDuplicate,
      similarity: Math.round(maxSim * 100),
      matchedTitle: isDuplicate ? matchedTitle : null,
      reason: isDuplicate ? `${Math.round(maxSim * 100)}% semantic overlap with prior content` : null
    };
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  recordPublishedPost(post) {
    const fp = fingerprint(post.text);
    const tokens = tokenize(post.text);
    dbRun(
      `INSERT OR IGNORE INTO memory (id, agent_id, type, text, fingerprint, keywords_json, metadata_json)
       VALUES (?, ?, 'POST', ?, ?, ?, ?)`,
      [
        `mem-post-${post.id}`,
        this.agentId,
        post.text.substring(0, 200),
        fp,
        JSON.stringify(tokens.slice(0, 12)),
        JSON.stringify({ postId: post.id, sources: post.sources })
      ]
    );
  }

  recordRejectedTopic(topic, reason) {
    const fp = fingerprint(`${topic.title} ${topic.summary || ''}`);
    dbRun(
      `INSERT OR IGNORE INTO memory (id, agent_id, type, text, fingerprint, keywords_json, metadata_json)
       VALUES (?, ?, 'REJECTED_TOPIC', ?, ?, ?, ?)`,
      [
        `mem-rej-${topic.id || Date.now()}`,
        this.agentId,
        topic.title.substring(0, 200),
        fp,
        JSON.stringify(tokenize(topic.title).slice(0, 8)),
        JSON.stringify({ reason, topicId: topic.id })
      ]
    );
  }

  // ── Context ────────────────────────────────────────────────────────────────

  getContext() {
    const posts = dbAll(
      `SELECT text FROM posts WHERE agent_id=? ORDER BY created_at DESC LIMIT 10`,
      [this.agentId]
    );
    const allTokens = [];
    posts.forEach(p => allTokens.push(...tokenize(p.text).slice(0, 5)));

    const freq = {};
    allTokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    const topThemes = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t);

    return {
      hasHistory: posts.length > 0,
      totalPublished: posts.length,
      topThemes,
      recentSnippets: posts.slice(0, 3).map(p => p.text.substring(0, 100))
    };
  }

  getMemoryStats() {
    const total = dbGet(`SELECT COUNT(*) as c FROM memory WHERE agent_id=?`, [this.agentId])?.c || 0;
    const posts = dbGet(`SELECT COUNT(*) as c FROM memory WHERE agent_id=? AND type='POST'`, [this.agentId])?.c || 0;
    const rejected = dbGet(`SELECT COUNT(*) as c FROM memory WHERE agent_id=? AND type='REJECTED_TOPIC'`, [this.agentId])?.c || 0;
    const nodes = dbAll(`SELECT text, type, created_at FROM memory WHERE agent_id=? ORDER BY created_at DESC LIMIT 20`, [this.agentId]);
    return { total, posts, rejected, nodes };
  }
}

/**
 * Post Validator
 * Before any post is stored, it must pass all of these checks.
 */

import { dbGet } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export function generatePostId() {
  return `post-${uuidv4()}`;
}

export function validateTimestamp(ts) {
  if (!ts) return false;
  try {
    const d = new Date(ts);
    return !isNaN(d.getTime()) && d.toISOString() === ts;
  } catch {
    return false;
  }
}

export function validatePost(draft, agentId) {
  const errors = [];

  // 1. Non-empty text
  if (!draft.text || typeof draft.text !== 'string' || draft.text.trim().length < 50) {
    errors.push('Post text is missing or too short (minimum 50 chars)');
  }

  // 2. Valid rationale
  if (!draft.rationale || typeof draft.rationale !== 'string' || draft.rationale.trim().length < 20) {
    errors.push('Rationale is missing or too short');
  }

  // 3. At least one source
  if (!draft.sources || !Array.isArray(draft.sources) || draft.sources.length === 0) {
    errors.push('At least one source URL is required');
  }

  // 4. ID uniqueness (checked against DB)
  if (draft.id && agentId) {
    const existing = dbGet(`SELECT 1 FROM posts WHERE id=? LIMIT 1`, [draft.id]);
    if (existing) errors.push(`Post ID '${draft.id}' already exists`);
  }

  // 5. Valid ISO 8601 timestamp
  if (draft.createdAt && !validateTimestamp(draft.createdAt)) {
    errors.push('createdAt is not a valid ISO 8601 UTC timestamp');
  }

  return { valid: errors.length === 0, errors };
}

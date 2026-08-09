/**
 * Editorial Judge — 7-criteria scoring system
 *
 * Evaluates every discovered topic and decides PUBLISH or REJECT.
 * Scores each of 7 criteria 0–100, combines with weights, compares to threshold.
 * Logs every decision to the editorial_log table.
 */

import { dbRun, dbGet } from '../database/db.js';

// Technical depth signal words
const TECH_SIGNALS = [
  'vulnerability', 'cve', 'exploit', 'attack', 'injection', 'adversarial',
  'architecture', 'benchmark', 'parameter', 'inference', 'latency', 'throughput',
  'quantization', 'fine-tuning', 'rlhf', 'dpo', 'rag', 'embedding', 'retrieval',
  'transformer', 'attention', 'moe', 'mixture', 'scaling', 'emergent',
  'jailbreak', 'alignment', 'safety', 'red-team', 'prompt', 'token',
  'research', 'paper', 'arxiv', 'dataset', 'evaluation', 'ablation',
  'open-source', 'weights', 'checkpoint', 'api', 'protocol', 'framework',
  'orchestration', 'agent', 'tool', 'function', 'workflow', 'pipeline',
  'capex', 'datacenter', 'gpu', 'tpu', 'silicon', 'bandwidth', 'efficiency',
];

const GENERIC_PENALTIES = [
  'raises funding', 'series a', 'series b', 'valuation', 'ipo', 'acquisition',
  'celebrity', 'gossip', 'entertainment', 'sports', 'fashion', 'lifestyle',
  'generic ai tool', 'ai chatbot', 'ai assistant', 'announces partnership',
];

function countSignals(text, list) {
  const lower = text.toLowerCase();
  return list.filter(sig => lower.includes(sig)).length;
}

function scoreRelevance(topic, persona) {
  const topicText = `${topic.title} ${topic.summary} ${topic.sourceName}`.toLowerCase();
  const personaTopics = [...(persona.topicsCareAbout || []), ...(persona.expertise || [])];

  let hits = 0;
  for (const pt of personaTopics) {
    const words = pt.toLowerCase().split(/[\s,&/]+/).filter(w => w.length > 3);
    for (const w of words) {
      if (topicText.includes(w)) hits++;
    }
  }

  // Always give a reasonable baseline for AI/security/tech topics
  const genericAiTerms = ['ai', 'llm', 'model', 'machine learning', 'artificial intelligence',
    'security', 'vulnerability', 'cve', 'attack', 'agent', 'autonomous', 'gpt', 'gemini',
    'neural', 'deep learning', 'nlp', 'computer vision', 'language model'];
  let genericHits = genericAiTerms.filter(t => topicText.includes(t)).length;

  // Check avoidance list
  const avoidTopics = persona.topicsAvoid || [];
  for (const avoid of avoidTopics) {
    if (topicText.includes(avoid.toLowerCase())) return 15;
  }

  return Math.min(100, Math.max(35, hits * 12 + genericHits * 8 + 30));
}

function scoreNovelty(noveltyResult) {
  if (noveltyResult.isDuplicate) return 0;
  return Math.max(0, Math.min(100, 100 - noveltyResult.similarity));
}

function scoreImportance(topic) {
  const text = `${topic.title} ${topic.summary}`;
  const techCount = countSignals(text, TECH_SIGNALS);
  const genericPenalty = countSignals(text, GENERIC_PENALTIES) * 20;
  // Boost score for good sources
  const sourceBonus = ['arxiv', 'cve', 'nist', 'openai', 'anthropic', 'google', 'meta',
    'nvidia', 'mitre', 'microsoft', 'github', 'techcrunch', 'wired', 'verge'].some(
    s => (topic.url + topic.sourceName).toLowerCase().includes(s)) ? 15 : 0;
  const baseScore = Math.min(92, techCount * 14 + 25 + sourceBonus);
  return Math.max(20, baseScore - genericPenalty);
}

function scoreTimeliness(topic) {
  if (!topic.publishedAt) return 60;
  try {
    const ageDays = (Date.now() - new Date(topic.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 0.5) return 100;
    if (ageDays < 1) return 90;
    if (ageDays < 2) return 80;
    if (ageDays < 3) return 70;
    if (ageDays < 7) return 60;
    return Math.max(20, 60 - (ageDays - 7) * 3);
  } catch {
    return 55;
  }
}

function scorePersonaAlignment(topic, persona) {
  const topicText = `${topic.title} ${topic.summary}`.toLowerCase();
  const domainText = (persona.domain || '').toLowerCase();

  // Check editorial rules alignment
  const rules = persona.editorialRules || [];
  let ruleHits = 0;
  for (const rule of rules) {
    const ruleWords = rule.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    if (ruleWords.some(w => topicText.includes(w))) ruleHits++;
  }

  // Domain match
  const domainWords = domainText.split(/[\s,]+/).filter(w => w.length > 3);
  const domainHits = domainWords.filter(w => topicText.includes(w)).length;

  // Mission keyword match
  const missionWords = (persona.mission || '').toLowerCase().split(/\s+/).filter(w => w.length > 5);
  const missionHits = missionWords.filter(w => topicText.includes(w)).length;

  const score = Math.min(100, ruleHits * 15 + domainHits * 20 + missionHits * 10 + 35);
  return Math.max(30, score);
}

function scoreTechnicalValue(topic) {
  const techCount = countSignals(`${topic.title} ${topic.summary}`, TECH_SIGNALS);
  const hasUrl = (topic.url || '').length > 10;
  const hasSummary = (topic.summary || '').length > 50;
  const sourceQuality = ['arxiv', 'anthropic', 'openai', 'google', 'meta', 'nvidia', 'mitre', 'nist', 'nature'].some(
    s => (topic.url + topic.sourceName).toLowerCase().includes(s)
  ) ? 20 : 0;
  return Math.min(100, Math.max(10, techCount * 12 + (hasUrl ? 10 : 0) + (hasSummary ? 8 : 0) + sourceQuality));
}

function scoreDuplicateRisk(noveltyResult) {
  // Inverse of similarity — high similarity = high risk = low score
  return Math.max(0, 100 - noveltyResult.similarity * 2);
}

export class EditorialJudge {
  constructor(agentId) {
    this.agentId = agentId;
  }

  /**
   * Evaluate a single topic candidate.
   * @param {object} topic - discovered topic
   * @param {object} persona - active persona
   * @param {object} noveltyResult - from MemoryEngine.checkNovelty()
   * @returns {{ verdict, totalScore, criteria, reason, logId }}
   */
  evaluate(topic, persona, noveltyResult) {
    const criteria = {
      relevance:        { score: scoreRelevance(topic, persona),        weight: 0.22, label: 'Persona Relevance' },
      novelty:          { score: scoreNovelty(noveltyResult),           weight: 0.20, label: 'Content Novelty' },
      importance:       { score: scoreImportance(topic),                weight: 0.18, label: 'Topic Importance' },
      timeliness:       { score: scoreTimeliness(topic),                weight: 0.15, label: 'Timeliness' },
      personaAlignment: { score: scorePersonaAlignment(topic, persona), weight: 0.12, label: 'Persona Alignment' },
      technicalValue:   { score: scoreTechnicalValue(topic),            weight: 0.08, label: 'Technical Value' },
      duplicateRisk:    { score: scoreDuplicateRisk(noveltyResult),     weight: 0.05, label: 'Duplicate Risk' },
    };

    const totalScore = Math.round(
      Object.values(criteria).reduce((sum, c) => sum + c.score * c.weight, 0)
    );

    const threshold = persona.minScoreToPublish || persona.minScoreThreshold || 68;
    let verdict = 'PUBLISH';
    let reason = '';

    if (noveltyResult.isDuplicate) {
      verdict = 'REJECT';
      reason = `Duplicate content detected: ${noveltyResult.reason}. Skipping to protect feed quality.`;
    } else if (totalScore < threshold) {
      verdict = 'REJECT';
      const weakCriteria = Object.entries(criteria)
        .filter(([, c]) => c.score < 50)
        .map(([, c]) => `${c.label} (${c.score}/100)`)
        .slice(0, 3);
      reason = `Score ${totalScore}/100 below threshold ${threshold}/100. Weak areas: ${weakCriteria.join(', ') || 'overall low signal'}.`;
    } else {
      verdict = 'PUBLISH';
      const topCriteria = Object.entries(criteria)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 2)
        .map(([, c]) => `${c.label} (${c.score}/100)`);
      reason = `Score ${totalScore}/100 passes threshold ${threshold}/100. Strong signals: ${topCriteria.join(', ')}.`;
    }

    // Update topic status in DB
    try {
      if (topic.id) {
        dbRun(
          `UPDATE topics SET status=? WHERE id=? AND agent_id=?`,
          [verdict === 'PUBLISH' ? 'ACCEPTED' : 'REJECTED', topic.id, this.agentId]
        );
      }
    } catch { /* non-critical */ }

    // Log editorial decision
    const logId = `elog-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    try {
      dbRun(
        `INSERT INTO editorial_log (id, agent_id, topic_id, topic_title, verdict, total_score, criteria_json, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          logId,
          this.agentId,
          topic.id || null,
          topic.title,
          verdict,
          totalScore,
          JSON.stringify(Object.fromEntries(
            Object.entries(criteria).map(([k, c]) => [k, { score: c.score, weight: c.weight, label: c.label }])
          )),
          reason,
        ]
      );
    } catch { /* non-critical */ }

    return { verdict, totalScore, threshold, criteria, reason, logId };
  }
}

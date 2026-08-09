import { db } from './db.js';

// Simple tokenizer and stop words cleaner
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'new', 'how', 'why', 'what', 'who', 'show', 'shows', 'over', 'into'
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function calculateJaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }
  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

export class MemoryEngine {
  /**
   * Check if a candidate topic is too similar to past posts or recent rejections
   */
  async checkTopicNovelty(candidateTopic) {
    const candidateTokens = tokenize(`${candidateTopic.title} ${candidateTopic.snippet}`);
    const pastPosts = db.getPosts(30);
    const recentLogs = db.getEditorialLogs(30);

    let maxSimilarity = 0;
    let mostSimilarItem = null;
    let matchType = null;

    // Check past posts
    for (const post of pastPosts) {
      const postTokens = tokenize(post.content);
      const sim = calculateJaccardSimilarity(candidateTokens, postTokens);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        mostSimilarItem = {
          id: post.id,
          title: post.content.substring(0, 80) + '...',
          timestamp: post.timestamp
        };
        matchType = 'PAST_POST';
      }
    }

    // Check recent rejections
    for (const log of recentLogs) {
      if (log.verdict === 'REJECTED' && log.candidateTopic) {
        const rejTokens = tokenize(log.candidateTopic.title);
        const sim = calculateJaccardSimilarity(candidateTokens, rejTokens);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
          mostSimilarItem = {
            id: log.id,
            title: log.candidateTopic.title,
            timestamp: log.timestamp
          };
          matchType = 'RECENT_REJECTION';
        }
      }
    }

    const noveltyScore = Math.max(0, Math.min(100, Math.round((1 - maxSimilarity) * 100)));
    const isDuplicate = maxSimilarity > 0.45;

    return {
      noveltyScore,
      isDuplicate,
      maxSimilarity: Math.round(maxSimilarity * 100),
      mostSimilarItem,
      matchType
    };
  }

  /**
   * Get contextual memory summary of the persona's recent stances & top themes
   */
  getPersonaMemoryContext(personaId) {
    const pastPosts = db.getPosts(10).filter(p => !personaId || p.persona.id === personaId);
    if (!pastPosts.length) {
      return {
        hasMemory: false,
        summary: "No prior posts in memory bank. Fresh initial stance.",
        recentThemes: []
      };
    }

    const allKeywords = [];
    pastPosts.forEach(p => {
      if (p.tags) allKeywords.push(...p.tags);
      allKeywords.push(...tokenize(p.content).slice(0, 5));
    });

    // Count keyword frequency
    const freq = {};
    allKeywords.forEach(k => {
      freq[k] = (freq[k] || 0) + 1;
    });

    const topThemes = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([theme]) => theme);

    return {
      hasMemory: true,
      totalPastPosts: pastPosts.length,
      topThemes,
      recentPostSnippets: pastPosts.slice(0, 3).map(p => p.content.substring(0, 100) + '...')
    };
  }

  /**
   * Record a published post into memory index
   */
  recordPublishedMemory(post) {
    const tokens = tokenize(post.content);
    db.saveMemoryItem({
      text: post.content.substring(0, 140),
      type: 'POST_TOPIC',
      keywords: tokens.slice(0, 8),
      metadata: {
        postId: post.id,
        sources: post.sources,
        editorialScore: post.editorialScore
      }
    });
  }
}

export const memory = new MemoryEngine();

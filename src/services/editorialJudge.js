import { memory } from './memory.js';
import { db } from './db.js';

export class EditorialJudge {
  /**
   * Evaluate a candidate topic to decide if it is worth posting.
   * Produces structured score, criteria breakdown, and explicit REJECT / ACCEPT verdict.
   */
  async evaluate(candidateTopic, persona) {
    // 1. Novelty and memory check
    const noveltyCheck = await memory.checkTopicNovelty(candidateTopic);

    // 2. Alignment Check with Persona Topics
    const candidateText = `${candidateTopic.title} ${candidateTopic.snippet} ${candidateTopic.searchQuery || ''}`.toLowerCase();
    let alignmentHits = 0;
    const personaTopics = persona.topics || [];

    for (const topic of personaTopics) {
      const keywords = topic.toLowerCase().split(/[\s,&]+/);
      const matchCount = keywords.filter(kw => kw.length > 3 && candidateText.includes(kw)).length;
      if (matchCount > 0) {
        alignmentHits += matchCount;
      }
    }

    const alignmentScore = Math.min(100, Math.max(25, alignmentHits * 28 + 15));

    // 3. Substance & Technical Depth evaluation
    // Give higher score for technical terms, benchmarks, metrics, architecture terms
    const substanceIndicators = [
      'benchmark', 'architecture', 'model', 'efficiency', 'parameters', 'latency',
      'weights', 'inference', 'scaling', 'bandwidth', 'capex', 'economics', 'empirical',
      'research', 'autonomous', 'framework', 'breakthrough', 'gpu', 'cluster', 'api'
    ];
    let substanceCount = 0;
    substanceIndicators.forEach(w => {
      if (candidateText.includes(w)) substanceCount++;
    });
    const substanceScore = Math.min(100, Math.max(30, substanceCount * 22 + 20));

    // 4. Timeliness / Signal strength
    const isLiveRss = candidateTopic.url && !candidateTopic.url.includes('arxiv.org/abs/2402');
    const timelinessScore = isLiveRss ? Math.floor(Math.random() * 15) + 80 : Math.floor(Math.random() * 20) + 70;

    // Weighting
    const compositeScore = Math.round(
      (alignmentScore * 0.35) +
      (noveltyCheck.noveltyScore * 0.30) +
      (substanceScore * 0.20) +
      (timelinessScore * 0.15)
    );

    const threshold = persona.minScoreThreshold || 70;
    let verdict = 'ACCEPTED';
    let reasoning = '';

    if (noveltyCheck.isDuplicate) {
      verdict = 'REJECTED';
      reasoning = `Memory collision: Content is ${noveltyCheck.maxSimilarity}% similar to existing ${noveltyCheck.matchType} ("${noveltyCheck.mostSimilarItem?.title}"). Duplicate rejected to avoid feed spam.`;
    } else if (compositeScore < threshold) {
      verdict = 'REJECTED';
      const weakPoints = [];
      if (alignmentScore < 60) weakPoints.push(`insufficient persona alignment (${alignmentScore}/100)`);
      if (substanceScore < 55) weakPoints.push(`low technical depth/signal (${substanceScore}/100)`);
      if (noveltyCheck.noveltyScore < 60) weakPoints.push(`borderline repetition (${noveltyCheck.noveltyScore}/100 novelty)`);
      reasoning = `Score (${compositeScore}/100) failed quality bar (${threshold}/100). Reasons: ${weakPoints.join(', ') || 'Overall weak signal'}.`;
    } else {
      verdict = 'ACCEPTED';
      reasoning = `High-signal topic passing editorial bar (${compositeScore}/${threshold}). Strong domain relevance (${alignmentScore}%) and fresh novelty (${noveltyCheck.noveltyScore}%). Selected for LLM Writer synthesis.`;
    }

    const decision = {
      candidateTopic,
      sourceUrl: candidateTopic.url,
      verdict,
      score: compositeScore,
      threshold,
      reasoning,
      criteriaBreakdown: {
        alignmentScore,
        noveltyScore: noveltyCheck.noveltyScore,
        substanceScore,
        timelinessScore,
        similarityPercentage: noveltyCheck.maxSimilarity
      }
    };

    // Log decision to database for auditing
    db.logEditorialDecision(decision);

    return decision;
  }
}

export const editorialJudge = new EditorialJudge();

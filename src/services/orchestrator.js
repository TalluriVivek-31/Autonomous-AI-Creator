import EventEmitter from 'events';
import { db } from './db.js';
import { webSearch } from './webSearch.js';
import { memory } from './memory.js';
import { editorialJudge } from './editorialJudge.js';
import { llmWriter } from './llmWriter.js';

export class AgentOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.isProcessing = false;
    this.currentStage = 'IDLE'; // IDLE | SEARCHING | CHECKING_MEMORY | JUDGING | WRITING | SAVING | COMPLETE | ERROR
  }

  emitStage(stage, details = {}) {
    this.currentStage = stage;
    const eventPayload = {
      stage,
      timestamp: new Date().toISOString(),
      details
    };
    this.emit('stage_change', eventPayload);
    return eventPayload;
  }

  /**
   * Execute full Autonomous Agent Orchestration Pipeline
   */
  async runCycle(customPrompt = null) {
    if (this.isProcessing) {
      return {
        status: 'BUSY',
        message: 'An orchestration cycle is already active in progress.'
      };
    }

    this.isProcessing = true;
    const runId = `run-${Date.now()}`;
    const startTime = Date.now();

    try {
      const persona = db.getActivePersona();
      db.recordRun();

      this.emitStage('INITIALIZING', {
        runId,
        personaName: persona.name,
        handle: persona.handle,
        role: persona.role
      });

      // 1. Web Search / Live Topics
      this.emitStage('SEARCHING_TOPICS', {
        queryKeywords: persona.searchKeywords,
        topicsOfInterest: persona.topics
      });

      let candidateTopics = await webSearch.fetchLiveTopics(persona);

      // If user supplied a custom trigger prompt / topic, prioritize it
      if (customPrompt) {
        candidateTopics.unshift({
          id: `custom-${Date.now()}`,
          title: customPrompt,
          snippet: `Live user-injected breaking topic for immediate editorial evaluation: ${customPrompt}`,
          source: 'User Live Input',
          url: 'https://news.google.com',
          searchQuery: 'Manual Override'
        });
      }

      this.emitStage('TOPICS_FOUND', {
        candidateCount: candidateTopics.length,
        candidates: candidateTopics.map(c => ({ title: c.title, source: c.source }))
      });

      // 2. Memory Context Lookup
      this.emitStage('CONSULTING_MEMORY', {
        personaId: persona.id
      });
      const memoryContext = memory.getPersonaMemoryContext(persona.id);

      // 3. Editorial Judge - "Worth posting?" Evaluation Loop
      this.emitStage('EDITORIAL_JUDGING', {
        evaluatingCount: candidateTopics.length,
        threshold: persona.minScoreThreshold
      });

      const evaluatedCandidates = [];
      let selectedCandidate = null;
      let selectedDecision = null;

      for (const candidate of candidateTopics) {
        const decision = await editorialJudge.evaluate(candidate, persona);
        evaluatedCandidates.push(decision);

        this.emitStage('CANDIDATE_EVALUATED', {
          title: candidate.title,
          verdict: decision.verdict,
          score: decision.score,
          reasoning: decision.reasoning
        });

        if (decision.verdict === 'ACCEPTED' && !selectedCandidate) {
          selectedCandidate = candidate;
          selectedDecision = decision;
        }
      }

      // If all candidate topics were rejected (strict quality bar), log and complete cycle
      if (!selectedCandidate) {
        this.emitStage('CYCLE_FINISHED_NO_POST', {
          runId,
          durationMs: Date.now() - startTime,
          message: 'All candidate topics were rejected by the Editorial Judge. Preserving feed quality bar.',
          evaluatedCount: evaluatedCandidates.length
        });
        this.isProcessing = false;
        this.currentStage = 'IDLE';
        return {
          status: 'REJECTED_ALL',
          runId,
          evaluatedCandidates,
          message: 'All candidates rejected by Editorial Judge. Quality standard maintained.'
        };
      }

      // 4. LLM Writer - Persona + Memory Grounded Generation
      this.emitStage('WRITING_POST', {
        selectedTopic: selectedCandidate.title,
        editorialScore: selectedDecision.score,
        personaVoice: persona.tone
      });

      const generatedDraft = await llmWriter.generatePost(
        selectedCandidate,
        persona,
        memoryContext,
        selectedDecision
      );

      // 5. Database / Memory - Save Post & Index Memory
      this.emitStage('SAVING_TO_DATABASE', {
        title: selectedCandidate.title
      });

      const savedPost = db.savePost({
        content: generatedDraft.content,
        rationale: generatedDraft.rationale,
        sources: generatedDraft.sources,
        tags: generatedDraft.tags,
        editorialScore: selectedDecision.score
      });

      // Record in memory
      memory.recordPublishedMemory(savedPost);

      // 6. Complete and Publish
      const result = {
        status: 'SUCCESS',
        runId,
        durationMs: Date.now() - startTime,
        post: savedPost,
        editorialDecision: selectedDecision,
        evaluatedCandidates
      };

      this.emitStage('PUBLISHED_TO_FEED', {
        postId: savedPost.id,
        summary: savedPost.content.substring(0, 100) + '...',
        metrics: savedPost.metrics
      });

      this.isProcessing = false;
      this.currentStage = 'IDLE';
      return result;

    } catch (err) {
      console.error('Orchestrator error:', err);
      this.emitStage('ERROR', { error: err.message });
      this.isProcessing = false;
      this.currentStage = 'IDLE';
      throw err;
    }
  }

  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentStage: this.currentStage,
      stats: db.getStats(),
      activePersona: db.getActivePersona()
    };
  }
}

export const orchestrator = new AgentOrchestrator();

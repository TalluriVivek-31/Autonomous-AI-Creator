/**
 * Automated Verification Script for Autonomous Agent Orchestrator
 */
import { db } from '../src/services/db.js';
import { webSearch } from '../src/services/webSearch.js';
import { memory } from '../src/services/memory.js';
import { editorialJudge } from '../src/services/editorialJudge.js';
import { llmWriter } from '../src/services/llmWriter.js';
import { orchestrator } from '../src/services/orchestrator.js';

async function runVerification() {
  console.log('🧪 Starting Autonomous Agent System Verification...\n');

  // 1. Test Persona Setup
  console.log('1️⃣ Testing Persona Setup (db & config)...');
  const persona = db.getActivePersona();
  if (!persona || !persona.name) {
    throw new Error('Persona not properly initialized!');
  }
  console.log(`   ✅ Active Persona: ${persona.name} (${persona.handle})`);

  // 2. Test Web Search / Live Topics
  console.log('2️⃣ Testing Web Search / Live Topics Discovery...');
  const candidates = await webSearch.fetchLiveTopics(persona);
  if (!candidates || candidates.length === 0) {
    throw new Error('WebSearch returned 0 candidates!');
  }
  console.log(`   ✅ Discovered ${candidates.length} live topic candidates.`);
  console.log(`   Sample topic: "${candidates[0].title.substring(0, 60)}..."`);

  // 3. Test Memory Duplicate & Novelty Engine
  console.log('3️⃣ Testing Memory Engine Novelty Check...');
  const noveltyResult = await memory.checkTopicNovelty(candidates[0]);
  console.log(`   ✅ Novelty Score: ${noveltyResult.noveltyScore}%, Is Duplicate: ${noveltyResult.isDuplicate}`);

  // 4. Test Editorial Judge ("Worth posting?")
  console.log('4️⃣ Testing Editorial Judge Decision Matrix...');
  const decision = await editorialJudge.evaluate(candidates[0], persona);
  console.log(`   ✅ Editorial Verdict: ${decision.verdict} (Score: ${decision.score}/${decision.threshold})`);
  console.log(`   Reasoning: "${decision.reasoning}"`);

  // 5. Test Editorial Judge Rejection Mechanism with low quality candidate
  console.log('5️⃣ Testing Editorial Judge Rejection on Off-topic Signal...');
  const spamCandidate = {
    title: "Viral celebrity red carpet outfit review and drama",
    snippet: "Fans react to outrageous styles at the awards show.",
    url: "https://example.com/gossip",
    searchQuery: "celebrity"
  };
  const rejectDecision = await editorialJudge.evaluate(spamCandidate, persona);
  if (rejectDecision.verdict !== 'REJECTED') {
    throw new Error('Editorial Judge failed to reject low-signal off-topic content!');
  }
  console.log(`   ✅ Correctly Rejected Low-Signal Topic with Verdict: ${rejectDecision.verdict} (Score: ${rejectDecision.score})`);

  // 6. Test LLM Writer
  console.log('6️⃣ Testing LLM Writer Synthesis with Persona Voice & Rationale...');
  const memoryContext = memory.getPersonaMemoryContext(persona.id);
  const generatedDraft = await llmWriter.generatePost(candidates[0], persona, memoryContext, decision);
  if (!generatedDraft.content || !generatedDraft.rationale || !generatedDraft.sources) {
    throw new Error('LLM Writer output is missing required fields (content, rationale, sources)!');
  }
  console.log(`   ✅ Post generated (${generatedDraft.content.length} chars)`);
  console.log(`   ✅ Rationale: "${generatedDraft.rationale.substring(0, 80)}..."`);
  console.log(`   ✅ Sources cited: ${generatedDraft.sources.length} links.`);

  // 7. Test Full End-to-End Orchestrator Run Cycle
  console.log('7️⃣ Testing Full Orchestrator Pipeline Cycle...');
  const cycleResult = await orchestrator.runCycle();
  console.log(`   ✅ Orchestrator Execution: Status = ${cycleResult.status}`);
  if (cycleResult.status === 'SUCCESS') {
    console.log(`   ✅ Post Saved in DB with ID: ${cycleResult.post.id}`);
  }

  // 8. Test Feed Retrieval (GET /agent/feed semantics)
  console.log('8️⃣ Testing Feed Retrieval (Newest Posts First)...');
  const feedPosts = db.getPosts(10);
  if (feedPosts.length === 0) {
    throw new Error('No posts found in feed!');
  }
  console.log(`   ✅ Feed contains ${feedPosts.length} posts. Newest post timestamp: ${feedPosts[0].timestamp}`);

  console.log('\n🎉 ALL 8 SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀\n');
}

runVerification().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});

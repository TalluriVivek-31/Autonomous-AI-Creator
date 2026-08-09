/**
 * Radar & Real-Time Orchestrator SSE Visualizer
 */

const STAGE_TO_NODE_MAP = {
  'INITIALIZING': 'node-init',
  'SEARCHING_TOPICS': 'node-inputs',
  'TOPICS_FOUND': 'node-inputs',
  'CONSULTING_MEMORY': 'node-inputs',
  'EDITORIAL_JUDGING': 'node-judge',
  'CANDIDATE_EVALUATED': 'node-judge',
  'WRITING_POST': 'node-writer',
  'SAVING_TO_DATABASE': 'node-db',
  'PUBLISHED_TO_FEED': 'node-feed',
  'CYCLE_FINISHED_NO_POST': 'node-judge'
};

export function highlightPipelineStage(stage) {
  const label = document.getElementById('pipeline-active-stage');
  if (label) {
    label.innerText = stage || 'IDLE';
  }

  // Clear previous active states
  document.querySelectorAll('.pipeline-node').forEach(node => {
    node.classList.remove('active', 'animate-active-node');
  });

  const activeNodeId = STAGE_TO_NODE_MAP[stage];
  if (activeNodeId) {
    const node = document.getElementById(activeNodeId);
    if (node) {
      node.classList.add('active', 'animate-active-node');
    }
  }
}

export function appendTerminalLog(stage, details = {}) {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;

  const timeStr = new Date().toLocaleTimeString();
  const line = document.createElement('div');

  let stageColorClass = 'log-stage';
  let message = '';

  switch (stage) {
    case 'INITIALIZING':
      message = `Orchestration loop started for persona: ${details.personaName} (${details.role})`;
      break;
    case 'SEARCHING_TOPICS':
      message = `Querying live web signals across keywords: [${(details.queryKeywords || []).slice(0, 2).join(', ')}...]`;
      break;
    case 'TOPICS_FOUND':
      message = `Discovered ${details.candidateCount} candidate topics from live signals.`;
      break;
    case 'CONSULTING_MEMORY':
      message = `Consulting memory bank for past post collisions and persona stance continuity.`;
      break;
    case 'EDITORIAL_JUDGING':
      message = `Editorial Judge evaluating ${details.evaluatingCount} topics (Quality Bar: ${details.threshold}/100)...`;
      break;
    case 'CANDIDATE_EVALUATED':
      stageColorClass = details.verdict === 'ACCEPTED' ? 'log-success' : 'log-reject';
      message = `[${details.verdict}] Score: ${details.score}/100 - "${details.title?.substring(0, 50)}..."`;
      break;
    case 'WRITING_POST':
      message = `LLM Writer crafting post in persona voice with explicit Rationale and Citations...`;
      break;
    case 'SAVING_TO_DATABASE':
      message = `Persisting post to DB and indexing in Semantic Memory bank.`;
      break;
    case 'PUBLISHED_TO_FEED':
      stageColorClass = 'log-success';
      message = `🚀 Post published to feed successfully! ID: ${details.postId}`;
      break;
    case 'CYCLE_FINISHED_NO_POST':
      stageColorClass = 'log-reject';
      message = `Editorial Judge rejected all candidates. Strict quality bar maintained.`;
      break;
    default:
      message = JSON.stringify(details);
  }

  line.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="${stageColorClass}">${stage}</span>: ${escapeHtml(message)}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

export function renderMemoryInspector(memoryData) {
  const themesContainer = document.getElementById('memory-themes-container');
  const nodesContainer = document.getElementById('memory-nodes-container');

  if (themesContainer && memoryData?.memoryContext?.topThemes) {
    const themes = memoryData.memoryContext.topThemes;
    themesContainer.innerHTML = themes.length
      ? themes.map(t => `<span class="tag-pill" style="font-size: 12px;">#${escapeHtml(t)}</span>`).join('')
      : '<span style="font-size: 12px; color: var(--text-muted);">No themes indexed yet.</span>';
  }

  if (nodesContainer && memoryData?.recentMemoryNodes) {
    const nodes = memoryData.recentMemoryNodes;
    nodesContainer.innerHTML = nodes.length
      ? nodes.map(n => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; font-size: 12px;">
          <div style="color: #e2e8f0; margin-bottom: 4px;">${escapeHtml(n.text)}</div>
          <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
            Indexed: ${new Date(n.timestamp).toLocaleTimeString()} &bull; Keywords: ${(n.keywords || []).slice(0, 4).join(', ')}
          </div>
        </div>
      `).join('')
      : '<div style="font-size: 12px; color: var(--text-muted); padding: 10px;">No memory nodes.</div>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

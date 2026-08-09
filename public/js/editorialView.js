/**
 * Editorial Room Controller (GET /agent/editorial-logs)
 */

export function renderEditorialLogs(logs) {
  const container = document.getElementById('editorial-logs-container');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        No editorial evaluation logs recorded yet. Run the agent to see decision evaluations.
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map(log => {
    const isAccepted = log.verdict === 'ACCEPTED';
    const candidate = log.candidateTopic || { title: 'Unknown Topic' };
    const dateStr = new Date(log.timestamp).toLocaleTimeString();
    const criteria = log.criteriaBreakdown || {};

    return `
      <div class="editorial-log-item ${isAccepted ? 'accepted' : 'rejected'} animate-fade-in">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px;">
          <div>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
              ${escapeHtml(candidate.title)}
            </div>
            <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">
              Evaluated at ${dateStr} &bull; Source: ${escapeHtml(candidate.source || 'RSS Signal')}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="verdict-pill ${isAccepted ? 'accepted' : 'rejected'}">
              ${isAccepted ? '✓ ACCEPTED' : '✗ REJECTED'}
            </span>
            <div class="score-badge" style="${isAccepted ? '' : 'color: var(--accent-rose); background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.2);'}">
              Score: ${log.score}/100
            </div>
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.25); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 13px; color: #cbd5e1;">
          <strong>Judge Rationale:</strong> ${escapeHtml(log.reasoning)}
        </div>

        <!-- Multi-Criteria Breakdown -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
          <div style="background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span>Persona Fit: </span>
            <strong style="color: var(--accent-cyan);">${criteria.alignmentScore || '--'}/100</strong>
          </div>
          <div style="background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span>Novelty vs Memory: </span>
            <strong style="color: var(--accent-purple);">${criteria.noveltyScore || '--'}/100</strong>
          </div>
          <div style="background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span>Substance/Depth: </span>
            <strong style="color: var(--accent-emerald);">${criteria.substanceScore || '--'}/100</strong>
          </div>
          <div style="background: rgba(255,255,255,0.02); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span>Timeliness: </span>
            <strong style="color: var(--accent-amber);">${criteria.timelinessScore || '--'}/100</strong>
          </div>
        </div>
      </div>
    `;
  }).join('');
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

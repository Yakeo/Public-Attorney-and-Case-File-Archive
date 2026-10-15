document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('publicCasesList');
  try {
    const res = await apiRequest('/cases/public');
    const cases = res.data || [];
    if (cases.length === 0) {
      list.innerHTML = `<p class="text-muted">No public cases available.</p>`;
      return;
    }
    list.innerHTML = cases.map(c => `
      <div class="doc-card" style="margin-bottom:0.5rem;">
        <strong>${escapeHtml(c.title)}</strong>
        <span class="badge" style="margin-left:0.5rem;">${escapeHtml(c.status)}</span>
        <div class="text-muted text-xs">Case #${escapeHtml(c.case_number)} · ${escapeHtml(c.created_at ? new Date(c.created_at).toLocaleDateString() : '')}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});

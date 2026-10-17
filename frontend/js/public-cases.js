document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('publicCasesList');
  try {
    const res = await apiRequest('/cases/public');
    const cases = res.data || [];
    if (!cases.length) {
      list.innerHTML = `<p class="text-muted">No approved public summaries are available.</p>`;
      return;
    }

    list.innerHTML = cases.map((c) => `
      <article class="doc-card" style="margin-bottom:0.75rem;">
        <strong>${escapeHtml(c.title)}</strong>
        <div class="text-muted text-xs">Public case reference: ${escapeHtml(c.case_number)}</div>
        <details style="margin-top:0.65rem;">
          <summary style="cursor:pointer;">View public summary</summary>
          <p style="white-space:pre-wrap; margin-top:0.75rem;">${escapeHtml(c.summary)}</p>
          <p class="text-muted text-xs"><strong>Handling attorney:</strong> ${escapeHtml(c.handling_attorney)}</p>
          ${c.pdf_available ? `<a class="btn-secondary" href="/api/v1/cases/public/${encodeURIComponent(c.id)}/summary.pdf">Download approved public summary (PDF)</a>` : ''}
        </details>
      </article>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
});

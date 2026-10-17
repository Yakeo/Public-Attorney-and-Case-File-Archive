// Near-live search of current versions; polling avoids requiring a websocket service.
document.addEventListener('DOMContentLoaded', async () => {
  if (!await requireWorkspaceSession()) return;
  const input = document.getElementById('documentSearchInput');
  const results = document.getElementById('documentSearchResults');
  const status = document.getElementById('documentSearchStatus');
  const clear = document.getElementById('clearDocumentSearch');
  const archive = document.getElementById('documentsList');
  if (!input || !results || !status || !clear) return;
  const caseId = window.location.pathname.endsWith('/case-details.html')
    ? new URLSearchParams(window.location.search).get('id') : null;
  if (window.location.pathname.endsWith('/case-details.html') && !/^[1-9]\d*$/.test(caseId || '')) {
    status.textContent = 'Open a valid case to search its documents.';
    return;
  }
  let debounce, poll, controller, generation = 0, stopped = false;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function cancel() {
    clearTimeout(debounce); clearTimeout(poll);
    if (controller) controller.abort();
    generation++;
  }
  function idle() {
    results.innerHTML = '';
    status.textContent = 'Type to search current document versions. New scan contents become searchable after OCR finishes.';
    if (archive) archive.classList.remove('hidden');
    if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('document-search-cleared'));
  }
  async function search() {
    clearTimeout(debounce);
    clearTimeout(poll);
    const query = input.value.trim();
    if (!query || stopped || document.hidden) return;
    if (controller) controller.abort();
    controller = new AbortController();
    const ticket = ++generation;
    const params = new URLSearchParams({ q: query });
    if (caseId) params.set('case_id', caseId);
    try {
      const response = await apiRequest(`/documents/search?${params}`, 'GET', null, controller.signal);
      if (ticket !== generation || query !== input.value.trim() || stopped) return;
      const docs = response.data || [];
      if (archive) archive.classList.add('hidden');
      status.textContent = `${docs.length} matching document${docs.length === 1 ? '' : 's'}. ${docs.length === response.limit ? 'Showing the first 100; narrow your search for more specific results. ' : ''}`
        + (response.pending ? `${response.pending} document(s) still processing; new text will appear after OCR completes. ` : '')
        + 'Updates automatically every 3 seconds while this tab is visible. Current versions only.';
      results.innerHTML = docs.length ? docs.map(d => `
        <article class="doc-card">
          <strong>${escape(d.title)}</strong>
          <p class="text-muted">${escape(d.case_title)} · ${escape(d.file_name)} · Version ${escape(d.version_number)} · ${escape(d.ocr_status)}</p>
          <p class="text-muted">${Number(d.match_position) > 0 && d.ocr_status === 'COMPLETED' ? 'Matches recognized document text.' : 'Matches title or filename.'}</p>
          <div class="document-search-actions">
            <a class="btn-secondary" href="case-details.html?id=${encodeURIComponent(d.case_id)}#document-${encodeURIComponent(d.document_id)}">Open case</a>
            <button class="btn-primary btn-sm" type="button" data-search-download="${escape(d.document_id)}">Download document</button>
          </div>
        </article>`).join('') : '<p class="text-muted">No matching documents yet. Try another term or wait for pending OCR to finish.</p>';
    } catch (error) {
      if (ticket !== generation || stopped || error.name === 'AbortError') return;
      results.innerHTML = '';
      status.textContent = `Document search failed: ${error.message}. Retrying automatically.`;
    } finally {
      if (ticket === generation && !stopped && input.value.trim() && !document.hidden) poll = setTimeout(search, 3000);
    }
  }
  input.addEventListener('input', () => {
    cancel();
    // Do not leave results for an older query visible while the new one is pending.
    results.innerHTML = '';
    if (!input.value.trim()) { idle(); return; }
    if (archive) archive.classList.add('hidden');
    status.textContent = 'Searching documents…';
    debounce = setTimeout(search, 250);
  });
  clear.addEventListener('click', () => { cancel(); input.value = ''; idle(); input.focus(); });
  results.addEventListener('click', async event => {
    const button = event.target.closest('button[data-search-download]');
    if (!button) return;
    button.disabled = true;
    try { await apiDownload(`/documents/${button.dataset.searchDownload}/download`); }
    catch (error) { status.textContent = `Download failed: ${error.message}`; }
    finally { button.disabled = false; }
  });
  document.addEventListener('visibilitychange', () => { cancel(); if (!document.hidden) search(); });
  window.addEventListener('pagehide', () => { stopped = true; cancel(); });
  window.addEventListener('pageshow', () => { stopped = false; search(); });
  // A local upload/retry refresh should not have to wait for the next poll.
  window.addEventListener('documents-changed', () => { if (input.value.trim()) search(); });
});

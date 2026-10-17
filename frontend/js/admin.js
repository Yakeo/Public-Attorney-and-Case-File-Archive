document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('attorneyList');
  const form = document.getElementById('createAttorneyForm');
  const err = document.getElementById('adminError');
  const summaryForm = document.getElementById('publishSummaryForm');
  const summaryError = document.getElementById('publicSummaryError');
  const summaryList = document.getElementById('publicSummaryList');

  async function loadAttorneys() {
    if (!list) return;
    list.innerHTML = `<p class="text-muted">Loading...</p>`;
    try {
      const res = await apiRequest('/users/attorneys');
      const atts = res.data || [];
      list.innerHTML = atts.map(a => `
        <div class="doc-card" style="margin-bottom:0.5rem;">
          <strong>${escapeHtml(a.full_name)}</strong> <span class="badge">${escapeHtml(a.specialization)}</span>
          <div class="text-muted text-xs">${escapeHtml(a.email)} ${a.bar_number ? '· ' + escapeHtml(a.bar_number) : ''}</div>
        </div>
      `).join('') || `<p class="text-muted">No attorneys.</p>`;
    } catch (e) {
      list.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
    }
  }

  async function loadPublicSummaries() {
    if (!summaryList) return;
    summaryList.innerHTML = `<p class="text-muted">Loading...</p>`;
    try {
      const res = await apiRequest('/cases/public-summaries/manage');
      const summaries = res.data || [];
      summaryList.innerHTML = summaries.map((s) => `
        <div class="doc-card" style="margin-bottom:0.5rem;">
          <strong>${escapeHtml(s.title)}</strong>
          <div class="text-muted text-xs">Case ${escapeHtml(s.id)} · v${escapeHtml(s.version)} · ${escapeHtml(s.handling_attorney || 'Handling attorney not available')} · ${s.published ? 'Published' : 'Unpublished'}</div>
          ${s.published ? `<button type="button" class="btn-secondary" data-unpublish-case="${escapeHtml(s.id)}">Unpublish</button>` : ''}
        </div>
      `).join('') || `<p class="text-muted">No public-summary versions yet.</p>`;
    } catch (e) {
      summaryList.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (err) err.classList.add('hidden');
      const payload = {
        fname: document.getElementById('fname').value.trim(),
        lname: document.getElementById('lname').value.trim(),
        email: document.getElementById('email').value.trim(),
        username: document.getElementById('username').value.trim() || undefined,
        password: document.getElementById('password').value.trim() || undefined,
        specialization_id: Number(document.getElementById('specialization_id').value) || 1,
        bar_number: document.getElementById('bar_number').value.trim() || undefined
      };
      try {
        await apiRequest('/users', 'POST', payload);
        form.reset();
        loadAttorneys();
      } catch (e2) {
        if (err) { err.textContent = e2.message; err.classList.remove('hidden'); }
      }
    });
  }

  if (summaryForm) {
    summaryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (summaryError) summaryError.classList.add('hidden');
      const caseId = document.getElementById('summaryCaseId').value.trim();
      const file = document.getElementById('summaryPdf').files[0];
      if (!file || file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
        showSummaryError('Please select a PDF file.');
        return;
      }

      const formData = new FormData();
      formData.append('public_title', document.getElementById('summaryPublicTitle').value.trim());
      formData.append('handling_attorney_id', document.getElementById('summaryHandlingAttorney').value.trim());
      formData.append('summary_text', document.getElementById('summaryText').value.trim());
      formData.append('summary_pdf', file);

      try {
        const token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
        const response = await fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/public-summary`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
        summaryForm.reset();
        await loadPublicSummaries();
        if (summaryError) {
          summaryError.textContent = data.message || 'Summary published.';
          summaryError.classList.remove('hidden');
          summaryError.classList.remove('error-banner');
          summaryError.classList.add('success-banner');
        }
      } catch (e2) {
        showSummaryError(e2.message);
      }
    });
  }

  if (summaryList) {
    summaryList.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-unpublish-case]');
      if (!button) return;
      const caseId = button.dataset.unpublishCase;
      if (!window.confirm(`Unpublish the public summary for case ${caseId}?`)) return;
      try {
        await apiRequest(`/cases/${encodeURIComponent(caseId)}/public-summary`, 'DELETE');
        await loadPublicSummaries();
      } catch (e2) {
        showSummaryError(e2.message);
      }
    });
  }

  function showSummaryError(message) {
    if (!summaryError) return;
    summaryError.textContent = message;
    summaryError.classList.remove('hidden', 'success-banner');
    summaryError.classList.add('error-banner');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  await Promise.all([loadAttorneys(), loadPublicSummaries()]);
});

document.addEventListener('DOMContentLoaded', async () => {
  let token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
  if (!token) {
    token = 'mock-jwt-token-xyz123';
    localStorage.setItem('jwtToken', token);
    localStorage.setItem('token', token);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('id') || '101';

  const caseHeaderCard = document.getElementById('caseHeaderCard');
  const caseMetaDetails = document.getElementById('caseMetaDetails');
  const hearingsList = document.getElementById('hearingsList');
  const documentsList = document.getElementById('documentsList');

  const uploadModal = document.getElementById('uploadModal');
  const openUploadModalBtn = document.getElementById('openUploadModalBtn');
  const closeUploadModalBtn = document.getElementById('closeUploadModalBtn');
  const uploadDocForm = document.getElementById('uploadDocForm');
  const uploadError = document.getElementById('uploadError');
  const submitUploadBtn = document.getElementById('submitUploadBtn');

  initCaseView();

  async function initCaseView() {
    try {
      const [caseRes, docsRes, hearingsRes] = await Promise.all([
        apiRequest(`/cases/${caseId}`),
        apiRequest(`/documents?case_id=${caseId}`),
        apiRequest(`/hearings?case_id=${caseId}`)
      ]);

      renderHeader(caseRes.data);
      renderMeta(caseRes.data);
      renderHearings(hearingsRes.data || []);
      renderDocuments(docsRes.data || []);
    } catch (err) {
      if (caseHeaderCard) caseHeaderCard.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderHeader(c) {
    if (!caseHeaderCard) return;
    caseHeaderCard.innerHTML = `
      <div class="card-header-flex">
        <div>
          <span class="case-number">${escapeHtml(c.case_number)}</span>
          <h2>${escapeHtml(c.title)}</h2>
        </div>
        <span class="status-tag status-${(c.status || '').toLowerCase()}">${escapeHtml(c.status || 'Active')}</span>
      </div>
    `;
  }

  function renderMeta(c) {
    if (!caseMetaDetails) return;
    caseMetaDetails.innerHTML = `
      <div class="detail-group">
        <label>Client Name</label>
        <p>${escapeHtml(c.client_name || 'Unspecified')}</p>
      </div>
      <div class="detail-group">
        <label>Description / Notes</label>
        <p>${escapeHtml(c.description || 'No detailed summary provided.')}</p>
      </div>
      <div class="detail-group">
        <label>Date Registered</label>
        <p>${new Date(c.created_at || Date.now()).toLocaleDateString()}</p>
      </div>
    `;
  }

  function renderHearings(hearings) {
    if (!hearingsList) return;
    if (hearings.length === 0) {
      hearingsList.innerHTML = `<p class="text-muted">No upcoming hearings scheduled.</p>`;
      return;
    }

    hearingsList.innerHTML = hearings.map(h => `
      <div class="hearing-item">
        <div class="hearing-date">${new Date(h.scheduled_date).toLocaleString()}</div>
        <div class="hearing-location">📍 ${escapeHtml(h.location || 'Courtroom Unassigned')}</div>
        <p class="hearing-notes">${escapeHtml(h.notes || '')}</p>
      </div>
    `).join('');
  }

  function renderDocuments(docs) {
    if (!documentsList) return;
    if (docs.length === 0) {
      documentsList.innerHTML = `<p class="text-muted">No documents uploaded to this file yet.</p>`;
      return;
    }

    documentsList.innerHTML = docs.map(d => `
      <div class="doc-card">
        <div class="doc-header">
          <strong>${escapeHtml(d.title)}</strong>
          <a href="#" class="btn-link">View File ↗</a>
        </div>
        ${d.ocr_text ? `
          <details class="ocr-container">
            <summary class="ocr-toggle">View Extracted OCR Text</summary>
            <pre class="ocr-text">${escapeHtml(d.ocr_text)}</pre>
          </details>
        ` : `<span class="text-muted text-xs">No OCR text extracted</span>`}
      </div>
    `).join('');
  }

  if (openUploadModalBtn) {
    openUploadModalBtn.addEventListener('click', () => {
      if (uploadError) uploadError.classList.add('hidden');
      if (uploadDocForm) uploadDocForm.reset();
      if (uploadModal) uploadModal.classList.remove('hidden');
    });
  }

  if (closeUploadModalBtn) {
    closeUploadModalBtn.addEventListener('click', () => {
      if (uploadModal) uploadModal.classList.add('hidden');
    });
  }

  if (uploadDocForm) {
    uploadDocForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (uploadError) uploadError.classList.add('hidden');
      if (submitUploadBtn) {
        submitUploadBtn.disabled = true;
        submitUploadBtn.textContent = 'Uploading & Parsing OCR...';
      }

      try {
        if (uploadModal) uploadModal.classList.add('hidden');
        initCaseView();
      } catch (err) {
        if (uploadError) {
          uploadError.textContent = err.message;
          uploadError.classList.remove('hidden');
        }
      } finally {
        if (submitUploadBtn) {
          submitUploadBtn.disabled = false;
          submitUploadBtn.textContent = 'Upload & Extract Text';
        }
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
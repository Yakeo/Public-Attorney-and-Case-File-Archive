document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('id') || '101';

  const caseHeaderCard = document.getElementById('caseHeaderCard');
  const caseMetaDetails = document.getElementById('caseMetaDetails');
  const hearingsList = document.getElementById('hearingsList');
  const documentsList = document.getElementById('documentsList');
  const attorneysList = document.getElementById('attorneysList');
  const clientsList = document.getElementById('clientsList');
  const attorneySelect = document.getElementById('attorneySelect');
  const clientSelect = document.getElementById('clientSelect');
  const assignAttorneyForm = document.getElementById('assignAttorneyForm');
  const linkClientForm = document.getElementById('linkClientForm');

  const uploadModal = document.getElementById('uploadModal');
  const openUploadModalBtn = document.getElementById('openUploadModalBtn');
  const refreshDocumentsBtn = document.getElementById('refreshDocumentsBtn');
  const closeUploadModalBtn = document.getElementById('closeUploadModalBtn');
  const uploadDocForm = document.getElementById('uploadDocForm');
  const uploadError = document.getElementById('uploadError');
  const submitUploadBtn = document.getElementById('submitUploadBtn');

  let pollTimer;
  let pollCount = 0;
  let revisionDocumentId = null;
  window.addEventListener('pagehide', () => clearTimeout(pollTimer));

  initCaseView();

  async function initCaseView() {
    try {
      const user = await apiRequest('/auth/me');
      if (![1, 3].includes(user.data.role_id)) {
        if (assignAttorneyForm) assignAttorneyForm.style.display = 'none';
        if (linkClientForm) linkClientForm.style.display = 'none';
      }
      const [caseRes, docsRes, hearingsRes, attsRes, clientsRes, allAttRes, allCliRes] = await Promise.all([
        apiRequest(`/cases/${caseId}`),
        apiRequest(`/documents?case_id=${caseId}`),
        apiRequest(`/hearings?case_id=${caseId}`),
        apiRequest(`/cases/${caseId}/attorneys`).catch(() => ({ data: [] })),
        apiRequest(`/cases/${caseId}/clients`).catch(() => ({ data: [] })),
        apiRequest(`/users/attorneys`).catch(() => ({ data: [] })),
        apiRequest(`/clients`).catch(() => ({ data: [] }))
      ]);

      renderHeader(caseRes.data);
      renderMeta(caseRes.data);
      renderHearings(hearingsRes.data || []);
      renderDocuments(docsRes.data || []);
      scheduleRefresh(docsRes.data || []);
      renderAttorneys(attsRes.data || []);
      renderClients(clientsRes.data || []);
      populateAttorneySelect(allAttRes.data || []);
      populateClientSelect(allCliRes.data || []);
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
        <strong>${escapeHtml(h.title || h.hearing_type || 'Hearing')}</strong>
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
          <button type="button" class="btn-link" data-action="download" data-id="${escapeHtml(d.id)}">Download ↗</button>
          <button type="button" class="btn-link" data-action="revision" data-id="${escapeHtml(d.id)}">Upload revision</button>
        </div>
        <p class="text-muted text-xs">Text extraction: ${escapeHtml(d.ocr_status || 'PENDING')} · Version ${escapeHtml(d.version_number || 1)}</p>
        ${d.ocr_status === 'FAILED' ? `<p class="error-text">${escapeHtml(d.ocr_error || 'Extraction failed.')}</p><button type="button" class="btn-link" data-action="retry" data-id="${escapeHtml(d.id)}" data-version="${escapeHtml(d.version_number)}">Retry extraction</button>` : ''}
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
      revisionDocumentId = null;
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
        submitUploadBtn.textContent = 'Uploading...';
      }

      try {
        const file = document.getElementById('docFileInput').files[0];
        if (!file) throw new Error('Select a document first.');
        const data = new FormData();
        data.append('document', file);
        data.append('case_id', caseId);
        data.append('title', document.getElementById('docTitleInput').value.trim());
        const endpoint = revisionDocumentId
          ? `/documents/${revisionDocumentId}/versions` : '/documents/upload';
        await apiRequest(endpoint, 'POST', data);
        if (uploadModal) uploadModal.classList.add('hidden');
        pollCount = 0;
        await refreshDocuments().catch(error => showToast(error.message, 'error'));
        showToast('Document saved. Text extraction will run in the background.', 'success');
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

  if (refreshDocumentsBtn) refreshDocumentsBtn.addEventListener('click', async () => {
    refreshDocumentsBtn.disabled = true;
    pollCount = 0;
    try { await refreshDocuments(); } catch (error) { showToast(error.message, 'error'); }
    finally { refreshDocumentsBtn.disabled = false; }
  });

  async function refreshDocuments() {
    const response = await apiRequest(`/documents?case_id=${caseId}`);
    renderDocuments(response.data || []);
    scheduleRefresh(response.data || []);
  }
  function scheduleRefresh(documents) {
    clearTimeout(pollTimer);
    if (documents.some(d => ['PENDING', 'PROCESSING'].includes(d.ocr_status)) && pollCount < 48) {
      pollTimer = setTimeout(async () => {
        pollCount++;
        try { await refreshDocuments(); }
        catch (error) { showToast(error.message, 'error'); }
      }, 2500);
    }
  }
  if (documentsList) documentsList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id, version } = button.dataset;
    button.disabled = true;
    try {
      if (action === 'download') await apiDownload(`/documents/${id}/download`);
      if (action === 'retry') {
        await apiRequest(`/documents/${id}/versions/${version}/retry`, 'POST', {});
        pollCount = 0;
        await refreshDocuments();
      }
      if (action === 'revision') {
        revisionDocumentId = id;
        uploadDocForm.reset();
        uploadError.classList.add('hidden');
        uploadModal.classList.remove('hidden');
      }
    } catch (error) { showToast(error.message, 'error'); }
    finally { button.disabled = false; }
  });

  function renderAttorneys(attorneys) {
    if (!attorneysList) return;
    if (!attorneys.length) {
      attorneysList.innerHTML = `<p class="text-muted">No counsel assigned yet.</p>`;
      return;
    }
    attorneysList.innerHTML = attorneys.map(a => `
      <div class="doc-card" style="margin-bottom:0.5rem;">
        <strong>${escapeHtml(a.fname)} ${escapeHtml(a.lname)}</strong>
        <span class="badge" style="margin-left:0.5rem;">${escapeHtml(a.role_on_case || 'Counsel')}</span>
        <div class="text-muted text-xs">${escapeHtml(a.specialization_name || '')} ${a.bar_number ? '· ' + escapeHtml(a.bar_number) : ''}</div>
        <div class="text-muted text-xs">Assigned: ${escapeHtml(a.assigned_date || '')}</div>
      </div>
    `).join('');
  }

  function renderClients(clients) {
    if (!clientsList) return;
    if (!clients.length) {
      clientsList.innerHTML = `<p class="text-muted">No clients linked yet.</p>`;
      return;
    }
    clientsList.innerHTML = clients.map(c => `
      <div class="doc-card" style="margin-bottom:0.5rem;">
        <strong>${escapeHtml(c.fname)} ${escapeHtml(c.lname || '')}</strong>
        <span class="badge" style="margin-left:0.5rem;">${escapeHtml(c.client_role || 'Client')}</span>
        <div class="text-muted text-xs">${escapeHtml(c.email || '')} ${c.contact_number ? '· ' + escapeHtml(c.contact_number) : ''}</div>
      </div>
    `).join('');
  }

  function populateAttorneySelect(attorneys) {
    if (!attorneySelect) return;
    attorneySelect.innerHTML = `<option value="">Select attorney...</option>` +
      attorneys.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.full_name)} (${escapeHtml(a.specialization || '')})</option>`).join('');
  }

  function populateClientSelect(clients) {
    if (!clientSelect) return;
    clientSelect.innerHTML = `<option value="">Select client...</option>` +
      clients.map(c => `<option value="${escapeHtml(c.client_id)}">${escapeHtml(c.fname)} ${escapeHtml(c.lname || '')}</option>`).join('');
  }

  if (assignAttorneyForm) {
    assignAttorneyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const attorney_id = attorneySelect ? attorneySelect.value : '';
      const role_on_case = document.getElementById('roleOnCaseInput') ? document.getElementById('roleOnCaseInput').value.trim() : '';
      if (!attorney_id) return;
      try {
        await apiRequest(`/cases/${caseId}/attorneys`, 'POST', { attorney_id, role_on_case });
        await initCaseView();
      } catch (err) {
        showToast(err.message || 'Failed to assign attorney.', 'error');
      }
    });
  }

  if (linkClientForm) {
    linkClientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client_id = clientSelect ? clientSelect.value : '';
      const client_role = document.getElementById('clientRoleInput') ? document.getElementById('clientRoleInput').value.trim() : '';
      if (!client_id) return;
      try {
        await apiRequest(`/clients/${client_id}/cases`, 'POST', { cf_code: caseId, client_role });
        await initCaseView();
      } catch (err) {
        showToast(err.message || 'Failed to link client.', 'error');
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
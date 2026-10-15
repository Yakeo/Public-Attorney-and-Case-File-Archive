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
  const attorneysList = document.getElementById('attorneysList');
  const clientsList = document.getElementById('clientsList');
  const attorneySelect = document.getElementById('attorneySelect');
  const clientSelect = document.getElementById('clientSelect');
  const assignAttorneyForm = document.getElementById('assignAttorneyForm');
  const linkClientForm = document.getElementById('linkClientForm');

  const uploadModal = document.getElementById('uploadModal');
  const openUploadModalBtn = document.getElementById('openUploadModalBtn');
  const closeUploadModalBtn = document.getElementById('closeUploadModalBtn');
  const uploadDocForm = document.getElementById('uploadDocForm');
  const uploadError = document.getElementById('uploadError');
  const submitUploadBtn = document.getElementById('submitUploadBtn');

  initCaseView();

  async function initCaseView() {
    try {
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
          <a href="/api/v1/documents/${escapeHtml(d.id)}/download" class="btn-link" target="_blank">Download ↗</a>
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
        initCaseView();
      } catch (err) {
        alert(err.message || 'Failed to assign attorney.');
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
        initCaseView();
      } catch (err) {
        alert(err.message || 'Failed to link client.');
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
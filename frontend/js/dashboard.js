document.addEventListener('DOMContentLoaded', async () => {
  // Ensure local session token exists for standalone dev testing
  let token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
  if (!token) {
    token = 'mock-jwt-token-xyz123';
    localStorage.setItem('jwtToken', token);
    localStorage.setItem('token', token);
  }

  // DOM Elements
  const userDisplayName = document.getElementById('userDisplayName');
  const casesTableBody = document.getElementById('casesTableBody');
  const caseCountBadge = document.getElementById('caseCountBadge');
  const dashSearchInput = document.getElementById('caseSearchInput');
  const dashStatusFilter = document.getElementById('caseStatusSelect');

  // Stats Elements
  const statActiveCases = document.getElementById('statActiveCases');
  const statPendingHearings = document.getElementById('statPendingHearings');
  const statTotalDocs = document.getElementById('statTotalDocs');

  // Side Drawer Elements
  const btnCreateCase = document.getElementById('btnCreateCase');
  const drawer = document.getElementById('createCaseDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const closeBtn = document.getElementById('closeCaseDrawerBtn');
  const cancelBtn = document.getElementById('cancelDrawerBtn');
  const createCaseForm = document.getElementById('createCaseForm');
  const drawerErrorBanner = document.getElementById('drawerErrorBanner');

  let localCases = [];

  initDashboard();

  async function initDashboard() {
    try {
      // Add checkAuthState here so the navbar syncs immediately on load
      if (typeof checkAuthState === 'function') {
        checkAuthState();
      }

      const userRes = await apiRequest('/auth/me');
      if (userRes.data) {
        const fullName = userRes.data.full_name || 'Clara Vance';
        if (userDisplayName) userDisplayName.textContent = `Atty. ${fullName}`;

        const avatarCircle = document.querySelector('.avatar-circle');
        if (avatarCircle) {
          const initials = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          avatarCircle.textContent = initials || 'CV';
        }
      }

      await refreshCases();
    } catch (err) {
      console.warn('Dashboard initialization warning:', err);
    }
  }

  async function refreshCases() {
    try {
      const response = await apiRequest('/cases');
      localCases = response.data || [];

      updateStats(localCases);
      renderCasesTable(localCases);
    } catch (err) {
      if (casesTableBody) {
        casesTableBody.innerHTML = `<tr><td colspan="6" class="text-center error-text">Failed to load cases: ${escapeHtml(err.message)}</td></tr>`;
      }
    }
  }

  function updateStats(cases) {
    const active = cases.filter(c => c.status === 'Active').length;
    const pending = cases.filter(c => c.status === 'Pending').length;

    if (statActiveCases) statActiveCases.textContent = active;
    if (statPendingHearings) statPendingHearings.textContent = pending;
    if (statTotalDocs) statTotalDocs.textContent = cases.reduce((acc, c) => acc + (c.document_count || 0), 0);
  }

  function renderCasesTable(cases) {
    if (!casesTableBody) return;

    const query = dashSearchInput ? dashSearchInput.value.toLowerCase().trim() : '';
    const statusFilter = dashStatusFilter ? dashStatusFilter.value : 'All';

    const filtered = cases.filter(c => {
      const matchesQuery = (c.case_number && c.case_number.toLowerCase().includes(query)) || 
                           (c.title && c.title.toLowerCase().includes(query)) || 
                           (c.client_name && c.client_name.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    if (caseCountBadge) {
      caseCountBadge.textContent = `${filtered.length} Cases`;
    }

    if (filtered.length === 0) {
      casesTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted">No cases found matching your filters.</td>
        </tr>
      `;
      return;
    }

    casesTableBody.innerHTML = filtered.map(c => `
      <tr>
        <td class="font-mono text-amber">${escapeHtml(c.case_number)}</td>
        <td class="font-semibold">${escapeHtml(c.title)}</td>
        <td>${escapeHtml(c.client_name || 'N/A')}</td>
        <td><span class="status-tag status-${(c.status || '').toLowerCase()}">${escapeHtml(c.status || 'Active')}</span></td>
        <td>${new Date(c.created_at || Date.now()).toLocaleDateString()}</td>
        <td>
          <a href="case-details.html?id=${c.id}" class="btn-table-action">Open File →</a>
        </td>
      </tr>
    `).join('');
  }

  if (dashSearchInput) dashSearchInput.addEventListener('input', () => renderCasesTable(localCases));
  if (dashStatusFilter) dashStatusFilter.addEventListener('change', () => renderCasesTable(localCases));

  // --- Drawer Control Functions ---
  function openDrawer() {
    if (!drawer || !backdrop) return;
    if (drawerErrorBanner) drawerErrorBanner.classList.add('hidden');
    if (createCaseForm) createCaseForm.reset();

    drawer.classList.add('open');
    backdrop.classList.add('active');
    backdrop.classList.remove('hidden');
    document.body.classList.add('drawer-open');
  }

  function closeDrawer() {
    if (!drawer || !backdrop) return;
    drawer.classList.remove('open');
    backdrop.classList.remove('active');
    document.body.classList.remove('drawer-open');
    setTimeout(() => backdrop.classList.add('hidden'), 350);
  }

  if (btnCreateCase) btnCreateCase.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (cancelBtn) cancelBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  if (createCaseForm) {
    createCaseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (drawerErrorBanner) drawerErrorBanner.classList.add('hidden');

      const payload = {
        case_number: document.getElementById('caseNumberInput').value.trim(),
        title: document.getElementById('caseTitleInput').value.trim(),
        client_name: document.getElementById('clientNameInput').value.trim(),
        status: document.getElementById('caseStatusSelectInput').value,
        description: document.getElementById('caseDescriptionInput') ? document.getElementById('caseDescriptionInput').value.trim() : ''
      };

      try {
        await apiRequest('/cases', 'POST', payload);
        closeDrawer();
        await refreshCases();
      } catch (err) {
        if (drawerErrorBanner) {
          drawerErrorBanner.textContent = err.message || 'Failed to create new case file.';
          drawerErrorBanner.classList.remove('hidden');
        }
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
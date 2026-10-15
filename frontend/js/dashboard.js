document.addEventListener('DOMContentLoaded', async () => {
  // Ensure local session token exists for standalone dev testing
  // DOM Elements
  const userDisplayName = document.getElementById('userDisplayName');
  const casesTableBody = document.getElementById('casesTableBody');
  const caseCountBadge = document.getElementById('caseCountBadge');
  const dashSearchInput = document.getElementById('caseSearchInput');
  const dashStatusFilter = document.getElementById('caseStatusSelect');
  const dashCategoryFilter = document.getElementById('caseCategorySelect');
  const dashPriorityFilter = document.getElementById('casePrioritySelect');

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
        const adminLink = document.querySelector('a[href="admin.html"]');
        if (adminLink && userRes.data.role_id !== 1) adminLink.style.display = 'none';
        const clientsLink = document.querySelector('a[href="clients.html"]');
        const createBtn = document.getElementById('btnCreateCase');
        const isStaffOrAdmin = userRes.data.role_id === 1 || userRes.data.role_id === 3;
        if (clientsLink && !isStaffOrAdmin) clientsLink.style.display = 'none';
        if (createBtn && !isStaffOrAdmin) createBtn.style.display = 'none';
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
      const params = new URLSearchParams();
      const q = dashSearchInput ? dashSearchInput.value.trim() : '';
      const status = dashStatusFilter ? dashStatusFilter.value : 'All';
      const category = dashCategoryFilter ? dashCategoryFilter.value : 'All';
      const priority = dashPriorityFilter ? dashPriorityFilter.value : 'All';
      if (q) params.append('q', q);
      if (status && status !== 'All') params.append('status', status);
      if (category && category !== 'All') params.append('category', category);
      if (priority && priority !== 'All') params.append('priority', priority);

      const endpoint = params.toString() ? `/cases?${params.toString()}` : '/cases';
      const response = await apiRequest(endpoint);
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

    const filtered = cases;

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

  if (dashSearchInput) dashSearchInput.addEventListener('input', () => refreshCases());
  if (dashStatusFilter) dashStatusFilter.addEventListener('change', () => refreshCases());
  if (dashCategoryFilter) dashCategoryFilter.addEventListener('change', () => refreshCases());
  if (dashPriorityFilter) dashPriorityFilter.addEventListener('change', () => refreshCases());

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


  const categorySelectInput = document.getElementById('caseCategorySelectInput');
  const caseNumberPreview = document.getElementById('caseNumberPreview');
  const catCodes = { '1': 'CIV', '2': 'CRM', '3': 'CORP' };
  function updateCaseNumberPreview() {
    if (!caseNumberPreview || !categorySelectInput) return;
    const code = catCodes[categorySelectInput.value] || 'CASE';
    const year = new Date().getFullYear();
    caseNumberPreview.value = `${code}-${year}-XXXX`;
  }
  if (categorySelectInput) {
    categorySelectInput.addEventListener('change', updateCaseNumberPreview);
    updateCaseNumberPreview();
  }

  if (createCaseForm) {
    createCaseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (drawerErrorBanner) drawerErrorBanner.classList.add('hidden');

      const categoryId = document.getElementById('caseCategorySelectInput') ? document.getElementById('caseCategorySelectInput').value : '1';
      const payload = {
        title: document.getElementById('caseTitleInput').value.trim(),
        client_name: document.getElementById('clientNameInput').value.trim(),
        status: document.getElementById('caseStatusSelectInput').value,
        category_id: Number(categoryId),
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
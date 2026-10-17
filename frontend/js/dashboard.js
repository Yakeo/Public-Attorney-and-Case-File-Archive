document.addEventListener('DOMContentLoaded', async () => {
  if (!await requireWorkspaceSession()) return;
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
  const caseClientMode = document.getElementById('caseClientMode');
  const existingCaseClientGroup = document.getElementById('existingCaseClientGroup');
  const existingCaseClient = document.getElementById('existingCaseClient');
  const caseClientOptionsStatus = document.getElementById('caseClientOptionsStatus');
  const newCaseClientFields = document.getElementById('newCaseClientFields');
  const caseClientRoleGroup = document.getElementById('caseClientRoleGroup');
  let clientOptionsLoaded = false;

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
        if (createBtn) createBtn.style.display = [1, 2, 3].includes(Number(userRes.data.role_id)) ? '' : 'none';
        if (userDisplayName) userDisplayName.textContent = `${userRes.data.role_id === 2 ? 'Atty. ' : ''}${fullName}`;

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

  async function loadCaseClientOptions() {
    if (!existingCaseClient || clientOptionsLoaded) return;
    if (caseClientOptionsStatus) caseClientOptionsStatus.textContent = 'Loading clients...';
    try {
      const response = await apiRequest('/cases/client-options');
      const clients = response.data || [];
      existingCaseClient.innerHTML = '<option value="">Select a client...</option>' + clients.map(client => {
        const fullName = [client.fname, client.mname, client.lname].filter(Boolean).join(' ');
        return `<option value="${escapeHtml(client.client_id)}">${escapeHtml(fullName)}</option>`;
      }).join('');
      existingCaseClient.disabled = clients.length === 0;
      if (caseClientOptionsStatus) caseClientOptionsStatus.textContent = clients.length
        ? `${clients.length} client${clients.length === 1 ? '' : 's'} available.`
        : 'No clients are registered yet. Choose “Add a new client” instead.';
      clientOptionsLoaded = true;
    } catch (error) {
      if (caseClientOptionsStatus) caseClientOptionsStatus.textContent = error.message || 'Could not load clients.';
      clientOptionsLoaded = false;
    }
  }

  function updateClientIntakeMode() {
    const mode = caseClientMode ? caseClientMode.value : '';
    if (existingCaseClientGroup) existingCaseClientGroup.hidden = mode !== 'existing';
    if (newCaseClientFields) newCaseClientFields.hidden = mode !== 'new';
    if (caseClientRoleGroup) caseClientRoleGroup.hidden = !['existing', 'new'].includes(mode);
    if (existingCaseClient) existingCaseClient.required = mode === 'existing';
    if (newCaseClientFields) {
      for (const input of newCaseClientFields.querySelectorAll('input')) {
        input.required = mode === 'new' && input.dataset.required === 'true';
      }
    }
    if (mode === 'existing') loadCaseClientOptions();
  }

  if (caseClientMode) caseClientMode.addEventListener('change', updateClientIntakeMode);
  updateClientIntakeMode();

  // --- Drawer Control Functions ---
  function openDrawer() {
    if (!drawer || !backdrop) return;
    if (drawerErrorBanner) drawerErrorBanner.classList.add('hidden');
    if (createCaseForm) createCaseForm.reset();
    updateClientIntakeMode();

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
  const catCodes = { '1': 'CIVIL', '2': 'CRIMINAL', '3': 'CORPORATE', '4': 'FAMILY', '5': 'LABOR', '6': 'PROPERTY', '7': 'TAX', '8': 'IP', '9': 'IMMIGRATION', '10': 'ADMIN', '11': 'ENVIRONMENTAL' };
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
        status: document.getElementById('caseStatusSelectInput').value,
        category_id: Number(categoryId),
        description: document.getElementById('caseDescriptionInput') ? document.getElementById('caseDescriptionInput').value.trim() : ''
      };
      const clientMode = caseClientMode ? caseClientMode.value : 'later';
      const clientRole = document.getElementById('caseClientRole')?.value.trim() || null;
      if (clientMode === 'existing') {
        payload.client_id = existingCaseClient ? existingCaseClient.value : '';
        if (!payload.client_id) {
          if (drawerErrorBanner) {
            drawerErrorBanner.textContent = 'Choose an existing client, or switch to “Add a new client.”';
            drawerErrorBanner.classList.remove('hidden');
          }
          return;
        }
        payload.client_role = clientRole;
      } else if (clientMode === 'new') {
        payload.new_client = {
          fname: document.getElementById('newClientFname').value.trim(),
          mname: document.getElementById('newClientMname').value.trim() || null,
          lname: document.getElementById('newClientLname').value.trim(),
          birth_date: document.getElementById('newClientBirthDate').value,
          gender: document.getElementById('newClientGender').value.trim() || null,
          email: document.getElementById('newClientEmail').value.trim() || null,
          contact_number: document.getElementById('newClientPhone').value.trim() || null,
          purok: document.getElementById('newClientPurok').value.trim() || null,
          barangay: document.getElementById('newClientBarangay').value.trim() || null,
          city: document.getElementById('newClientCity').value.trim() || null,
          region: document.getElementById('newClientRegion').value.trim() || null
        };
        payload.client_role = clientRole;
      }

      try {
        const response = await apiRequest('/cases', 'POST', payload);
        closeDrawer();
        showToast(response.data?.client_id ? 'Case and client saved successfully.' : 'Case created successfully.', 'success');
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
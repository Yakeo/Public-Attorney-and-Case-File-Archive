document.addEventListener('DOMContentLoaded', () => {
  const landingSearchInput = document.getElementById('landingSearchInput');
  const landingSpecialtySelect = document.getElementById('landingSpecialtySelect');
  const btnLandingSearch = document.getElementById('btnLandingSearch');
  const attorneyGrid = document.getElementById('attorneyGrid');

  // Load directory on page load
  loadAttorneys();

  // Search Button Click Listener
  if (btnLandingSearch) {
    btnLandingSearch.addEventListener('click', () => {
      const query = landingSearchInput ? landingSearchInput.value.trim() : '';
      const specialty = landingSpecialtySelect ? landingSpecialtySelect.value : 'All';
      loadAttorneys(query, specialty);
    });
  }

  // Trigger search on Enter key in input
  if (landingSearchInput) {
    landingSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = landingSearchInput.value.trim();
        const specialty = landingSpecialtySelect ? landingSpecialtySelect.value : 'All';
        loadAttorneys(query, specialty);
      }
    });
  }

  async function loadAttorneys(query = '', specialty = 'All') {
    renderLoading();

    try {
      let endpoint = '/users/attorneys';
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (specialty !== 'All') params.append('specialty', specialty);

      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const response = await apiRequest(endpoint);
      let attorneys = response.data || [];

      // Filter locally for mock testing
      if (query || specialty !== 'All') {
        attorneys = attorneys.filter(a => {
          const matchQ = !query || a.full_name.toLowerCase().includes(query.toLowerCase()) || a.specialization.toLowerCase().includes(query.toLowerCase());
          const matchS = specialty === 'All' || a.specialization.toLowerCase() === specialty.toLowerCase();
          return matchQ && matchS;
        });
      }

      renderAttorneyCards(attorneys);
    } catch (err) {
      renderError(err.message || 'Failed to load attorney directory.');
    }
  }

  function renderAttorneyCards(attorneys) {
    if (!attorneyGrid) return;

    if (attorneys.length === 0) {
      attorneyGrid.innerHTML = `
        <div class="empty-state text-center" style="grid-column: 1 / -1; padding: 3rem;">
          <p class="text-muted">No attorneys found matching your criteria.</p>
        </div>
      `;
      return;
    }

    attorneyGrid.innerHTML = attorneys.map(attorney => `
      <div class="card attorney-card" data-id="${attorney.id}">
        <div class="avatar-circle">
          ${getInitials(attorney.full_name || attorney.email)}
        </div>
        <div class="attorney-info">
          <h3>Atty. ${escapeHtml(attorney.full_name || 'Legal Counsel')}</h3>
          <span class="badge">${escapeHtml(attorney.specialization || 'General Practice')}</span>
          <p class="bio">${escapeHtml(attorney.bio || 'No public bio provided.')}</p>
          <a href="attorney-profile.html?id=${attorney.id}" class="btn-link">View Profile & Cases →</a>
        </div>
      </div>
    `).join('');
  }

  function renderLoading() {
    if (attorneyGrid) {
      attorneyGrid.innerHTML = `<div class="text-center text-muted" style="grid-column: 1 / -1; padding: 3rem;">Loading directory...</div>`;
    }
  }

  function renderError(message) {
    if (attorneyGrid) {
      attorneyGrid.innerHTML = `<div class="error-banner" style="grid-column: 1 / -1;">${escapeHtml(message)}</div>`;
    }
  }

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
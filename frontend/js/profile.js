// js/profile.js
document.addEventListener('DOMContentLoaded', () => {
  const profileHeader = document.getElementById('profileHeader');
  const profileDetails = document.getElementById('profileDetails');
  const publicCasesList = document.getElementById('publicCasesList');
  const navBackBtn = document.getElementById('navBackBtn');

  // Dynamic Back Button Routing (Dashboard vs Landing Page)
  const token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
  if (navBackBtn) {
    if (token) {
      navBackBtn.textContent = '← Back to Workspace';
      navBackBtn.href = 'dashboard.html';
    } else {
      navBackBtn.textContent = '← Back to Directory';
      navBackBtn.href = 'index.html#directory';
    }
  }

  // Extract ?id= parameter from URL
  const urlParams = new URLSearchParams(window.location.search);
  const attorneyId = urlParams.get('id') || '1';

  loadAttorneyProfile(attorneyId);

  async function loadAttorneyProfile(id) {
    try {
      // Fetch attorney profile & public cases
      const [userRes, casesRes] = await Promise.all([
        apiRequest(`/users/${id}`),
        apiRequest(`/cases/public?attorney_id=${id}`).catch(() => ({ data: [] }))
      ]);

      const attorney = userRes.data || {};
      
      // Ensure cases is always treated as an array to prevent .map() crashes
      let publicCases = [];
      if (Array.isArray(casesRes.data)) {
        publicCases = casesRes.data;
      } else if (Array.isArray(casesRes)) {
        publicCases = casesRes;
      }

      renderHeader(attorney);
      renderDetails(attorney);
      renderCases(publicCases);
    } catch (err) {
      showError(err.message || 'Failed to load attorney profile.');
    }
  }

  function renderHeader(attorney) {
    if (!profileHeader) return;
    profileHeader.innerHTML = `
      <div class="profile-hero">
        <div class="avatar-circle large">
          ${getInitials(attorney.full_name || attorney.email || 'PA')}
        </div>
        <div class="hero-details">
          <h2>Atty. ${escapeHtml(attorney.full_name || 'Legal Counsel')}</h2>
          <span class="badge">${escapeHtml(attorney.specialization || 'General Practice')}</span>
          <p class="email-text">${escapeHtml(attorney.email || 'contact@pacfas.gov')}</p>
        </div>
      </div>
    `;
  }

  function renderDetails(attorney) {
    if (!profileDetails) return;
    profileDetails.innerHTML = `
      <div class="detail-group">
        <label>Bar License / Registration No.</label>
        <p>${escapeHtml(attorney.bar_number || 'N/A')}</p>
      </div>
      <div class="detail-group">
        <label>Primary Specialization</label>
        <p>${escapeHtml(attorney.specialization || 'General Practice')}</p>
      </div>
      <div class="detail-group">
        <label>Biography</label>
        <p class="bio-full">${escapeHtml(attorney.bio || 'No public bio provided.')}</p>
      </div>
    `;
  }

  function renderCases(cases) {
    if (!publicCasesList) return;

    if (!Array.isArray(cases) || cases.length === 0) {
      publicCasesList.innerHTML = `<p class="text-muted" style="padding: 1rem 0;">No public case records found for this attorney.</p>`;
      return;
    }

    publicCasesList.innerHTML = cases.map(c => `
      <div class="case-item-card" style="background: var(--bg-card); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 1rem;">
        <div class="case-item-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span class="font-mono text-amber">${escapeHtml(c.case_number)}</span>
          <span class="status-tag status-${(c.status || '').toLowerCase()}">${escapeHtml(c.status || 'Active')}</span>
        </div>
        <h4>${escapeHtml(c.title)}</h4>
        <p class="case-summary text-muted" style="font-size: 0.88rem; margin-top: 0.35rem;">${escapeHtml(c.description || 'No public summary available.')}</p>
      </div>
    `).join('');
  }

  function showError(msg) {
    if (profileHeader) profileHeader.innerHTML = `<div class="error-banner">${escapeHtml(msg)}</div>`;
  }

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
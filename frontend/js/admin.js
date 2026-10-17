document.addEventListener('DOMContentLoaded', async () => {
  if (!await requireWorkspaceSession()) return;
  const list = document.getElementById('attorneyList');
  const form = document.getElementById('createAttorneyForm');
  const err = document.getElementById('adminError');

  async function load() {
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
        load();
      } catch (e2) {
        if (err) { err.textContent = e2.message; err.classList.remove('hidden'); }
      }
    });
  }

  load();

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});

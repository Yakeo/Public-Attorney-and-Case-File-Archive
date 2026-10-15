document.addEventListener('DOMContentLoaded', async () => {
  const clientsList = document.getElementById('clientsList');
  const form = document.getElementById('createClientForm');
  const err = document.getElementById('clientError');

  async function loadClients() {
    if (!clientsList) return;
    clientsList.innerHTML = `<p class="text-muted">Loading...</p>`;
    try {
      const res = await apiRequest('/clients');
      const clients = res.data || [];
      if (clients.length === 0) {
        clientsList.innerHTML = `<p class="text-muted">No clients yet.</p>`;
        return;
      }
      clientsList.innerHTML = clients.map(c => `
        <div class="doc-card" style="margin-bottom:0.5rem;">
          <strong>${escapeHtml(c.fname)} ${escapeHtml(c.lname || '')}</strong>
          <div class="text-muted text-xs">${escapeHtml(c.email || '')} ${c.contact_number ? '· ' + escapeHtml(c.contact_number) : ''}</div>
          <div class="text-muted text-xs">${escapeHtml(c.city || '')} ${c.region ? ', ' + escapeHtml(c.region) : ''}</div>
        </div>
      `).join('');
    } catch (e) {
      clientsList.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (err) err.classList.add('hidden');
      const payload = {
        fname: document.getElementById('fname').value.trim(),
        lname: document.getElementById('lname').value.trim(),
        birth_date: document.getElementById('birth_date').value,
        email: document.getElementById('email').value.trim() || null,
        contact_number: document.getElementById('contact_number').value.trim() || null,
        city: document.getElementById('city').value.trim() || null,
        region: document.getElementById('region').value.trim() || null
      };
      try {
        await apiRequest('/clients', 'POST', payload);
        form.reset();
        loadClients();
      } catch (e2) {
        if (err) { err.textContent = e2.message; err.classList.remove('hidden'); }
      }
    });
  }

  loadClients();

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});

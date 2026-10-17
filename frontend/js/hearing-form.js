document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('hearingModal');
  const form = document.getElementById('hearingForm');
  if (!modal || !form) return;
  const error = document.getElementById('hearingError');
  const button = document.getElementById('saveHearingBtn');
  document.getElementById('openHearingModalBtn').addEventListener('click', async () => {
    form.reset(); error.classList.add('hidden'); modal.classList.remove('hidden');
    try {
      const user = await apiRequest('/auth/me');
      document.getElementById('hearingOverrideLabel').classList.toggle('hidden', user.data.role_id !== 1);
    } catch (e) { error.textContent = e.message; error.classList.remove('hidden'); }
  });
  document.getElementById('closeHearingModalBtn').addEventListener('click', () => modal.classList.add('hidden'));
  form.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true; error.classList.add('hidden');
    try {
      await apiRequest('/hearings', 'POST', {
        case_id: new URLSearchParams(window.location.search).get('id'),
        title: document.getElementById('hearingTitle').value.trim(),
        hearing_date: document.getElementById('hearingDate').value.replace('T', ' '),
        venue: document.getElementById('hearingVenue').value.trim(),
        remarks: document.getElementById('hearingNotes').value.trim(),
        override_conflict: document.getElementById('hearingOverride').checked
      });
      window.location.reload();
    } catch (e) { error.textContent = e.message; error.classList.remove('hidden'); }
    finally { button.disabled = false; }
  });
});

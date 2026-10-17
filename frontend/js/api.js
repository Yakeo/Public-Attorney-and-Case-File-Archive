// Shared JSON/multipart API client. Keep requests on the application's origin.
const API_BASE = '/api/v1';
function authHeaders() {
  const token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = authHeaders();
  const options = { method, headers };
  if (body && method !== 'GET') {
    if (body instanceof FormData) options.body = body; // Browser supplies multipart boundary.
    else { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}
async function apiDownload(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, { headers: authHeaders() });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename="([^"]+)"/i.exec(disposition);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = match ? match[1] : 'document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

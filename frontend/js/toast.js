(function () {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;';
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('toastContainer')) document.body.appendChild(container);
  });

  window.showToast = function (message, type = 'info') {
    const t = document.createElement('div');
    t.textContent = message;
    t.style.cssText = `padding:0.75rem 1rem;border-radius:8px;color:#fff;font-size:0.9rem;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,0.15);background:${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#2563eb'};opacity:0;transition:opacity 0.2s;`;
    (document.getElementById('toastContainer') || document.body).appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, 3000);
  };
})();

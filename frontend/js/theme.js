// Apply saved theme immediately before DOM renders (Defaults to Light)
(function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');

  function updateToggleUI(theme) {
    if (!themeIcon || !themeText) return;
    if (theme === 'light') {
      themeIcon.textContent = '☀️';
      themeText.textContent = 'Light';
    } else {
      themeIcon.textContent = '🌙';
      themeText.textContent = 'Dark';
    }
  }

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  updateToggleUI(currentTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = activeTheme === 'light' ? 'dark' : 'light';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateToggleUI(newTheme);
    });
  }
});
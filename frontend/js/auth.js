document.addEventListener('DOMContentLoaded', () => {
  const openLoginBtn = document.getElementById('openLoginBtn');
  const closeLoginBtn = document.getElementById('closeLoginBtn');
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  checkAuthState();

  if (openLoginBtn) {
    openLoginBtn.addEventListener('click', () => {
      if (loginError) loginError.classList.add('hidden');
      if (loginForm) loginForm.reset();
      if (loginModal) loginModal.classList.remove('hidden');
    });
  }

  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      if (loginModal) loginModal.classList.add('hidden');
    });
  }

  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        loginModal.classList.add('hidden');
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginError) loginError.classList.add('hidden');

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      try {
        const response = await apiRequest('/auth/login', 'POST', { email, password });

        if (response.token) {
          localStorage.setItem('jwtToken', response.token);
          localStorage.setItem('token', response.token);
          
          if (response.user) {
            localStorage.setItem('userData', JSON.stringify(response.user));
          }

          if (loginModal) loginModal.classList.add('hidden');
          window.location.href = 'dashboard.html';
        }
      } catch (err) {
        if (loginError) {
          loginError.textContent = err.message || 'Invalid email or password.';
          loginError.classList.remove('hidden');
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logoutUser();
    });
  }
});

function checkAuthState() {
  const token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
  const openLoginBtn = document.getElementById('openLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (token) {
    if (openLoginBtn) openLoginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (openLoginBtn) openLoginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

function logoutUser() {
  localStorage.removeItem('jwtToken');
  localStorage.removeItem('token');
  localStorage.removeItem('userData');
  window.location.href = 'index.html';
}
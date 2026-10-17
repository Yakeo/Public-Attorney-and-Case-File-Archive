// Server-validated identity; never authorize from localStorage user labels/JWT claims.
const privatePageRoles = {
  'dashboard.html': [1, 2, 3], 'case-details.html': [1, 2, 3],
  'clients.html': [1, 3], 'admin.html': [1]
};
const currentPage = window.location.pathname.split('/').pop();
const requiredRoles = privatePageRoles[currentPage];
let verifiedProfile = null;
function clearSession() {
  for (const key of ['jwtToken', 'token', 'userData']) localStorage.removeItem(key);
}
const workspaceSession = (async () => {
  const token = localStorage.getItem('jwtToken') || localStorage.getItem('token');
  if (!token) {
    if (requiredRoles) window.location.replace('index.html?login=1');
    return null;
  }
  try {
    const response = await apiRequest('/auth/me');
    const user = response.data;
    if (!user || ![1, 2, 3].includes(Number(user.role_id))) {
      if (requiredRoles) window.location.replace('index.html?login=1&reason=staff');
      return null;
    }
    if (requiredRoles && !requiredRoles.includes(Number(user.role_id))) {
      window.location.replace('dashboard.html');
      return null;
    }
    verifiedProfile = user;
    localStorage.setItem('userData', JSON.stringify(user));
    document.documentElement.classList.remove('auth-pending');
    return user;
  } catch (error) {
    if (error.status === 401 || error.status === 403) clearSession();
    if (requiredRoles) window.location.replace('index.html?login=1&reason=session');
    return null;
  }
})();
function requireWorkspaceSession() { return workspaceSession; }

document.addEventListener('DOMContentLoaded', () => {
  const openLoginBtn = document.getElementById('openLoginBtn');
  const closeLoginBtn = document.getElementById('closeLoginBtn');
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  workspaceSession.then(() => {
    checkAuthState();
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === '1' && openLoginBtn) openLoginBtn.click();
  });

  const workspaceLink = document.querySelector('a[href="dashboard.html"]');
  if (workspaceLink && loginModal) workspaceLink.addEventListener('click', async event => {
    event.preventDefault();
    const user = await workspaceSession;
    if (user) window.location.href = 'dashboard.html';
    else openLoginBtn.click();
  });

  if (openLoginBtn) {
    openLoginBtn.addEventListener('click', () => {
      if (loginError) loginError.classList.add('hidden');
      if (loginForm) loginForm.reset();
      if (loginModal) {
        loginModal.classList.remove('hidden');
        document.getElementById('loginEmail').focus();
      }
    });
  }

  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      if (loginModal) loginModal.classList.add('hidden');
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && loginModal) loginModal.classList.add('hidden');
  });

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
          if (!response.user || ![1, 2, 3].includes(Number(response.user.role_id))) {
            throw new Error('The workspace is restricted to staff, attorneys, and administrators.');
          }
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

  if (token && verifiedProfile) {
    if (openLoginBtn) openLoginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (openLoginBtn) openLoginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

function logoutUser() {
  clearSession();
  window.location.href = 'index.html';
}
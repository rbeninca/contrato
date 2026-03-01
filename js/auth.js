function waitForFirebase(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.AppFirebase?.ready) {
        clearInterval(timer);
        resolve(window.AppFirebase);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(window.AppFirebase?.error || 'Firebase indisponível.'));
      }
    }, 100);
  });
}

function setAuthStatus(text) {
  const el = document.getElementById('auth-status');
  if (el) el.textContent = text;
}

function setAuthButtons(isLogged) {
  const loginBtn = document.getElementById('btn-login');
  const logoutBtn = document.getElementById('btn-logout-auth');
  if (loginBtn) loginBtn.disabled = isLogged;
  if (logoutBtn) logoutBtn.disabled = !isLogged;
}

async function loginWithGoogle() {
  const fb = await waitForFirebase();
  const provider = new fb.GoogleAuthProvider();
  await fb.signInWithPopup(fb.auth, provider);
}

async function logoutAuth() {
  const fb = await waitForFirebase();
  await fb.signOut(fb.auth);
}

async function initAuthUi() {
  try {
    const fb = await waitForFirebase();

    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout-auth');

    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        try {
          await loginWithGoogle();
        } catch (error) {
          alert(error.message || 'Falha no login.');
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await logoutAuth();
        } catch (error) {
          alert(error.message || 'Falha no logout.');
        }
      });
    }

    fb.onAuthStateChanged(fb.auth, async (user) => {
      if (user) {
        setAuthStatus(`Auth: ${user.email || user.uid}`);
        setAuthButtons(true);
      } else {
        setAuthStatus('Auth: desconectado');
        setAuthButtons(false);
      }

      if (typeof window.handleFirebaseAuthChanged === 'function') {
        await window.handleFirebaseAuthChanged(user || null);
      }
    });
  } catch (error) {
    setAuthStatus('Auth: indisponível');
    setAuthButtons(false);
  }
}

initAuthUi();

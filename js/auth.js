import { state } from './state.js';
import { showToast, closeAuthModal, switchAuthTab, openAuthModal } from './render.js';

export function initAuthEvents() {
  const overlay = document.getElementById('auth-modal-overlay');
  const closeBtn = document.getElementById('close-auth-modal-btn');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabSignup = document.getElementById('auth-tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const switchToSignup = document.getElementById('switch-to-signup');
  const switchToLogin = document.getElementById('switch-to-login');

  closeBtn?.addEventListener('click', closeAuthModal);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeAuthModal();
  });

  tabLogin?.addEventListener('click', () => switchAuthTab('login'));
  tabSignup?.addEventListener('click', () => switchAuthTab('signup'));
  switchToSignup?.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('signup'); });
  switchToLogin?.addEventListener('click', (e) => { e.preventDefault(); switchAuthTab('login'); });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    const result = await state.login(email, password);
    submitBtn.disabled = false;

    if (result.ok) {
      showToast(`Welcome back, ${result.user.name.split(' ')[0]}!`, 'success');
      closeAuthModal();
    } else {
      showToast(result.error, 'error');
    }
  });

  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const submitBtn = signupForm.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    const result = await state.signup(name, email, password);
    submitBtn.disabled = false;

    if (result.ok) {
      showToast(`Welcome to EasyBuy, ${result.user.name.split(' ')[0]}!`, 'success');
      closeAuthModal();
    } else {
      showToast(result.error, 'error');
    }
  });
}

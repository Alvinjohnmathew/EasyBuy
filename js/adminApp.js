import { state } from './state.js';
import { updateUI, renderAdminDashboard, openAdminProductModal, showToast } from './render.js';
import { initAdminEvents } from './admin.js';

const loginView = document.getElementById('admin-login-view');
const dashboardView = document.getElementById('admin-view');
const logoutBtn = document.getElementById('admin-logout-btn');
const loginForm = document.getElementById('admin-login-form');

let dashboardInitialized = false;

function showLoginView() {
  loginView?.classList.remove('hidden');
  dashboardView?.classList.add('hidden');
  logoutBtn?.classList.add('hidden');
}

async function showDashboardView() {
  loginView?.classList.add('hidden');
  dashboardView?.classList.remove('hidden');
  logoutBtn?.classList.remove('hidden');

  const loaded = await state.initAdminFromServer();
  if (!loaded) {
    showLoginView();
    showToast('Could not load the admin dashboard. Please sign in again.', 'error');
    return;
  }

  if (!dashboardInitialized) {
    initAdminEvents();

    const closeAdminProductBtn = document.getElementById('close-admin-product-btn');
    const adminProductModalOverlay = document.getElementById('admin-product-modal-overlay');
    const adminAddProductBtn = document.getElementById('admin-add-product-btn');

    closeAdminProductBtn?.addEventListener('click', () => {
      adminProductModalOverlay?.classList.add('hidden');
    });
    // Intentionally no click-outside-to-close here: this form can hold a lot
    // of entered data (title, price, colors, sizes, uploaded photos), and an
    // accidental click on the dark backdrop was silently discarding all of
    // it with no warning. Closing now requires the explicit Cancel or × button.
    adminAddProductBtn?.addEventListener('click', () => {
      openAdminProductModal(null);
    });

    state.subscribe(() => {
      if (state.isAdmin) renderAdminDashboard();
    });

    dashboardInitialized = true;
  }

  renderAdminDashboard();
}

document.addEventListener('DOMContentLoaded', async () => {
  const isAdmin = await state.checkAdminSession();
  if (isAdmin) {
    await showDashboardView();
  } else {
    showLoginView();
  }
});

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');

  submitBtn.disabled = true;
  const result = await state.adminLogin(username, password);
  submitBtn.disabled = false;

  if (result.ok) {
    loginForm.reset();
    await showDashboardView();
  } else {
    showToast(result.error, 'error');
  }
});

logoutBtn?.addEventListener('click', async () => {
  await state.adminLogout();
  showLoginView();
});

import { state } from './state.js';
import { showToast, renderProductImagesPreview, renderAdminDashboard, openAdminProductModal } from './render.js';

function freshElement(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  return clone;
}

// Called once by adminApp.js after a successful login / session check.
export function initAdminEvents() {
  initPhotoUpload();
  initProductFormSave();
  initWhatsAppImport();
  initTabs();
  initSettingsForm();
  loadAnalytics();
}

// ================= MULTI-PHOTO UPLOAD =================

function initPhotoUpload() {
  const fileInput = freshElement('prod-images-file');
  if (!fileInput) return;

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach(f => formData.append('images', f));

    try {
      const res = await fetch('/api/admin/upload-images', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Upload failed', 'error');
        return;
      }
      const hiddenField = document.getElementById('prod-images-data');
      const current = JSON.parse(hiddenField?.value || '[]');
      renderProductImagesPreview([...current, ...data.imageUrls]);
      showToast('Photos uploaded!', 'success');
    } catch (e) {
      showToast('Upload failed. Please check your connection.', 'error');
    }
    fileInput.value = '';
  });
}

// ================= PRODUCT FORM SAVE (Add / Edit) =================

function initProductFormSave() {
  const form = freshElement('admin-product-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productId = document.getElementById('admin-form-product-id').value;
    const title = document.getElementById('prod-title').value.trim();
    const category = document.getElementById('prod-category').value;
    const subcategory = (document.getElementById('prod-subcategory')?.value || '').trim();
    const stock = Number(document.getElementById('prod-stock').value);
    const price = Number(document.getElementById('prod-price').value);
    const originalPrice = Number(document.getElementById('prod-original-price').value);
    const colors = document.getElementById('prod-colors').value;
    const sizes = document.getElementById('prod-sizes')?.value || '';
    const description = document.getElementById('prod-desc').value.trim();
    const images = JSON.parse(document.getElementById('prod-images-data')?.value || '[]');

    if (price > originalPrice) {
      showToast('Selling price cannot exceed the original MRP price!', 'error');
      return;
    }
    if (images.length === 0) {
      showToast('Please upload at least one product photo', 'error');
      return;
    }

    const productFields = {
      title, category, subcategory, stock, price, originalPrice, colors, sizes,
      images,
      image: images[0],
      description
    };

    const submitBtn = document.getElementById('btn-save-product');
    submitBtn.disabled = true;

    try {
      const url = productId ? `/api/admin/products/${encodeURIComponent(productId)}` : '/api/admin/products';
      const method = productId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productFields)
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to save product', 'error');
        return;
      }

      showToast(productId ? 'Product updated successfully!' : 'Product added to inventory!', 'success');
      document.getElementById('admin-product-modal-overlay')?.classList.add('hidden');
      await state.initAdminFromServer(); // refreshes state + triggers re-render via subscription
    } catch (e) {
      showToast('Failed to save product. Please check your connection.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('btn-cancel-product')?.addEventListener('click', () => {
    document.getElementById('admin-product-modal-overlay')?.classList.add('hidden');
  });
}

// ================= WHATSAPP CATALOG IMPORT =================

function initWhatsAppImport() {
  const openBtn = document.getElementById('admin-import-whatsapp-btn');
  const overlay = document.getElementById('whatsapp-import-modal-overlay');
  const fileInput = document.getElementById('whatsapp-catalog-file');
  const previewContainer = document.getElementById('whatsapp-import-preview');
  const previewBtn = document.getElementById('preview-whatsapp-import-btn');
  const commitBtn = document.getElementById('commit-whatsapp-import-btn');
  const closeBtn = document.getElementById('close-whatsapp-import-btn');
  const cancelBtn = document.getElementById('cancel-whatsapp-import-btn');

  if (!openBtn || !overlay) return;

  let currentToken = null;
  let currentProducts = [];

  function resetModal() {
    currentToken = null;
    currentProducts = [];
    if (fileInput) fileInput.value = '';
    if (previewContainer) previewContainer.innerHTML = '';
    if (commitBtn) commitBtn.disabled = true;
  }

  openBtn.addEventListener('click', () => {
    resetModal();
    overlay.classList.remove('hidden');
  });

  const close = () => overlay.classList.add('hidden');
  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  previewBtn?.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      showToast('Please choose your WhatsApp chat ZIP file first', 'error');
      return;
    }

    previewBtn.disabled = true;
    previewContainer.innerHTML = '<p class="input-helper">Reading your WhatsApp export…</p>';

    const formData = new FormData();
    formData.append('catalog', file);

    try {
      const res = await fetch('/api/admin/import-whatsapp-catalog/preview', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        previewContainer.innerHTML = '';
        showToast(data.error || 'Could not read this ZIP', 'error');
        return;
      }

      currentToken = data.token;
      currentProducts = data.products;
      renderWhatsAppPreview();
      commitBtn.disabled = currentProducts.length === 0;
    } catch (e) {
      previewContainer.innerHTML = '';
      showToast('Upload failed. Please check your connection.', 'error');
    } finally {
      previewBtn.disabled = false;
    }
  });

  function renderWhatsAppPreview() {
    if (currentProducts.length === 0) {
      previewContainer.innerHTML = '<p class="input-helper">No products found in this export.</p>';
      return;
    }

    previewContainer.innerHTML = `
      <p class="input-helper" style="margin-bottom: 10px;">
        Found ${currentProducts.length} product${currentProducts.length === 1 ? '' : 's'}. Uncheck anything you don't want to import.
      </p>
      ${currentProducts.map(p => `
        <label class="custom-checkbox" style="display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); margin-bottom:8px;">
          <input type="checkbox" class="wa-import-checkbox" data-preview-id="${p.previewId}" checked style="position:static; opacity:1; width:16px; height:16px;">
          <div style="flex-grow:1;">
            <strong>${p.title}</strong>
            <div style="font-size:12px; color:var(--text-muted);">
              ₹${p.price.toLocaleString()} · ${p.category}${p.subcategory ? ' - ' + p.subcategory : ''} · ${p.hasImage ? 'Photo ✓' : 'No photo found'}
            </div>
          </div>
        </label>
      `).join('')}
    `;
  }

  commitBtn?.addEventListener('click', async () => {
    if (!currentToken) return;

    const selectedIds = Array.from(previewContainer.querySelectorAll('.wa-import-checkbox:checked'))
      .map(cb => cb.getAttribute('data-preview-id'));

    if (selectedIds.length === 0) {
      showToast('Select at least one product to import', 'error');
      return;
    }

    commitBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/import-whatsapp-catalog/commit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken, previewIds: selectedIds })
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Import failed', 'error');
        commitBtn.disabled = false;
        return;
      }

      showToast(`Imported ${data.importedCount} product${data.importedCount === 1 ? '' : 's'}!${data.imagesSkipped ? ` (${data.imagesSkipped} photo(s) too large, skipped)` : ''}`, 'success');
      close();
      await state.initAdminFromServer();
    } catch (e) {
      showToast('Import failed. Please check your connection.', 'error');
      commitBtn.disabled = false;
    }
  });
}

// ================= TABS =================

function initTabs() {
  const tabs = [
    ['tab-products-btn', 'tab-products-content'],
    ['tab-orders-btn', 'tab-orders-content'],
    ['tab-settings-btn', 'tab-settings-content'],
    ['tab-analytics-btn', 'tab-analytics-content']
  ];

  tabs.forEach(([btnId]) => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      tabs.forEach(([id, contentId]) => {
        const isActive = id === btnId;
        document.getElementById(id)?.classList.toggle('active', isActive);
        document.getElementById(contentId)?.classList.toggle('hidden', !isActive);
      });
      if (btnId === 'tab-analytics-btn') loadAnalytics();
    });
  });
}

// ================= SETTINGS =================

function initSettingsForm() {
  const form = document.getElementById('admin-settings-form');
  const upiInput = document.getElementById('settings-upi-id');
  const payeeInput = document.getElementById('settings-payee-name');

  const settings = state.getPaymentSettings?.();
  if (settings) {
    if (upiInput) upiInput.value = settings.upiId || '';
    if (payeeInput) payeeInput.value = settings.payeeName || '';
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payeeName = payeeInput.value.trim();
    const upiId = upiInput.value.trim();

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payeeName, upiId })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to save settings', 'error');
        return;
      }
      showToast('Store settings saved successfully!', 'success');
      await state.initAdminFromServer();
    } catch (e) {
      showToast('Failed to save settings. Please check your connection.', 'error');
    }
  });
}

// ================= ANALYTICS =================

async function loadAnalytics() {
  const grid = document.getElementById('analytics-dashboard-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/admin/analytics', { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) {
      grid.innerHTML = `<p class="input-helper">${data.error || 'Failed to load analytics'}</p>`;
      return;
    }

    const avgOrderValue = data.orderCount > 0 ? (data.totalSales / data.orderCount) : 0;

    grid.innerHTML = `
      <div class="metric-card sales">
        <div class="metric-info">
          <h4>Total Sales</h4>
          <div class="metric-value">₹${data.totalSales.toLocaleString()}</div>
        </div>
        <i class="fa-solid fa-indian-rupee-sign metric-icon"></i>
      </div>
      <div class="metric-card orders">
        <div class="metric-info">
          <h4>Total Orders</h4>
          <div class="metric-value">${data.orderCount}</div>
        </div>
        <i class="fa-solid fa-box-open metric-icon"></i>
      </div>
      <div class="metric-card products">
        <div class="metric-info">
          <h4>Avg. Order Value</h4>
          <div class="metric-value">₹${avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <i class="fa-solid fa-chart-line metric-icon"></i>
      </div>
    `;
  } catch (e) {
    grid.innerHTML = '<p class="input-helper">Failed to load analytics. Please check your connection.</p>';
  }
}

document.getElementById('refresh-analytics-btn')?.addEventListener('click', loadAnalytics);

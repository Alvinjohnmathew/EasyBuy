import { state } from './state.js';
import { showToast, renderProductImagesPreview, renderAdminDashboard, openAdminProductModal } from './render.js';

const ADMIN_PRODUCT_DRAFT_KEY = 'eb_admin_product_draft';

function freshElement(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  return clone;
}

function getProductDraftKey(productId) {
  return `${ADMIN_PRODUCT_DRAFT_KEY}_${productId || 'new'}`;
}

function loadProductDraft(productId) {
  const key = getProductDraftKey(productId);
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveProductDraft(productId, draft) {
  const key = getProductDraftKey(productId);
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    console.warn('Could not save product draft:', e);
  }
}

function clearProductDraft(productId) {
  const key = getProductDraftKey(productId);
  try {
    localStorage.removeItem(key);
  } catch {}
}

function collectProductDraft(productId) {
  const title = document.getElementById('prod-title')?.value || '';
  const category = document.getElementById('prod-category')?.value || 'Gadgets';
  const subcategory = document.getElementById('prod-subcategory')?.value || '';
  const stock = document.getElementById('prod-stock')?.value || '';
  const price = document.getElementById('prod-price')?.value || '';
  const originalPrice = document.getElementById('prod-original-price')?.value || '';
  const colors = document.getElementById('prod-colors')?.value || '';
  const sizes = document.getElementById('prod-sizes')?.value || '';
  const description = document.getElementById('prod-desc')?.value || '';
  const images = JSON.parse(document.getElementById('prod-images-data')?.value || '[]');

  saveProductDraft(productId, {
    title,
    category,
    subcategory,
    stock,
    price,
    originalPrice,
    colors,
    sizes,
    description,
    images
  });
}

function initAdminEvents() {
  initProductFormSave();
  initPhotoUpload();
  initWhatsAppImport();
  initTabs();
  initProductSearch();
  initSettingsForm();
  loadAnalytics();
}

function initProductSearch() {
  const searchInput = document.getElementById('admin-product-search');
  if (!searchInput) return;

  let timeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      renderAdminDashboard();
    }, 150);
  });
}

// ================= MULTI-PHOTO UPLOAD =================
function initPhotoUpload() {
    const fileInput = document.getElementById('prod-images-file');
    const hidden = document.getElementById('prod-images-data');

    if (!fileInput || !hidden) return;

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const existingImages = JSON.parse(hidden.value || '[]');
        const newImages = [];

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            if (existingImages.length + newImages.length >= 6) break;

            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            newImages.push(base64);
        }

        const merged = [...existingImages, ...newImages].slice(0, 6);
        renderProductImagesPreview(merged);
        collectProductDraft(document.getElementById('admin-form-product-id')?.value || null);
        fileInput.value = '';

        if (newImages.length > 0) {
            showToast(`${merged.length} image(s) selected`, 'success');
        }
        if (existingImages.length + newImages.length > 6) {
            showToast('You can upload up to 6 images only', 'error');
        }
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

    if (!title) {
      showToast('Product title is required', 'error');
      return;
    }
    if (!category) {
      showToast('Product category is required', 'error');
      return;
    }
    if (Number.isNaN(stock) || stock < 0) {
      showToast('Stock quantity must be a valid number', 'error');
      return;
    }
    if (Number.isNaN(price) || price <= 0) {
      showToast('Selling price must be greater than zero', 'error');
      return;
    }
    if (Number.isNaN(originalPrice) || originalPrice <= 0) {
      showToast('Original MRP must be greater than zero', 'error');
      return;
    }
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

      clearProductDraft(productId || null);
      showToast(productId ? 'Product updated successfully!' : 'Product added to inventory!', 'success');
      document.getElementById('admin-product-modal-overlay')?.classList.add('hidden');
      await state.initAdminFromServer(); // refreshes state + triggers re-render via subscription
    } catch (e) {
      showToast('Failed to save product. Please check your connection.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  form.addEventListener('input', () => {
    collectProductDraft(document.getElementById('admin-form-product-id')?.value || null);
  });

  document.getElementById('btn-cancel-product')?.addEventListener('click', () => {
    document.getElementById('admin-product-modal-overlay')?.classList.add('hidden');
  });
}


// ================= WHATSAPP CATALOG IMPORT =================

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initWhatsAppImport() {
  const openBtn = document.getElementById('admin-import-whatsapp-btn');
  const overlay = document.getElementById('whatsapp-import-modal-overlay');
  const fileInput = document.getElementById('whatsapp-catalog-file');
  const previewContainer = document.getElementById('whatsapp-import-preview');
  const windowSelect = document.getElementById('whatsapp-import-window-days');
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
    formData.append('importWindowDays', windowSelect?.value || '30');

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
      currentProducts = (data.products || []).map(product => ({
        ...product,
        action: product.action || 'create',
        isSelected: typeof product.isSelected === 'boolean' ? product.isSelected : !product.needsReview
      }));
      renderWhatsAppPreview();
      commitBtn.disabled = currentProducts.length === 0;
    } catch (e) {
      console.error('WhatsApp upload error:', e);
      previewContainer.innerHTML = '';
      showToast(e.message || 'Upload failed. Please check your connection.', 'error');
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
      <p class="input-helper" style="margin-bottom: 12px;">
        Found ${currentProducts.length} product${currentProducts.length === 1 ? '' : 's'} from the selected window. Review each candidate before import.
      </p>
      <div class="whatsapp-import-list">
        ${currentProducts.map(p => `
          <div class="wa-preview-item">
            <div class="wa-preview-controls">
              <label class="custom-checkbox wa-preview-label">
                <input type="checkbox" class="wa-import-checkbox" data-preview-id="${p.previewId}" ${p.isSelected !== false ? 'checked' : ''}>
                <span class="checkbox-checkmark"></span>
              </label>
              <div class="wa-preview-actions">
                <button class="secondary-btn wa-edit-btn" type="button" data-preview-id="${p.previewId}">Edit</button>
                <button class="secondary-btn wa-delete-btn" type="button" data-preview-id="${p.previewId}">Delete</button>
              </div>
            </div>
            <div class="wa-preview-content">
              <div class="wa-preview-header">
                <strong>${escapeHtml(p.title || 'Untitled product')}</strong>
                <span class="wa-badge ${p.hasImage ? 'has-image' : 'no-image'}">${p.hasImage ? 'Has Photo' : 'No Photo'}</span>
              </div>
              <div class="wa-preview-meta">
                ${p.price ? `Selling ₹${Number(p.price).toLocaleString()}` : 'Price pending'} · ${escapeHtml(p.category || 'Accessories')}${p.subcategory ? ' • ' + escapeHtml(p.subcategory) : ''}
                ${p.originalPrice ? `· MRP ₹${Number(p.originalPrice).toLocaleString()}` : ''}
                ${p.isEstimatedPrice ? '<span class="wa-estimate-tag">Estimated</span>' : ''}
              </div>
              <div class="wa-preview-action-row">
                <label class="wa-action-field">
                  <span>Action</span>
                  <select class="wa-action-select" data-preview-id="${p.previewId}">
                    <option value="create" ${p.action === 'create' ? 'selected' : ''}>Create New</option>
                    <option value="update" ${p.action === 'update' ? 'selected' : ''}>Update Existing</option>
                    <option value="skip" ${p.action === 'skip' ? 'selected' : ''}>Skip</option>
                  </select>
                </label>
                ${p.needsReview ? '<span class="wa-review-tag">Needs Manual Review</span>' : ''}
                ${p.duplicateMatch ? `<span class="wa-review-tag">Duplicate match: ${escapeHtml(p.duplicateMatch.title || p.duplicateMatch.id)}</span>` : ''}
              </div>
              ${p.imageUrl ? `<div class="wa-preview-image"><img src="${p.imageUrl}" alt="${escapeHtml(p.title || 'product')}"></div>` : ''}
              <p class="wa-preview-description">${escapeHtml(p.description || '')}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    previewContainer.querySelectorAll('.wa-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const previewId = btn.getAttribute('data-preview-id');
        const product = currentProducts.find(item => item.previewId === previewId);
        if (!product) return;
        const nextTitle = window.prompt('Edit product title', product.title || '');
        if (nextTitle !== null) {
          product.title = nextTitle.trim() || product.title;
          renderWhatsAppPreview();
        }
      });
    });

    previewContainer.querySelectorAll('.wa-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const previewId = btn.getAttribute('data-preview-id');
        currentProducts = currentProducts.filter(item => item.previewId !== previewId);
        renderWhatsAppPreview();
        commitBtn.disabled = currentProducts.length === 0;
      });
    });

    previewContainer.querySelectorAll('.wa-action-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const previewId = e.target.getAttribute('data-preview-id');
        const product = currentProducts.find(item => item.previewId === previewId);
        if (!product) return;
        product.action = e.target.value;
        if (product.action === 'skip') {
          product.isSelected = false;
        } else {
          product.isSelected = true;
        }
        renderWhatsAppPreview();
      });
    });

    previewContainer.querySelectorAll('.wa-import-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const previewId = e.target.getAttribute('data-preview-id');
        const product = currentProducts.find(item => item.previewId === previewId);
        if (!product) return;
        product.isSelected = e.target.checked;
      });
    });
  }

  commitBtn?.addEventListener('click', async () => {
    if (!currentToken) return;

    const selectedProducts = currentProducts.filter(product => product.isSelected !== false && product.action !== 'skip');
    if (selectedProducts.length === 0) {
      showToast('Select at least one product to import', 'error');
      return;
    }

    commitBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/import-whatsapp-catalog/commit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken, previewProducts: currentProducts })
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

export { initAdminEvents };

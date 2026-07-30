import { state } from './state.js';
import { renderAdminDashboard, showToast } from './render.js';

// Admin Control Panel Handlers

export function initAdminEvents() {
  const tabProductsBtn = document.getElementById('tab-products-btn');
  const tabOrdersBtn = document.getElementById('tab-orders-btn');
  const tabSettingsBtn = document.getElementById('tab-settings-btn');
  const tabProductsContent = document.getElementById('tab-products-content');
  const tabOrdersContent = document.getElementById('tab-orders-content');
  const tabSettingsContent = document.getElementById('tab-settings-content');

  const settingsForm = document.getElementById('admin-settings-form');
  const productForm = document.getElementById('admin-product-form');
  const btnCancelProduct = document.getElementById('btn-cancel-product');
  const prodImageFile = document.getElementById('prod-image-file');
  const prodImageUrlInput = document.getElementById('prod-image');
  const prodImagePreview = document.getElementById('prod-image-preview');
  const prodImagePlaceholderIcon = document.getElementById('prod-image-placeholder-icon');

  const adminProductSearchInput = document.getElementById('admin-product-search');

  // --- Admin Tabs Navigation ---
  tabProductsBtn?.addEventListener('click', () => {
    tabProductsBtn.classList.add('active');
    tabOrdersBtn.classList.remove('active');
    tabSettingsBtn?.classList.remove('active');
    tabProductsContent.classList.remove('hidden');
    tabOrdersContent.classList.add('hidden');
    tabSettingsContent?.classList.add('hidden');
  });

  tabOrdersBtn?.addEventListener('click', () => {
    tabOrdersBtn.classList.add('active');
    tabProductsBtn.classList.remove('active');
    tabSettingsBtn?.classList.remove('active');
    tabOrdersContent.classList.remove('hidden');
    tabProductsContent.classList.add('hidden');
    tabSettingsContent?.classList.add('hidden');
  });

  tabSettingsBtn?.addEventListener('click', () => {
    tabSettingsBtn.classList.add('active');
    tabProductsBtn.classList.remove('active');
    tabOrdersBtn.classList.remove('active');
    tabSettingsContent?.classList.remove('hidden');
    tabProductsContent.classList.add('hidden');
    tabOrdersContent.classList.add('hidden');
  });

  // --- Save Store Settings ---
  settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const upiId = document.getElementById('settings-upi-id').value.trim();
    const payeeName = document.getElementById('settings-payee-name').value.trim();

    const result = await state.updatePaymentSettings({ upiId, payeeName });
    if (result.ok) showToast('Store settings saved successfully!', 'success');
    else showToast(result.error, 'error');
  });

  // --- Live Table Search ---
  adminProductSearchInput?.addEventListener('input', () => {
    renderAdminDashboard();
  });

  // --- Direct Photo Upload ---
  function setPreview(url) {
    if (url) {
      prodImagePreview.src = url;
      prodImagePreview.classList.remove('hidden');
      prodImagePlaceholderIcon?.classList.add('hidden');
    } else {
      prodImagePreview.src = '';
      prodImagePreview.classList.add('hidden');
      prodImagePlaceholderIcon?.classList.remove('hidden');
    }
  }

  prodImageFile?.addEventListener('change', async () => {
    const file = prodImageFile.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showToast('Image is too large (max 3MB)', 'error');
      prodImageFile.value = '';
      return;
    }

    // Show an instant local preview while it uploads
    const localPreviewUrl = URL.createObjectURL(file);
    setPreview(localPreviewUrl);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Upload failed', 'error');
        prodImageFile.value = '';
        setPreview(prodImageUrlInput.value);
        return;
      }

      prodImageUrlInput.value = data.imageUrl;
      setPreview(data.imageUrl);
      showToast('Photo uploaded!', 'success');
    } catch (e) {
      showToast('Upload failed. Please check your connection.', 'error');
      prodImageFile.value = '';
      setPreview(prodImageUrlInput.value);
    }
  });

  // Typing/pasting a URL directly also updates the preview
  prodImageUrlInput?.addEventListener('input', () => {
    setPreview(prodImageUrlInput.value);
  });

  // --- Cancel Edit/Create ---
  btnCancelProduct?.addEventListener('click', () => {
    document.getElementById('admin-product-modal-overlay')?.classList.add('hidden');
  });

  // --- Save / Add Product form submission ---
  productForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productId = document.getElementById('admin-form-product-id').value;
    const title = document.getElementById('prod-title').value.trim();
    const category = document.getElementById('prod-category').value;
    const stock = Number(document.getElementById('prod-stock').value);
    const price = Number(document.getElementById('prod-price').value);
    const originalPrice = Number(document.getElementById('prod-original-price').value);
    const colors = document.getElementById('prod-colors').value;
    const image = document.getElementById('prod-image').value.trim();
    const description = document.getElementById('prod-desc').value.trim();

    if (price > originalPrice) {
      showToast('Selling price cannot exceed the original MRP price!', 'error');
      return;
    }

    const productFields = {
      title, category, stock, price, originalPrice, colors,
      image: image || undefined,
      description
    };

    const submitBtn = document.getElementById('btn-save-product');
    submitBtn.disabled = true;

    const result = productId
      ? await state.updateProduct(productId, productFields)
      : await state.addProduct(productFields);

    submitBtn.disabled = false;

    if (result.ok) {
      showToast(productId ? 'Product updated successfully!' : 'Product added to inventory!', 'success');
      document.getElementById('admin-product-modal-overlay')?.classList.add('hidden');
    } else {
      showToast(result.error, 'error');
    }
  });
}

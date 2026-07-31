import { state } from './state.js';
import { renderAdminDashboard, showToast, renderAnalytics, renderProductImagesPreview } from './render.js';

// Admin Control Panel Handlers

export function initAdminEvents() {
  const tabProductsBtn = document.getElementById('tab-products-btn');
  const tabOrdersBtn = document.getElementById('tab-orders-btn');
  const tabSettingsBtn = document.getElementById('tab-settings-btn');
  const tabProductsContent = document.getElementById('tab-products-content');
  const tabOrdersContent = document.getElementById('tab-orders-content');
  const tabSettingsContent = document.getElementById('tab-settings-content');
  const tabAnalyticsBtn = document.getElementById('tab-analytics-btn');
  const tabAnalyticsContent = document.getElementById('tab-analytics-content');
  const refreshAnalyticsBtn = document.getElementById('refresh-analytics-btn');

  const settingsForm = document.getElementById('admin-settings-form');
  const productForm = document.getElementById('admin-product-form');
  const btnCancelProduct = document.getElementById('btn-cancel-product');
  const prodImagesFile = document.getElementById('prod-images-file');
  const prodImagesData = document.getElementById('prod-images-data');

  const adminProductSearchInput = document.getElementById('admin-product-search');

  // --- Admin Tabs Navigation ---
  tabProductsBtn?.addEventListener('click', () => {
    tabProductsBtn.classList.add('active');
    tabOrdersBtn.classList.remove('active');
    tabSettingsBtn?.classList.remove('active');
    tabAnalyticsBtn?.classList.remove('active');
    tabProductsContent.classList.remove('hidden');
    tabOrdersContent.classList.add('hidden');
    tabSettingsContent?.classList.add('hidden');
    tabAnalyticsContent?.classList.add('hidden');
  });

  tabOrdersBtn?.addEventListener('click', () => {
    tabOrdersBtn.classList.add('active');
    tabProductsBtn.classList.remove('active');
    tabSettingsBtn?.classList.remove('active');
    tabAnalyticsBtn?.classList.remove('active');
    tabOrdersContent.classList.remove('hidden');
    tabProductsContent.classList.add('hidden');
    tabSettingsContent?.classList.add('hidden');
    tabAnalyticsContent?.classList.add('hidden');
  });

  tabSettingsBtn?.addEventListener('click', () => {
    tabSettingsBtn.classList.add('active');
    tabProductsBtn.classList.remove('active');
    tabOrdersBtn.classList.remove('active');
    tabAnalyticsBtn?.classList.remove('active');
    tabSettingsContent?.classList.remove('hidden');
    tabProductsContent.classList.add('hidden');
    tabOrdersContent.classList.add('hidden');
    tabAnalyticsContent?.classList.add('hidden');
  });

  
  tabAnalyticsBtn?.addEventListener('click', () => {
    tabAnalyticsBtn.classList.add('active');
    tabProductsBtn.classList.remove('active');
    tabOrdersBtn.classList.remove('active');
    tabSettingsBtn?.classList.remove('active');
    
    tabAnalyticsContent?.classList.remove('hidden');
    tabProductsContent.classList.add('hidden');
    tabOrdersContent.classList.add('hidden');
    tabSettingsContent?.classList.add('hidden');
    
    // Trigger render
    renderAnalytics();
  });
  
  refreshAnalyticsBtn?.addEventListener('click', () => {
    renderAnalytics();
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

  // --- Multiple photo upload ---
  prodImagesFile?.addEventListener('change', async () => {
    const files = Array.from(prodImagesFile.files || []);
    if (!files.length) return;
    if (files.length > 6 || files.some(file => file.size > 3 * 1024 * 1024)) {
      showToast('Select up to 6 images, each no larger than 3MB', 'error');
      prodImagesFile.value = '';
      return;
    }
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));
    try {
      const res = await fetch('/api/admin/upload-images', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const current = JSON.parse(prodImagesData?.value || '[]');
      const images = [...current, ...(data.imageUrls || [])].slice(0, 6);
      renderProductImagesPreview(images);
      prodImagesFile.value = '';
      showToast(`${data.imageUrls.length} photo(s) uploaded`, 'success');
    } catch (e) {
      showToast(e.message || 'Upload failed. Please try again.', 'error');
    }
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
    const sizes = document.getElementById('prod-sizes').value;
    const subcategory = document.getElementById('prod-subcategory').value.trim();
    const images = JSON.parse(prodImagesData?.value || '[]');
    const description = document.getElementById('prod-desc').value.trim();

    if (price > originalPrice) {
      showToast('Selling price cannot exceed the original MRP price!', 'error');
      return;
    }

    const productFields = {
      title, category, subcategory, stock, price, originalPrice, colors, sizes,
      images, image: images[0] || undefined, description
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

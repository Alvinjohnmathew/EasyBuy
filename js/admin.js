document.addEventListener('DOMContentLoaded', () => {
  const importBtn = document.getElementById('importCatalogBtn');
  const catalogInput = document.getElementById('whatsappCatalogText');
  const previewContainer = document.getElementById('importPreviewContainer');
  const saveAllBtn = document.getElementById('saveProductsBtn');

  let previewedProducts = [];

  // 1. Handle Import / Preview Click
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const text = catalogInput.value;

      if (!text || !text.trim()) {
        alert('Please paste catalog text into the text area first.');
        return;
      }

      importBtn.disabled = true;
      importBtn.innerText = 'Processing & Scraping MRP...';

      try {
        const response = await fetch('/api/admin/import-whatsapp-catalog/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: text })
        });

        const data = await response.json();

        if (data.success) {
          previewedProducts = data.products;
          renderPreviewCards(previewedProducts);
          if (saveAllBtn) saveAllBtn.style.display = 'block';
        } else {
          alert('Import failed: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error importing catalog:', error);
        alert('Server error while importing catalog.');
      } finally {
        importBtn.disabled = false;
        importBtn.innerText = 'Import & Scrape MRP';
      }
    });
  }

  // 2. Render Product Preview Cards
  function renderPreviewCards(products) {
    if (!previewContainer) return;
    previewContainer.innerHTML = '';

    if (products.length === 0) {
      previewContainer.innerHTML = '<p>No valid products detected in the text.</p>';
      return;
    }

    products.forEach((product, index) => {
      const card = document.createElement('div');
      card.className = 'product-preview-card';
      card.style.cssText = 'border: 1px solid #e0e0e0; padding: 16px; margin-bottom: 12px; border-radius: 8px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';

      card.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          <img src="${product.image}" alt="${product.title}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #ccc;">
          <div style="flex: 1;">
            <div style="margin-bottom: 8px;">
              <label style="font-weight: bold; display: block; margin-bottom: 4px;">Product Title:</label>
              <input type="text" value="${product.title}" data-index="${index}" data-field="title" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            <div style="display: flex; gap: 16px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; display: block; margin-bottom: 4px;">Selling Price (+₹200 Applied):</label>
                <input type="number" value="${product.price}" data-index="${index}" data-field="price" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; display: block; margin-bottom: 4px;">Original MRP (Scraped Online):</label>
                <input type="number" value="${product.originalPrice}" data-index="${index}" data-field="originalPrice" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
              </div>
            </div>
            <div>
              <label style="font-weight: bold; display: block; margin-bottom: 4px;">Description:</label>
              <textarea data-index="${index}" data-field="description" rows="2" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">${product.description}</textarea>
            </div>
          </div>
        </div>
      `;

      previewContainer.appendChild(card);
    });

    // Attach listeners so admin edits update array live
    previewContainer.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = e.target.getAttribute('data-index');
        const field = e.target.getAttribute('data-field');
        if (field === 'price' || field === 'originalPrice') {
          previewedProducts[idx][field] = parseFloat(e.target.value) || 0;
        } else {
          previewedProducts[idx][field] = e.target.value;
        }
      });
    });
  }

  // 3. Save Products to Store Endpoint
  if (saveAllBtn) {
    saveAllBtn.addEventListener('click', async () => {
      if (previewedProducts.length === 0) {
        alert('No products available to save.');
        return;
      }

      saveAllBtn.disabled = true;
      saveAllBtn.innerText = 'Saving...';

      try {
        const response = await fetch('/api/admin/products/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ products: previewedProducts })
        });

        const data = await response.json();

        if (data.success) {
          alert('Products saved successfully!');
          previewedProducts = [];
          if (previewContainer) previewContainer.innerHTML = '';
          catalogInput.value = '';
          saveAllBtn.style.display = 'none';
        } else {
          alert('Failed to save products: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Save error:', err);
        alert('Server error while saving products.');
      } finally {
        saveAllBtn.disabled = false;
        saveAllBtn.innerText = 'Save Products to Store';
      }
    });
  }
});
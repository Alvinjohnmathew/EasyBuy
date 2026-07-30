import { state } from './state.js';

// DOM Rendering Module for EasyBuy

// Toast notification helper
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'info-circle';
  if (type === 'success') icon = 'circle-check';
  if (type === 'error') icon = 'triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid fa-${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastFadeIn 0.3s ease reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// ================= AUTH HEADER (index.html only) =================

export function renderAuthHeader() {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;

  const user = state.getCurrentUser();

  if (!user) {
    authArea.innerHTML = `
      <button class="header-btn login-btn" id="open-login-btn">Login</button>
    `;
    document.getElementById('open-login-btn')?.addEventListener('click', () => {
      openAuthModal('login');
    });
    return;
  }

  authArea.innerHTML = `
    <div class="account-menu">
      <button class="header-btn login-btn" id="account-menu-btn">
        <i class="fa-solid fa-circle-user"></i> ${user.name.split(' ')[0]}
      </button>
      <div class="account-dropdown hidden" id="account-dropdown">
        <button onclick="window.openProfileModal()"><i class="fa-solid fa-user"></i> My Profile</button>
          <button id="my-orders-btn"><i class="fa-solid fa-box"></i> My Orders</button>
        <button id="logout-btn"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
      </div>
    </div>
  `;

  const menuBtn = document.getElementById('account-menu-btn');
  const dropdown = document.getElementById('account-dropdown');

  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
  }, { once: true });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await state.logout();
    showToast('Logged out', 'info');
  });

  document.getElementById('my-orders-btn')?.addEventListener('click', async () => {
    const orders = await state.fetchMyOrders();
    renderMyOrders(orders);
    document.getElementById('my-orders-modal-overlay')?.classList.remove('hidden');
  });
}

// ================= AUTH MODAL (Login / Signup) =================

export function openAuthModal(tab = 'login') {
  const overlay = document.getElementById('auth-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  switchAuthTab(tab);
}

export function closeAuthModal() {
  document.getElementById('auth-modal-overlay')?.classList.add('hidden');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  loginForm?.reset();
  signupForm?.reset();
}

export function switchAuthTab(tab) {
  const loginTabBtn = document.getElementById('auth-tab-login');
  const signupTabBtn = document.getElementById('auth-tab-signup');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  if (tab === 'signup') {
    signupTabBtn?.classList.add('active');
    loginTabBtn?.classList.remove('active');
    signupForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
  } else {
    loginTabBtn?.classList.add('active');
    signupTabBtn?.classList.remove('active');
    loginForm?.classList.remove('hidden');
    signupForm?.classList.add('hidden');
  }
}

// ================= MY ORDERS PANEL =================

function renderMyOrders(orders) {
  const container = document.getElementById('my-orders-list');
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-cart-view">
        <i class="fa-solid fa-box-open"></i>
        <h3>No orders yet</h3>
        <p>Your placed orders will show up here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(o => `
    <div class="table-card" style="margin-bottom: 12px; padding: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong>${o.id.toUpperCase()}</strong>
        <span class="order-status-select ${o.status.toLowerCase()}" style="border:none; padding:2px 10px;">${o.status}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">${o.date}</div>
      <div class="order-items-purchased">
        ${o.items.map(item => `
          <div class="order-item-line">
            • ${item.title} <span style="color: var(--text-muted)">(${item.color})</span> x ${item.quantity}
          </div>
        `).join('')}
      </div>
      <div style="text-align:right; font-weight:700; margin-top:8px;">₹${o.totalAmount.toLocaleString()}</div>
    </div>
  `).join('');
}

// ================= CATALOG (customer view) =================

export function renderCategoryBar() {
  const categoryBar = document.getElementById('category-bar');
  if (!categoryBar) return;

  const categories = ['All', 'Gadgets', 'Fashion', 'Watch', 'Shoes', 'Gifts'];
  const activeCategory = state.filters.category;

  const icons = {
    'All': 'fa-border-all',
    'Gadgets': 'fa-mobile-screen',
    'Fashion': 'fa-shirt',
    'Watch': 'fa-stopwatch',
    'Shoes': 'fa-shoe-prints',
    'Gifts': 'fa-gift'
  };

  categoryBar.innerHTML = categories.map(cat => `
    <div class="category-item ${cat === activeCategory ? 'active' : ''}" data-category="${cat}">
      <div class="category-icon-box">
        <i class="fa-solid ${icons[cat] || 'fa-tag'}"></i>
      </div>
      <span>${cat}</span>
    </div>
  `).join('');

  categoryBar.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      const selectedCat = item.getAttribute('data-category');
      state.setFilter('category', selectedCat);
    });
  });
}

export function renderColorFilters() {
  const colorsContainer = document.getElementById('colors-filter-container');
  if (!colorsContainer) return;

  const allProducts = state.getProducts();
  const allColors = [...new Set(allProducts.flatMap(p => p.colors))];
  const selectedColors = state.filters.selectedColors;

  if (allColors.length === 0) {
    colorsContainer.innerHTML = '<p class="input-helper">No colors available</p>';
    return;
  }

  colorsContainer.innerHTML = allColors.map(color => `
    <label class="custom-checkbox">
      <input type="checkbox" value="${color}" ${selectedColors.includes(color) ? 'checked' : ''}>
      <span class="checkbox-checkmark"></span> ${color}
    </label>
  `).join('');

  colorsContainer.querySelectorAll('input').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      state.toggleColorFilter(checkbox.value);
    });
  });
}

export function renderProductsGrid() {
  const gridContainer = document.getElementById('products-grid-container');
  const countBadge = document.getElementById('products-count-badge');
  const categoryLabel = document.getElementById('active-category-label');
  if (!gridContainer) return;

  const filteredProducts = state.getFilteredProducts();

  if (countBadge) countBadge.textContent = `(${filteredProducts.length} products)`;
  if (categoryLabel) categoryLabel.textContent = `Category: ${state.filters.category}`;

  if (filteredProducts.length === 0) {
    gridContainer.innerHTML = `
      <div class="empty-catalog-state" style="grid-column: 1 / -1;">
        <i class="fa-solid fa-basket-shopping"></i>
        <h3>No Products Found</h3>
        <p>We couldn't find any products matching your selected search or filters. Try adjusting your settings.</p>
        <button class="primary-btn small-btn" id="btn-reset-catalog-filters">Reset Filters</button>
      </div>
    `;
    document.getElementById('btn-reset-catalog-filters')?.addEventListener('click', () => state.resetFilters());
    return;
  }

  gridContainer.innerHTML = filteredProducts.map(product => {
    const discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
    const hasDiscount = discount > 0;
    const isOutOfStock = product.stock <= 0;

    return `
      <div class="product-card" data-id="${product.id}">
        <div class="product-card-image">
          <img src="${product.image}" alt="${product.title}" loading="lazy">
        </div>
        <div class="product-card-info">
          <span class="product-card-title" title="${product.title}">${product.title}</span>
          <div class="product-card-rating-row">
            <span class="rating-badge">${product.rating} <i class="fa-solid fa-star"></i></span>
            <span class="rating-count">(${product.ratingCount.toLocaleString()})</span>
          </div>
          <div class="product-card-price-row">
            <span class="current-price">₹${product.price.toLocaleString()}</span>
            ${hasDiscount ? `<span class="original-price">₹${product.originalPrice.toLocaleString()}</span>` : ''}
            ${hasDiscount ? `<span class="discount-percentage">${discount}% off</span>` : ''}
          </div>
          <div class="colors-preview-row">
            ${product.colors.map(col => `<span class="color-dot-preview" style="background-color: ${col.replace(/\s+/g, '').toLowerCase()}" title="${col}"></span>`).join('')}
          </div>
          ${isOutOfStock ? `<span class="out-of-stock-label">Out of Stock</span>` : ''}
        </div>
        <div class="product-card-actions">
          <button class="card-add-cart" ${isOutOfStock ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''} data-id="${product.id}">
            <i class="fa-solid fa-cart-plus"></i> Add
          </button>
          <button class="card-buy-now" ${isOutOfStock ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''} data-id="${product.id}">
            Buy Now
          </button>
        </div>
      </div>
    `;
  }).join('');

  gridContainer.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.product-card-actions')) return;
      const productId = card.getAttribute('data-id');
      const product = state.getProductById(productId);
      if (product) state.setActiveProduct(product);
    });
  });

  gridContainer.querySelectorAll('.card-add-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = btn.getAttribute('data-id');
      const product = state.getProductById(pId);
      if (product && product.colors.length > 0) {
        const added = state.addToCart(pId, product.colors[0]);
        showToast(added ? 'Product added to cart!' : 'Product is out of stock or cart limit reached', added ? 'success' : 'error');
      }
    });
  });

  gridContainer.querySelectorAll('.card-buy-now').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = btn.getAttribute('data-id');
      const product = state.getProductById(pId);
      if (product && product.colors.length > 0) {
        state.addToCart(pId, product.colors[0]);
        document.getElementById('cart-drawer-overlay').classList.add('open');
      }
    });
  });
}

export function renderActiveProductDetails() {
  const contentEl = document.getElementById('details-modal-content');
  const modalOverlay = document.getElementById('details-modal-overlay');
  const product = state.getActiveProduct();

  if (!product) {
    if (modalOverlay) modalOverlay.classList.add('hidden');
    return;
  }

  modalOverlay.classList.remove('hidden');

  const discount = Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 3;
  let stockMessage = `<span class="detail-stock-status in-stock">In Stock (${product.stock} available)</span>`;
  if (isOutOfStock) {
    stockMessage = `<span class="detail-stock-status out-of-stock">Temporarily Out of Stock</span>`;
  } else if (isLowStock) {
    stockMessage = `<span class="detail-stock-status low-stock">Only ${product.stock} left in stock - order soon!</span>`;
  }

  contentEl.innerHTML = `
    <div class="product-detail-grid">
      <div class="detail-image-panel">
        <div class="detail-img-box">
          <img src="${product.image}" id="main-detail-img" alt="${product.title}">
        </div>
        <div class="detail-btn-row">
          <button class="detail-add-cart" id="modal-add-cart-btn" ${isOutOfStock ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
            <i class="fa-solid fa-cart-shopping"></i> Add to Cart
          </button>
          <button class="detail-buy-now" id="modal-buy-now-btn" ${isOutOfStock ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
            <i class="fa-solid fa-bolt"></i> Buy Now
          </button>
        </div>
      </div>
      <div class="detail-info-panel">
        <h2 class="detail-title">${product.title}</h2>
        <div class="detail-rating-row">
          <span class="rating-badge">${product.rating} <i class="fa-solid fa-star"></i></span>
          <span class="rating-count">${product.ratingCount.toLocaleString()} ratings & reviews</span>
          <span class="active-category-indicator">${product.category}</span>
        </div>
        <div class="detail-price-box">
          <span class="current-price">₹${product.price.toLocaleString()}</span>
          ${discount > 0 ? `<span class="original-price">₹${product.originalPrice.toLocaleString()}</span>` : ''}
          ${discount > 0 ? `<span class="discount-percentage">${discount}% off</span>` : ''}
        </div>
        <div class="detail-options-section">
          <h4>Select Color:</h4>
          <div class="color-options-row" id="detail-color-options">
            ${product.colors.map((col, index) => `
              <button class="color-option-btn ${index === 0 ? 'selected' : ''}" data-color="${col}">
                ${col}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="detail-options-section">
          <h4>Availability:</h4>
          <div>${stockMessage}</div>
        </div>
        <div class="detail-desc-box">
          <h4>Product Description</h4>
          <p>${product.description}</p>
        </div>
      </div>
    </div>
  `;

  let selectedColor = product.colors[0] || 'Default';
  const colorBtns = contentEl.querySelectorAll('.color-option-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = btn.getAttribute('data-color');
    });
  });

  document.getElementById('modal-add-cart-btn')?.addEventListener('click', () => {
    const added = state.addToCart(product.id, selectedColor);
    if (added) {
      showToast('Product added to cart!', 'success');
      state.setActiveProduct(null);
      document.getElementById('cart-drawer-overlay').classList.add('open');
    } else {
      showToast('Product out of stock or quantity limit reached', 'error');
    }
  });

  document.getElementById('modal-buy-now-btn')?.addEventListener('click', () => {
    state.addToCart(product.id, selectedColor);
    state.setActiveProduct(null);
    document.getElementById('cart-drawer-overlay').classList.add('open');
  });
}

export function renderCartDrawer() {
  const cartItemsCountEl = document.getElementById('cart-items-count');
  const cartBadgeCountEl = document.getElementById('cart-badge-count');
  const itemsContainer = document.getElementById('cart-items-container');
  const priceSummaryContainer = document.getElementById('cart-price-summary');

  if (!itemsContainer || !priceSummaryContainer) return;

  const cart = state.getCart();

  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (cartItemsCountEl) cartItemsCountEl.textContent = totalQty;
  if (cartBadgeCountEl) cartBadgeCountEl.textContent = totalQty;

  if (cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="empty-cart-view">
        <i class="fa-solid fa-cart-shopping"></i>
        <h3>Your Cart is Empty</h3>
        <p>Add products to your cart and make purchases here.</p>
      </div>
    `;
    priceSummaryContainer.innerHTML = '';
    return;
  }

  let totalMRP = 0;
  let totalSellingPrice = 0;

  itemsContainer.innerHTML = cart.map(cartItem => {
    const product = state.getProductById(cartItem.productId);
    if (!product) return '';

    const discountPrice = product.price;
    const mrpPrice = product.originalPrice;

    totalMRP += mrpPrice * cartItem.quantity;
    totalSellingPrice += discountPrice * cartItem.quantity;

    return `
      <div class="cart-item">
        <div class="cart-item-image">
          <img src="${product.image}" alt="${product.title}">
        </div>
        <div class="cart-item-details">
          <div class="cart-item-title" title="${product.title}">${product.title}</div>
          <div class="cart-item-meta">Color: ${cartItem.color}</div>
          <div class="cart-item-prices">
            <span class="item-price">₹${discountPrice.toLocaleString()}</span>
            ${mrpPrice > discountPrice ? `<span class="item-original-price">₹${mrpPrice.toLocaleString()}</span>` : ''}
          </div>
          <div class="cart-item-actions">
            <div class="qty-selector">
              <button class="qty-btn minus" data-id="${cartItem.productId}" data-color="${cartItem.color}">-</button>
              <span class="qty-val">${cartItem.quantity}</span>
              <button class="qty-btn plus" data-id="${cartItem.productId}" data-color="${cartItem.color}">+</button>
            </div>
            <button class="remove-item-btn" data-id="${cartItem.productId}" data-color="${cartItem.color}">
              Remove
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  itemsContainer.querySelectorAll('.qty-btn.minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = btn.getAttribute('data-id');
      const col = btn.getAttribute('data-color');
      const item = cart.find(i => i.productId === pId && i.color === col);
      if (item) state.updateCartQuantity(pId, col, item.quantity - 1);
    });
  });

  itemsContainer.querySelectorAll('.qty-btn.plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = btn.getAttribute('data-id');
      const col = btn.getAttribute('data-color');
      const item = cart.find(i => i.productId === pId && i.color === col);
      if (item) state.updateCartQuantity(pId, col, item.quantity + 1);
    });
  });

  itemsContainer.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = btn.getAttribute('data-id');
      const col = btn.getAttribute('data-color');
      state.removeFromCart(pId, col);
      showToast('Item removed from cart', 'info');
    });
  });

  const savings = totalMRP - totalSellingPrice;
  const deliveryCharge = totalSellingPrice > 500 ? 0 : 40;
  const finalPrice = totalSellingPrice + deliveryCharge;

  priceSummaryContainer.innerHTML = `
    <div class="price-summary-card">
      <h4>Price Details</h4>
      <div class="summary-row">
        <span>Price (${cart.length} items)</span>
        <span>₹${totalMRP.toLocaleString()}</span>
      </div>
      <div class="summary-row">
        <span>Discount</span>
        <span style="color: var(--price-green)">- ₹${savings.toLocaleString()}</span>
      </div>
      <div class="summary-row">
        <span>Delivery Charges</span>
        <span>${deliveryCharge === 0 ? '<span style="color: var(--price-green)">FREE</span>' : `₹${deliveryCharge}`}</span>
      </div>
      <div class="summary-row total-row">
        <span>Total Amount</span>
        <span>₹${finalPrice.toLocaleString()}</span>
      </div>
      ${savings > 0 ? `<div class="savings-label">You will save ₹${savings.toLocaleString()} on this order</div>` : ''}
      <button class="checkout-btn" id="drawer-checkout-btn">Place Order</button>
    </div>
  `;

  document.getElementById('drawer-checkout-btn').addEventListener('click', () => {
    if (!state.getCurrentUser()) {
      document.getElementById('cart-drawer-overlay').classList.remove('open');
      showToast('Please log in to checkout', 'info');
      openAuthModal('login');
      return;
    }
    document.getElementById('cart-drawer-overlay').classList.remove('open');
    openCheckoutWizard(finalPrice);
  });
}

let currentCheckoutTotal = 0;

function openCheckoutWizard(finalPrice) {
  const overlay = document.getElementById('checkout-modal-overlay');
  if (!overlay) return;

  currentCheckoutTotal = finalPrice;
  overlay.classList.remove('hidden');
  document.getElementById('checkout-address-price').textContent = `₹${finalPrice.toLocaleString()}`;

  showCheckoutStep('address');
}

export function getCurrentCheckoutTotal() {
  return currentCheckoutTotal;
}

export function showCheckoutStep(step) {
  const panels = {
    'address': document.getElementById('checkout-address-form'),
    'payment': document.getElementById('checkout-payment-panel'),
    'processing': document.getElementById('checkout-processing-panel'),
    'success': document.getElementById('checkout-success-panel')
  };

  const navs = {
    'address': document.getElementById('step-nav-address'),
    'payment': document.getElementById('step-nav-payment'),
    'success': document.getElementById('step-nav-success')
  };

  Object.keys(panels).forEach(key => {
    if (panels[key]) {
      if (key === step) panels[key].classList.remove('hidden');
      else panels[key].classList.add('hidden');
    }
  });

  if (step === 'payment') {
    const amountEl = document.getElementById('payment-panel-amount');
    if (amountEl) amountEl.textContent = `₹${currentCheckoutTotal.toLocaleString()}`;
  }

  Object.keys(navs).forEach(key => {
    if (navs[key]) {
      if (key === step || (step === 'processing' && key === 'payment')) {
        navs[key].classList.add('active');
      } else {
        navs[key].classList.remove('active');
      }
    }
  });
}

// ================= ADMIN DASHBOARD (admin.html only) =================

export function renderAdminDashboard() {
  const productsTbody = document.getElementById('admin-products-tbody');
  const ordersTbody = document.getElementById('admin-orders-tbody');
  const metricsContainer = document.getElementById('admin-metrics-container');

  if (!productsTbody || !ordersTbody || !metricsContainer) return;

  const products = state.getProducts();
  const orders = state.getOrders();

  const paymentSettings = state.getPaymentSettings();
  const upiIdInput = document.getElementById('settings-upi-id');
  const payeeNameInput = document.getElementById('settings-payee-name');
  if (upiIdInput && document.activeElement !== upiIdInput) upiIdInput.value = paymentSettings.upiId || '';
  if (payeeNameInput && document.activeElement !== payeeNameInput) payeeNameInput.value = paymentSettings.payeeName || '';

  const totalSales = orders
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  metricsContainer.innerHTML = `
    <div class="metric-card sales">
      <div class="metric-info">
        <h4>Total Sales</h4>
        <div class="metric-value">₹${totalSales.toLocaleString()}</div>
      </div>
      <i class="fa-solid fa-indian-rupee-sign metric-icon"></i>
    </div>
    <div class="metric-card orders">
      <div class="metric-info">
        <h4>Total Orders</h4>
        <div class="metric-value">${orders.length}</div>
      </div>
      <i class="fa-solid fa-box-open metric-icon"></i>
    </div>
    <div class="metric-card products">
      <div class="metric-info">
        <h4>Total Products</h4>
        <div class="metric-value">${products.length}</div>
      </div>
      <i class="fa-solid fa-warehouse metric-icon"></i>
    </div>
  `;

  const adminSearchQuery = (document.getElementById('admin-product-search')?.value || '').toLowerCase();
  const adminProducts = products.filter(p =>
    p.title.toLowerCase().includes(adminSearchQuery) ||
    p.category.toLowerCase().includes(adminSearchQuery)
  );

  if (adminProducts.length === 0) {
    productsTbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center" style="padding: 40px; color: var(--text-muted);">
          <i class="fa-regular fa-folder-open" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          No products in inventory matching query.
        </td>
      </tr>
    `;
  } else {
    productsTbody.innerHTML = adminProducts.map(p => {
      let stockClass = 'stock-in';
      if (p.stock <= 0) stockClass = 'stock-out';
      else if (p.stock <= 3) stockClass = 'stock-low';

      return `
        <tr>
          <td><div class="table-img"><img src="${p.image}" alt=""></div></td>
          <td>
            <div class="table-title" title="${p.title}">${p.title}</div>
            <div class="input-helper">ID: ${p.id}</div>
          </td>
          <td><span class="table-category">${p.category}</span></td>
          <td>
            <div class="table-price">₹${p.price.toLocaleString()}</div>
            ${p.originalPrice > p.price ? `<div class="original-price" style="font-size: 11px;">MRP: ₹${p.originalPrice.toLocaleString()}</div>` : ''}
          </td>
          <td><span class="table-stock ${stockClass}">${p.stock <= 0 ? 'Out of stock' : `${p.stock} units`}</span></td>
          <td><div class="table-colors-list">${p.colors.map(col => `<span class="table-color-badge" title="${col}">${col}</span>`).join('')}</div></td>
          <td><span class="rating-badge">${p.rating} <i class="fa-solid fa-star"></i></span></td>
          <td>
            <div class="action-btns">
              <button class="action-btn edit" data-id="${p.id}" title="Edit Product"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="action-btn delete" data-id="${p.id}" title="Delete Product"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    productsTbody.querySelectorAll('.action-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openAdminProductModal(id);
      });
    });

    productsTbody.querySelectorAll('.action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const product = state.getProductById(id);
        if (confirm(`Are you sure you want to delete "${product.title}"?`)) {
          const result = await state.deleteProduct(id);
          if (result.ok) showToast('Product deleted from inventory', 'info');
          else showToast(result.error, 'error');
        }
      });
    });
  }

  if (orders.length === 0) {
    ordersTbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="padding: 40px; color: var(--text-muted);">
          <i class="fa-regular fa-clipboard" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          No customer orders placed yet.
        </td>
      </tr>
    `;
  } else {
    ordersTbody.innerHTML = orders.map(o => `
      <tr>
        <td><strong>${o.id.toUpperCase()}</strong></td>
        <td><span style="font-size: 11px; color: #555;">${o.date}</span></td>
        <td>
          <div class="order-customer-info">
            <strong>${o.shippingInfo.name}</strong>
            <span>${o.shippingInfo.phone}</span>
            <span style="font-size: 10px; color: var(--text-muted); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${o.shippingInfo.address}, ${o.shippingInfo.city} - ${o.shippingInfo.pincode}">
              ${o.shippingInfo.address}, ${o.shippingInfo.city}
            </span>
          </div>
        </td>
        <td>
          <div class="order-items-purchased">
            ${o.items.map(item => `
              <div class="order-item-line">
                • ${item.title} <span style="color: var(--text-muted)">(${item.color})</span> x ${item.quantity}
              </div>
            `).join('')}
          </div>
        </td>
        <td><strong>₹${o.totalAmount.toLocaleString()}</strong></td>
        <td><span class="table-color-badge">${o.paymentMethod}</span></td>
        <td>
          <select class="order-status-select ${o.status.toLowerCase()}" data-id="${o.id}">
            <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `).join('');

    ordersTbody.querySelectorAll('.order-status-select').forEach(select => {
      select.addEventListener('change', async () => {
        const orderId = select.getAttribute('data-id');
        const newStatus = select.value;
        const result = await state.updateOrderStatus(orderId, newStatus);
        if (result.ok) showToast(`Order status updated to ${newStatus}`, 'success');
        else showToast(result.error, 'error');
      });
    });
  }
}

export function openAdminProductModal(productId = null) {
  const overlay = document.getElementById('admin-product-modal-overlay');
  const titleEl = document.getElementById('admin-modal-title');
  const form = document.getElementById('admin-product-form');
  const previewImg = document.getElementById('prod-image-preview');
  const placeholderIcon = document.getElementById('prod-image-placeholder-icon');

  if (!overlay || !form) return;

  form.reset();
  document.getElementById('admin-form-product-id').value = '';
  previewImg?.classList.add('hidden');
  placeholderIcon?.classList.remove('hidden');

  if (productId) {
    titleEl.textContent = 'Edit Product Details';
    const product = state.getProductById(productId);
    if (product) {
      document.getElementById('admin-form-product-id').value = product.id;
      document.getElementById('prod-title').value = product.title;
      document.getElementById('prod-category').value = product.category;
      document.getElementById('prod-stock').value = product.stock;
      document.getElementById('prod-price').value = product.price;
      document.getElementById('prod-original-price').value = product.originalPrice;
      document.getElementById('prod-colors').value = product.colors.join(', ');
      document.getElementById('prod-image').value = product.image;
      document.getElementById('prod-desc').value = product.description;

      if (product.image && previewImg) {
        previewImg.src = product.image;
        previewImg.classList.remove('hidden');
        placeholderIcon?.classList.add('hidden');
      }
    }
  } else {
    titleEl.textContent = 'Add New Product';
  }

  overlay.classList.remove('hidden');
}

// Full customer-facing UI refresh, run on every state change
export function updateUI() {
  renderAuthHeader();
  renderCategoryBar();
  renderColorFilters();
  renderProductsGrid();
  renderActiveProductDetails();
  renderCartDrawer();
}

export async function renderAnalytics() {
  const container = document.getElementById('analytics-dashboard-grid');
  if (!container) return;
  
  container.innerHTML = '<div style="grid-column: 1/-1; text-align:center;">Loading analytics...</div>';
  
  try {
    const res = await fetch('/api/admin/analytics', { credentials: 'include' });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error);
    
    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-info">
          <h3>Total Revenue</h3>
          <div class="metric-value">₹${(data.totalSales || 0).toLocaleString()}</div>
        </div>
        <div class="metric-icon" style="background: rgba(46, 204, 113, 0.1); color: #2ecc71;">
          <i class="fa-solid fa-indian-rupee-sign"></i>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-info">
          <h3>Total Orders</h3>
          <div class="metric-value">${data.orderCount || 0}</div>
        </div>
        <div class="metric-icon" style="background: rgba(52, 152, 219, 0.1); color: #3498db;">
          <i class="fa-solid fa-box"></i>
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-info">
          <h3>Average Order Value</h3>
          <div class="metric-value">₹${data.orderCount ? Math.round(data.totalSales / data.orderCount).toLocaleString() : 0}</div>
        </div>
        <div class="metric-icon" style="background: rgba(155, 89, 182, 0.1); color: #9b59b6;">
          <i class="fa-solid fa-chart-line"></i>
        </div>
      </div></div>
      `;
  } catch (e) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: red;">Failed to load analytics: ${e.message}</div>`;
  }
}

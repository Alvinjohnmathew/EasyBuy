import { initialProducts } from './mockData.js';

// State management module for EasyBuy

class AppState {
  constructor() {
    this.listeners = [];

    this.products = [];
    this.cart = this.loadLocal('eb_cart', []);
    this.orders = [];       // populated on admin.html only, via initAdminFromServer()
    this.currentUser = null; // logged-in customer, or null
    this.isAdmin = false;    // whether we currently hold a valid admin session

    // UI temporary states
    this.activeProduct = null;
    this.searchQuery = '';
    this.filters = {
      category: 'All',
      priceMin: 0,
      priceMax: 100000,
      minRating: 0,
      selectedColors: [],
      sortBy: 'popularity'
    };

    this.paymentSettings = { payeeName: 'EasyBuy Store', upiId: 'easybuy@okaxis' };
  }

  // --- Storefront bootstrap (index.html) ---
  async initFromServer() {
    try {
      const res = await fetch('/api/public/catalog');
      const data = await res.json();
      const products = Array.isArray(data.products) ? data.products : [];
      // Older admin-created records can omit optional display fields.  Keep the
      // storefront usable instead of allowing one incomplete record to stop the
      // entire catalogue from rendering.
      this.products = (products.length ? products : initialProducts)
        .filter(product => product && product.id && product.title)
        .map(product => ({
          ...product,
          category: String(product.category || 'Other').split(' - ')[0],
          subcategory: product.subcategory || String(product.category || '').split(' - ')[1] || '',
          price: Number(product.price) || 0,
          originalPrice: Number(product.originalPrice) || Number(product.price) || 0,
          colors: Array.isArray(product.colors) ? product.colors : [],
          rating: Number(product.rating) || 0,
          ratingCount: Number(product.ratingCount) || 0,
          stock: Number(product.stock) || 0,
          description: product.description || '',
          image: product.image || ''
        }));
      if (data.paymentSettings) this.paymentSettings = data.paymentSettings;
    } catch (e) {
      console.error('Failed to load catalog from server:', e);
      this.products = initialProducts;
    }

    // Check if a customer is already logged in (session cookie)
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      this.currentUser = data.user || null;
    } catch (e) {
      this.currentUser = null;
    }
  }

  // --- Admin bootstrap (admin.html) ---
  async checkAdminSession() {
    try {
      const res = await fetch('/api/admin/me', { credentials: 'include' });
      const data = await res.json();
      this.isAdmin = !!data.isAdmin;
    } catch (e) {
      this.isAdmin = false;
    }
    return this.isAdmin;
  }

  async initAdminFromServer() {
    try {
      const res = await fetch('/api/admin/data', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        this.isAdmin = false;
        this.notify();
        return false;
      }
      const data = await res.json();
      this.products = data.products || [];
      this.orders = data.orders || [];
      if (data.paymentSettings) this.paymentSettings = data.paymentSettings;
      this.isAdmin = true;
      this.notify();
      return true;
    } catch (e) {
      console.error('Failed to load admin data:', e);
      return false;
    }
  }

  // --- Storage Helpers (cart only — nothing sensitive lives in localStorage) ---
  loadLocal(key, defaultValue) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  saveLocal(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
  }

  // --- Subscription / Reactivity ---
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb());
  }

  // ================= CUSTOMER AUTH =================

  async signup(name, email, password) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Signup failed' };
    this.currentUser = data.user;
    this.notify();
    return { ok: true, user: data.user };
  }

  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Login failed' };
    this.currentUser = data.user;
    this.notify();
    return { ok: true, user: data.user };
  }

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    this.currentUser = null;
    this.notify();
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // ================= ADMIN AUTH =================

  async adminLogin(username, password) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Login failed' };
    this.isAdmin = true;
    return { ok: true };
  }

  async adminLogout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    this.isAdmin = false;
  }

  // --- Payment Settings ---
  getPaymentSettings() {
    return this.paymentSettings;
  }

  async updatePaymentSettings(settings) {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Failed to save settings' };
    this.paymentSettings = data.paymentSettings;
    this.notify();
    return { ok: true };
  }

  // --- Product CRUD (admin-only, protected server-side) ---
  getProducts() {
    return this.products;
  }

  getProductById(id) {
    return this.products.find(p => p.id === id);
  }

  async addProduct(product) {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Failed to add product' };
    await this.initAdminFromServer();
    return { ok: true, product: data.product };
  }

  async updateProduct(id, updatedFields) {
    const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields)
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Failed to update product' };
    await this.initAdminFromServer();
    return { ok: true, product: data.product };
  }

  async deleteProduct(id) {
    const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Failed to delete product' };
    await this.initAdminFromServer();
    return { ok: true };
  }

  // --- Cart Management (local only, unaffected by login state) ---
  getCart() {
    return this.cart;
  }

  addToCart(productId, color) {
    const product = this.getProductById(productId);
    if (!product || product.stock <= 0) return false;

    const existingIndex = this.cart.findIndex(item => item.productId === productId && item.color === color);

    if (existingIndex !== -1) {
      if (this.cart[existingIndex].quantity < product.stock) {
        this.cart[existingIndex].quantity += 1;
      } else {
        return false;
      }
    } else {
      this.cart.push({
        productId,
        color: color || (product.colors[0] || 'Default'),
        quantity: 1
      });
    }

    this.saveLocal('eb_cart', this.cart);
    this.notify();
    return true;
  }

  removeFromCart(productId, color) {
    this.cart = this.cart.filter(item => !(item.productId === productId && item.color === color));
    this.saveLocal('eb_cart', this.cart);
    this.notify();
  }

  updateCartQuantity(productId, color, quantity) {
    const product = this.getProductById(productId);
    if (!product) return;

    const idx = this.cart.findIndex(item => item.productId === productId && item.color === color);
    if (idx !== -1) {
      if (quantity <= 0) {
        this.cart.splice(idx, 1);
      } else {
        this.cart[idx].quantity = Math.min(quantity, product.stock);
      }
      this.saveLocal('eb_cart', this.cart);
      this.notify();
    }
  }

  clearCart() {
    this.cart = [];
    this.saveLocal('eb_cart', this.cart);
    this.notify();
  }

  // --- Orders (customer must be logged in; server is source of truth) ---
  getOrders() {
    return this.orders;
  }

  // Step 1: ask the server to create a Razorpay order for the current cart.
  // The server computes the amount itself from the catalog.
  async createRazorpayOrder() {
    if (!this.currentUser) {
      return { ok: false, error: 'NOT_LOGGED_IN' };
    }
    if (this.cart.length === 0) {
      return { ok: false, error: 'Your cart is empty' };
    }

    const items = this.cart.map(item => ({
      productId: item.productId,
      color: item.color,
      quantity: item.quantity
    }));

    const res = await fetch('/api/payments/razorpay/order', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Could not start payment' };
    return { ok: true, ...data, items };
  }

  // Step 2: after Razorpay's checkout hands back a signed payment response,
  // send it to the server for verification. The order is only created if
  // the signature checks out server-side.
  async verifyRazorpayPayment(paymentResponse, items, shippingInfo) {
    const res = await fetch('/api/payments/razorpay/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        items,
        shippingInfo
      })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Payment verification failed' };

    this.clearCart();
    this.notify();
    return { ok: true, order: data.order };
  }


  async fetchMyOrders() {
    if (!this.currentUser) return [];
    try {
      const res = await fetch('/api/orders/mine', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      return data.orders || [];
    } catch (e) {
      return [];
    }
  }

  async updateOrderStatus(orderId, status) {
    const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Failed to update order' };
    await this.initAdminFromServer();
    return { ok: true };
  }

  // --- Product Filter Actions ---
  setSearchQuery(query) {
    this.searchQuery = query;
    this.notify();
  }

  setFilter(filterKey, value) {
    this.filters[filterKey] = value;
    this.notify();
  }

  toggleColorFilter(color) {
    const index = this.filters.selectedColors.indexOf(color);
    if (index === -1) {
      this.filters.selectedColors.push(color);
    } else {
      this.filters.selectedColors.splice(index, 1);
    }
    this.notify();
  }

  resetFilters() {
    this.filters = {
      category: 'All',
      priceMin: 0,
      priceMax: 100000,
      minRating: 0,
      selectedColors: [],
      sortBy: 'popularity'
    };
    this.searchQuery = '';
    this.notify();
  }

  getFilteredProducts() {
    return this.products
      .filter(product => {
        if (this.searchQuery) {
          const query = this.searchQuery.toLowerCase();
          const matchTitle = product.title.toLowerCase().includes(query);
          const matchCategory = product.category.toLowerCase().includes(query);
          const matchDesc = product.description.toLowerCase().includes(query);
          if (!matchTitle && !matchCategory && !matchDesc) return false;
        }

        const primaryCategory = String(product.category || '').split(' - ')[0];
        if (this.filters.category !== 'All' && primaryCategory !== this.filters.category) {
          return false;
        }

        if (product.price < this.filters.priceMin || product.price > this.filters.priceMax) {
          return false;
        }

        if (product.rating < this.filters.minRating) {
          return false;
        }

        if (this.filters.selectedColors.length > 0) {
          const hasColorMatch = product.colors.some(c =>
            this.filters.selectedColors.some(sc => sc.toLowerCase() === c.toLowerCase())
          );
          if (!hasColorMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (this.filters.sortBy === 'priceLowHigh') return a.price - b.price;
        if (this.filters.sortBy === 'priceHighLow') return b.price - a.price;
        if (this.filters.sortBy === 'rating') return b.rating - a.rating;
        return (b.rating * b.ratingCount) - (a.rating * a.ratingCount);
      });
  }

  // --- Active Product View ---
  setActiveProduct(product) {
    this.activeProduct = product;
    this.notify();
  }

  getActiveProduct() {
    return this.activeProduct;
  }
}

export const state = new AppState();
window.state = state; // expose for console debugging
export default state;

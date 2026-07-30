import { state } from './state.js';
import { updateUI, openAuthModal, renderMyOrders, showToast } from './render.js';
import { initCartEvents } from './cart.js';
import { initAuthEvents } from './auth.js';

// Application Controller & Initialization (Storefront)

document.addEventListener('DOMContentLoaded', async () => {
  await state.initFromServer();

  // 1. Initialize Event Modules
  initCartEvents();
  initAuthEvents();

  // 2. State Observers
  state.subscribe(() => {
    updateUI();
  });

  // 3. Setup Global UI Events
  setupGlobalEvents();

  // 4. Setup Interactive Banners Carousel
  setupCarousel();

  // 5. Initial Rendering
  updateUI();
});

// Setup global layout events (header, toggles, filters)
function setupGlobalEvents() {
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const headerLogoBtn = document.getElementById('header-logo-btn');

  // Cart Drawer open/close
  const cartToggleBtn = document.getElementById('cart-toggle-btn');
  const closeCartBtn = document.getElementById('close-cart-btn');
  const cartDrawerOverlay = document.getElementById('cart-drawer-overlay');

  // Modals overlays & close buttons
  const closeDetailsBtn = document.getElementById('close-details-btn');
  const detailsModalOverlay = document.getElementById('details-modal-overlay');

  const closeCheckoutBtn = document.getElementById('close-checkout-btn');
  const checkoutModalOverlay = document.getElementById('checkout-modal-overlay');

  const closeMyOrdersBtn = document.getElementById('close-my-orders-btn');
  const myOrdersModalOverlay = document.getElementById('my-orders-modal-overlay');
  const myOrdersHeaderBtn = document.getElementById('my-orders-header-btn');
  let ordersRefreshTimer = null;

  const refreshMyOrders = async () => {
    if (!state.getCurrentUser()) return;
    renderMyOrders(await state.fetchMyOrders());
  };
  const startOrdersRefresh = () => {
    if (ordersRefreshTimer) return;
    ordersRefreshTimer = window.setInterval(() => {
      if (myOrdersModalOverlay?.classList.contains('hidden')) {
        window.clearInterval(ordersRefreshTimer);
        ordersRefreshTimer = null;
        return;
      }
      refreshMyOrders();
    }, 10000);
  };
  const stopOrdersRefresh = () => {
    if (ordersRefreshTimer) window.clearInterval(ordersRefreshTimer);
    ordersRefreshTimer = null;
  };

  // --- Header Navigation & Search ---
  searchInput?.addEventListener('input', (e) => {
    state.setSearchQuery(e.target.value);
  });

  searchBtn?.addEventListener('click', () => {
    state.setSearchQuery(searchInput.value);
  });

  // Logo acts as "Go Home" reset button
  headerLogoBtn?.addEventListener('click', () => {
    state.resetFilters();
    if (searchInput) searchInput.value = '';
    resetVisualFilters();
  });

  // --- Cart Drawer Toggles ---
  cartToggleBtn?.addEventListener('click', () => {
    cartDrawerOverlay?.classList.add('open');
  });

  closeCartBtn?.addEventListener('click', () => {
    cartDrawerOverlay?.classList.remove('open');
  });

  cartDrawerOverlay?.addEventListener('click', (e) => {
    if (e.target === cartDrawerOverlay) {
      cartDrawerOverlay.classList.remove('open');
    }
  });

  // --- Details Modal Close ---
  closeDetailsBtn?.addEventListener('click', () => {
    state.setActiveProduct(null);
  });

  detailsModalOverlay?.addEventListener('click', (e) => {
    if (e.target === detailsModalOverlay) state.setActiveProduct(null);
  });

  // --- Checkout Modal Close ---
  closeCheckoutBtn?.addEventListener('click', () => {
    checkoutModalOverlay?.classList.add('hidden');
  });

  checkoutModalOverlay?.addEventListener('click', (e) => {
    if (e.target === checkoutModalOverlay) {
      checkoutModalOverlay.classList.add('hidden');
    }
  });

  // --- My Orders Modal Close ---
  closeMyOrdersBtn?.addEventListener('click', () => {
    myOrdersModalOverlay?.classList.add('hidden');
    stopOrdersRefresh();
  });

  myOrdersModalOverlay?.addEventListener('click', (e) => {
    if (e.target === myOrdersModalOverlay) {
      myOrdersModalOverlay.classList.add('hidden');
      stopOrdersRefresh();
    }
  });

  myOrdersHeaderBtn?.addEventListener('click', async () => {
    if (!state.getCurrentUser()) {
      showToast('Please log in to view your orders', 'error');
      openAuthModal('login');
      return;
    }
    await refreshMyOrders();
    myOrdersModalOverlay?.classList.remove('hidden');
    startOrdersRefresh();
  });

  // --- Filters Side Panel Events ---
  const priceSlider = document.getElementById('price-slider');
  const priceSliderLabel = document.getElementById('price-slider-label');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');

  priceSlider?.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    priceSliderLabel.textContent = `₹${val.toLocaleString()}`;
    state.setFilter('priceMax', val);
  });

  document.querySelectorAll('input[name="sort-by"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.setFilter('sortBy', e.target.value);
    });
  });

  document.querySelectorAll('input[name="rating-filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.setFilter('minRating', Number(e.target.value));
    });
  });

  clearFiltersBtn?.addEventListener('click', () => {
    state.resetFilters();
    if (searchInput) searchInput.value = '';
    resetVisualFilters();
  });
}

function resetVisualFilters() {
  const priceSlider = document.getElementById('price-slider');
  const priceSliderLabel = document.getElementById('price-slider-label');

  if (priceSlider) priceSlider.value = 100000;
  if (priceSliderLabel) priceSliderLabel.textContent = '₹100,000';

  const defaultSort = document.querySelector('input[name="sort-by"][value="popularity"]');
  if (defaultSort) defaultSort.checked = true;

  const defaultRating = document.querySelector('input[name="rating-filter"][value="0"]');
  if (defaultRating) defaultRating.checked = true;
}

// Banner Slides Carousel Slider Logic
function setupCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  const dotsContainer = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev-btn');
  const nextBtn = document.getElementById('carousel-next-btn');

  if (slides.length === 0) return;

  let currentSlide = 0;
  let autoTimer = null;

  function showSlide(index) {
    if (index >= slides.length) currentSlide = 0;
    else if (index < 0) currentSlide = slides.length - 1;
    else currentSlide = index;

    slides.forEach((slide, i) => {
      if (i === currentSlide) slide.classList.add('active');
      else slide.classList.remove('active');
    });

    const dots = dotsContainer?.querySelectorAll('.dot');
    dots?.forEach((dot, i) => {
      if (i === currentSlide) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    resetTimer();
  }

  if (dotsContainer) {
    dotsContainer.innerHTML = Array.from({ length: slides.length }).map((_, i) => `
      <span class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>
    `).join('');

    dotsContainer.querySelectorAll('.dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const index = Number(dot.getAttribute('data-index'));
        showSlide(index);
      });
    });
  }

  prevBtn?.addEventListener('click', () => showSlide(currentSlide - 1));
  nextBtn?.addEventListener('click', () => showSlide(currentSlide + 1));

  function startTimer() {
    autoTimer = setInterval(() => {
      showSlide(currentSlide + 1);
    }, 6000);
  }

  function resetTimer() {
    clearInterval(autoTimer);
    startTimer();
  }

  startTimer();
}


// ==================== NEW FEATURES ====================

// --- Wishlist UI ---
const wishlistToggleBtn = document.getElementById('wishlist-toggle-btn');
const wishlistDrawerOverlay = document.getElementById('wishlist-drawer-overlay');
const closeWishlistBtn = document.getElementById('close-wishlist-btn');
const wishlistItemsContainer = document.getElementById('wishlist-items-container');

wishlistToggleBtn?.addEventListener('click', async () => {
  if (!state.session) {
    showToast('Please login to view wishlist', 'error');
    return;
  }
  wishlistDrawerOverlay?.classList.remove('hidden');
  wishlistItemsContainer.innerHTML = '<div class="drawer-empty"><div class="drawer-empty-spinner"></div><p>Loading...</p></div>';
  try {
    const res = await fetch('/api/user/wishlist', { credentials: 'include' });
    const data = await res.json();
    if (res.ok) {
      if (data.wishlist.length === 0) {
        wishlistItemsContainer.innerHTML = '<div class="drawer-empty"><i class="fa-regular fa-heart"></i><p>Your wishlist is empty</p></div>';
      } else {
        wishlistItemsContainer.innerHTML = data.wishlist.map(item => `
          <div class="cart-item">
            <img src="${item.image}" alt="${item.title}">
            <div class="cart-item-info">
              <h4>${item.title}</h4>
              <p>₹${item.price.toLocaleString()}</p>
              <button onclick="window.removeFromWishlist('${item.id}')" style="background:none;border:none;color:red;cursor:pointer;margin-top:5px;font-size:12px;">Remove</button>
            </div>
          </div>
        `).join('');
      }
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    wishlistItemsContainer.innerHTML = `<div class="drawer-empty"><p style="color:red;">Error: ${e.message}</p></div>`;
  }
});
closeWishlistBtn?.addEventListener('click', () => wishlistDrawerOverlay?.classList.add('hidden'));

window.toggleWishlist = async (productId, btn) => {
  if (!state.session) { showToast('Login required', 'error'); return; }
  const isAdding = !btn.classList.contains('active');
  try {
    const res = await fetch(`/api/user/wishlist${isAdding ? '' : '/' + productId}`, {
      method: isAdding ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: isAdding ? JSON.stringify({ productId }) : null,
      credentials: 'include'
    });
    if (res.ok) {
      btn.classList.toggle('active');
      showToast(isAdding ? 'Added to wishlist' : 'Removed from wishlist', 'success');
    }
  } catch(e) {
    showToast('Failed to update wishlist', 'error');
  }
};
window.removeFromWishlist = async (productId) => {
  try {
    const res = await fetch(`/api/user/wishlist/${productId}`, { method: 'DELETE', credentials: 'include' });
    if(res.ok) document.getElementById('wishlist-toggle-btn').click(); // refresh
  } catch(e) {}
}

// --- AI Chat UI ---
const aiChatFab = document.getElementById('ai-chat-fab');
const aiChatWidget = document.getElementById('ai-chat-widget');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMessages = document.getElementById('chat-messages');

aiChatFab?.addEventListener('click', () => {
  aiChatWidget.classList.toggle('hidden');
});
closeChatBtn?.addEventListener('click', () => {
  aiChatWidget.classList.add('hidden');
});

async function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatMessages.innerHTML += `<div class="chat-msg user-msg">${msg}</div>`;
  chatInput.value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    chatMessages.innerHTML += `<div class="chat-msg bot-msg">${data.reply}</div>`;
  } catch(e) {
    chatMessages.innerHTML += `<div class="chat-msg bot-msg" style="color:red;">Error connecting to AI.</div>`;
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
chatSendBtn?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// --- Profile UI ---
const profileModal = document.getElementById('profile-modal-overlay');
const closeProfileBtn = document.getElementById('close-profile-btn');
const profileForm = document.getElementById('profile-form');

window.openProfileModal = async () => {
  if (!state.session) return;
  profileModal?.classList.remove('hidden');
  try {
    const res = await fetch('/api/user/profile', { credentials: 'include' });
    const data = await res.json();
    if(data.user) {
      document.getElementById('profile-name').value = data.user.name || '';
      document.getElementById('profile-phone').value = data.user.phone || '';
      document.getElementById('profile-address').value = data.user.address || '';
    }
  } catch(e) {}
};
closeProfileBtn?.addEventListener('click', () => profileModal?.classList.add('hidden'));

profileForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('profile-name').value;
  const phone = document.getElementById('profile-phone').value;
  const address = document.getElementById('profile-address').value;
  
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, address }),
      credentials: 'include'
    });
    if(res.ok) {
      showToast('Profile updated!', 'success');
      profileModal.classList.add('hidden');
    }
  } catch(e) {
    showToast('Failed to update profile', 'error');
  }
});


window.loadReviews = async (productId) => {
  const container = document.getElementById('reviews-container-' + productId);
  if(!container) return;
  try {
    const res = await fetch('/api/products/' + productId + '/reviews');
    const data = await res.json();
    if(res.ok && data.reviews.length > 0) {
      container.innerHTML = data.reviews.map(r => `
        <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <div style="font-weight: bold;">${r.userName} <span style="color: #f39c12;">${'★'.repeat(r.rating)}</span></div>
          <p style="margin-top: 5px; color: #555;">${r.comment}</p>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p>No reviews yet. Be the first to review!</p>';
    }
  } catch(e) {
    container.innerHTML = '<p>Failed to load reviews.</p>';
  }
};

window.submitReview = async (productId) => {
  if (!state.session) { showToast('Login required to submit a review', 'error'); return; }
  const rating = document.getElementById('new-review-rating').value;
  const comment = document.getElementById('new-review-comment').value;
  try {
    const res = await fetch('/api/products/' + productId + '/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment }),
      credentials: 'include'
    });
    if(res.ok) {
      showToast('Review submitted!', 'success');
      document.getElementById('new-review-comment').value = '';
      window.loadReviews(productId);
    } else {
      showToast('Failed to submit review', 'error');
    }
  } catch(e) {
    showToast('Failed to submit review', 'error');
  }
};

// Override openProductDetails to load reviews when modal opens
const originalOpenProductDetails = window.openProductDetails;
window.openProductDetails = (productId) => {
  if (originalOpenProductDetails) originalOpenProductDetails(productId);
  setTimeout(() => window.loadReviews(productId), 100);
};
window.viewTracking = (orderId) => {
  // Let's just alert for now, or you could implement a full modal
  // Because building a full modal in a patch script might be error prone,
  // let's fetch the order and show the tracking timeline.
  fetch('/api/orders/mine', { credentials: 'include', cache: 'no-store' })
    .then(res => res.json())
    .then(data => {
      const order = data.orders.find(o => o.id === orderId);
      if (order && order.deliveryTracking && order.deliveryTracking.length > 0) {
        const trackingText = order.deliveryTracking.map(t => `${new Date(t.date).toLocaleString()} - ${t.status}${t.message ? `: ${t.message}` : ''}`).join('\n');
        alert('Tracking Timeline for ' + orderId + ':\n\n' + trackingText);
      } else {
        alert('Order Status: ' + (order ? order.status : 'Pending') + '\nNo tracking timeline available yet.');
      }
    });
};

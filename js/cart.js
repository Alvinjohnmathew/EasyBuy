import { state } from './state.js';
import { showCheckoutStep, showToast } from './render.js';

// Cart Checkout & Payment Handler
export function initCartEvents() {
  const addressForm = document.getElementById('checkout-address-form');
  const payNowBtn = document.getElementById('pay-now-btn');
  const paymentBackBtn = document.getElementById('payment-back-btn');

  // Shipping details state cache
  let shippingDetails = null;

  // Step 1 Form Submission (Shipping details)
  addressForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    shippingDetails = {
      name: document.getElementById('ship-name').value,
      phone: document.getElementById('ship-phone').value,
      address: document.getElementById('ship-address').value,
      city: document.getElementById('ship-city').value,
      pincode: document.getElementById('ship-pincode').value
    };
    showCheckoutStep('payment');
  });

  // Back button in Payment Panel
  paymentBackBtn?.addEventListener('click', () => {
    showCheckoutStep('address');
  });

  // Pay with Razorpay
  payNowBtn?.addEventListener('click', async () => {
    if (typeof Razorpay === 'undefined') {
      showToast('Payment system failed to load. Please refresh and try again.', 'error');
      return;
    }

    payNowBtn.disabled = true;

    const orderResult = await state.createRazorpayOrder();
    if (!orderResult.ok) {
      payNowBtn.disabled = false;
      if (orderResult.error === 'NOT_LOGGED_IN') {
        showToast('Please log in to place your order', 'error');
        document.getElementById('checkout-modal-overlay').classList.add('hidden');
      } else {
        showToast(orderResult.error, 'error');
      }
      return;
    }

    const rzp = new Razorpay({
      key: orderResult.keyId,
      amount: orderResult.amount,
      currency: orderResult.currency,
      order_id: orderResult.razorpayOrderId,
      name: 'EasyBuy',
      description: 'Order payment',
      prefill: {
        name: shippingDetails?.name || '',
        contact: shippingDetails?.phone || ''
      },
      theme: { color: '#4f46e5' },
      handler: async (response) => {
        showCheckoutStep('processing');

        const verifyResult = await state.verifyRazorpayPayment(response, orderResult.items, shippingDetails);

        payNowBtn.disabled = false;

        if (verifyResult.ok) {
          document.getElementById('success-order-id').textContent = verifyResult.order.id.toUpperCase();
          showCheckoutStep('success');
          showToast('Payment successful! Order placed.', 'success');
          addressForm.reset();
        } else {
          showToast(verifyResult.error, 'error');
          showCheckoutStep('payment');
        }
      },
      modal: {
        ondismiss: () => {
          payNowBtn.disabled = false;
        }
      }
    });

    rzp.on('payment.failed', (response) => {
      payNowBtn.disabled = false;
      showToast(`Payment failed: ${response.error.description || 'Please try again'}`, 'error');
    });

    payNowBtn.disabled = false;
    rzp.open();
  });

  // Success screen actions
  document.getElementById('success-continue-shopping')?.addEventListener('click', () => {
    document.getElementById('checkout-modal-overlay').classList.add('hidden');
  });

  document.getElementById('success-view-orders')?.addEventListener('click', () => {
    document.getElementById('checkout-modal-overlay').classList.add('hidden');
    document.getElementById('my-orders-btn')?.click();
  });
}

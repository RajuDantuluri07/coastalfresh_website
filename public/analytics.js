// analytics.js

(function() { // IIFE to create a scope for the Analytics object
  'use strict';

  /**
   * The core tracking function that sends data to Google Analytics.
   * @param {string} eventName - The name of the event to track.
   * @param {object} [eventParams={}] - The parameters for the event.
   * @private
   */
  function _track(eventName, eventParams = {}) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, eventParams);
    } else {
      // Fallback for local development or if gtag fails to load
      console.log(`Analytics Event (gtag not found): ${eventName}`, eventParams);
    }
  }

  window.Analytics = {
    /**
     * A generic event tracker.
     * @param {string} eventName - The name of the event.
     * @param {object} [eventParams={}] - The event parameters.
     */
    trackEvent: _track,

    /**
     * Tracks a successful purchase.
     * @param {string} orderId - The transaction ID.
     * @param {number} total - The total value of the order.
     * @param {Array<object>} items - The items in the order.
     */
    trackPurchase: function(orderId, total, items) {
      _track('purchase', {
        transaction_id: orderId,
        value: total,
        currency: 'INR',
        items: items.map(item => ({
          item_id: item.id,
          item_name: item.name,
          item_category: item.category,
          price: item.finalPrice,
          quantity: item.qty
        })),
      });
    },

    /**
     * Tracks when a user starts the checkout process (e.g., redirects to WhatsApp).
     * This can be marked as a conversion event in Google Analytics.
     * @param {string} orderId - The transaction ID for this checkout instance.
     * @param {number} total - The total value of the cart.
     * @param {Array<object>} items - The items in the cart.
     */
    trackBeginCheckout: function(orderId, total, items) {
      _track('begin_checkout', {
        transaction_id: orderId,
        value: total,
        currency: 'INR',
        items: items.map(item => ({
          item_id: item.id,
          item_name: item.name,
          item_category: item.category,
          price: item.finalPrice,
          quantity: item.qty
        })),
      });
    },

    /**
     * Tracks when an item is added to the cart.
     * @param {object} product - The product object being added.
     * @param {number} qty - The quantity being added.
     */
    trackAddToCart: function(product, qty) {
      if (!product) return;
      _track('add_to_cart', {
        currency: 'INR',
        value: product.finalPrice * qty,
        items: [{
          item_id: product.id,
          item_name: product.name,
          item_category: product.category,
          price: product.finalPrice,
          quantity: qty
        }]
      });
    },

    /**
     * Tracks changes in cart item quantity.
     * @param {object} product - The product object being changed.
     * @param {number} delta - The change in quantity (+1 or -1).
     * @param {number} currentQty - The new quantity in the cart.
     */
    trackChangeQty: function(product, delta, currentQty) {
      if (!product) return;
      _track('change_cart_quantity', {
        change: delta,
        item_id: product.id,
        item_name: product.name,
        item_category: product.category,
        price: product.finalPrice,
        quantity: currentQty || 0
      });
    },

    /**
     * Identifies the user in analytics services.
     * @param {object} user - The Firebase user object.
     */
    identifyUser: function(user) {
      if (typeof gtag === 'function' && user && user.uid) {
        gtag('config', 'YOUR_NEW_MEASUREMENT_ID', { 'user_id': user.uid });
        console.log('GA4 user identified with ID:', user.uid);
      }
      if (window.hj && user && user.uid) {
        hj('identify', user.uid, { email: user.email });
        console.log('Hotjar user identified with ID:', user.uid);
      }
    },

    /**
     * Anonymizes the user session on logout.
     */
    anonymizeUser: function() {
      if (window.hj) {
        hj('identify', null, {});
        console.log('Hotjar user session anonymized.');
      }
    }
  };

})();
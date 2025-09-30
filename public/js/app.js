import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { firebaseConfig } from './firebase-config.js';

// App Configuration
export const config = {
    TRUST_ICONS: [
        { icon: 'fas fa-shield-alt', title: 'Hygienic', text: 'Clean & Safe' },
        { icon: 'fas fa-snowflake', title: 'Temp Control', text: 'Ice Packed' },
        { icon: 'fas fa-fish', title: '100% Fresh', text: 'Sourced Daily' },
    ],
    CUSTOMER_REVIEWS: [
        { name: 'Priya S.', location: 'Gachibowli, Hyderabad', rating: 5, image: null, review: 'The freshest seafood I’ve had in Hyderabad! The pomfret was cleaned perfectly. Delivery was on time and packaging was top-notch. Highly recommend!' },
        { name: 'Amit K.', location: 'Jubilee Hills, Hyderabad', rating: 5, image: null, review: 'Finally, authentic coastal taste in the city. The prawns were juicy and the pickles are just like my grandmother used to make. Will be ordering every week.' },
        { name: 'Sunita R.', location: 'Kondapur, Hyderabad', rating: 4, image: null, review: 'Good quality fish and very convenient. The net weight was accurate. Would love to see more variety in small fish, but overall a great experience.' }
    ],
    CATEGORIES_DATA: [
        { key: 'All',    label: 'All',    icon: null },
        { key: 'Prawns', label: 'Prawns', icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005093/shrimp_1_yzblqb.png' },
        { key: 'Fish',   label: 'Fish',   icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005094/food_yircgb.png' },
        { key: 'Crabs',  label: 'Crabs',  icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005094/crab_n5ukwx.png' },
        { key: 'Pickles',label: 'Pickles',icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005242/mason-jar_a5mtg4.png' }
    ],
    ENABLE_FLASH_SALE: true,
    FLASH_SALE_PRODUCT_IDS: [16, 29, 31, 33, 32],
    FLASH_SALE_DURATION_HOURS: 12,
    FEATURED_PRODUCT_IDS: [20, 15, 25, 19, 23],
    FREE_DELIVERY_THRESHOLD: 1500,
    COUPONS: {
        'FRESH10': { type: 'percent', value: 10, description: '10% off your order' },
        'SAVE50': { type: 'fixed', value: 50, description: 'Flat ₹50 off' },
        'NEWUSER': { type: 'percent', value: 15, minOrder: 500, description: '15% off on orders above ₹500' }
    },
    SUPPORT_PHONE_NUMBER: '919985125678',
    ITEMS_PER_PAGE: 8,
};

// App State
export const state = {
    products: [],
    cart: {},
    favorites: new Set(),
    currentPage: 'home',
    pageHistory: ['home'],
    currentCategory: 'All',
    currentSearch: '',
    flashSaleTimerInterval: null,
    currentPageNumber: 1,
    carouselTimer: null,
    previouslyFocusedElement: null,
    currentCarouselIndex: 0,
    currentProductQty: 1,
    isPopupOpen: false,
    searchDebounceTimer: null,
    typewriterTimer: null,
    isShowingAllInCategory: false, // NEW: For category "Show More"
    db: null,
    currentUser: null,
    editingAddressId: null,
    appliedCoupon: null,
    couponError: null,
    selectedPaymentMethod: 'cod',
    deferredInstallPrompt: null,
    installPromptUsed: false,
    afterAddressAction: null,
    afterLoginAction: null,
    currentPopupImageIndex: 0,
    isPopupFavorite: false,
    popupDetailsExpanded: false,
    popupDescriptionExpanded: false,
    popupProduct: null,
    // NEW: Cache for DOM elements
    isNewLogin: false, // Flag to trigger post-login actions like notification prompts
    dom: {
        profile: {
            userName: null,
            userStatus: null,
            logoutBtn: null,
            guestCta: null,
            referBtn: null, // This was missing
            avatar: null
        },
        // NEW: Cache popup elements for performance
        popup: {
            main: null,
            title: null,
            weight: null,
            priceSection: null,
            infoContent: null,
            mainImage: null,
            cta: null,
            contentWrapper: null,
            backBtn: null
        }
    }
};

// --- NEW: Global Error Handling ---

// Catches synchronous errors and unhandled exceptions in event listeners.
window.addEventListener('error', function(event) {
  console.error('Unhandled global error:', event.error);
  // Show a user-friendly message without crashing the app.
  if (UI && typeof UI.showToast === 'function') {
    UI.showToast('Oops! An unexpected error occurred.');
  }
  // Log the exception to your analytics for tracking.
  if (window.Analytics && typeof window.Analytics.trackEvent === 'function') {
    window.Analytics.trackEvent('exception', {
      description: event.error.message,
      fatal: false
    });
  }
});

// Catches unhandled promise rejections (e.g., from async functions).
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (UI && typeof UI.showToast === 'function') {
        UI.showToast('A network or server error occurred.');
    }
    if (window.Analytics && typeof window.Analytics.trackEvent === 'function') {
        window.Analytics.trackEvent('exception', { description: `Promise Rejection: ${event.reason.message || event.reason}`, fatal: false });
    }
});

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch(e) {
  console.error("Firebase initialization error", e);
}

async function init() {
  try {
      // Pass dependencies to modules
      UI.init(state, config, Handlers);
      Handlers.init(state, config, UI);

      // Firebase Auth Listener
      firebase.auth().onAuthStateChanged(Handlers.handleAuthStateChange);
      state.db = firebase.firestore();
      await Handlers.loadFavorites(); // Load favorites on init

      // NEW: Cache profile page DOM elements for performance
      state.dom.profile.userName = document.getElementById('profileUserName');
      state.dom.profile.userStatus = document.getElementById('profileUserStatus');
      state.dom.profile.logoutBtn = document.getElementById('logoutBtn');
      state.dom.profile.guestCta = document.getElementById('guestProfileCta');
      state.dom.profile.referBtn = document.getElementById('referBtn'); // FIX: Correctly cache the refer button
      state.dom.profile.avatar = document.querySelector('#profilePage .profile-avatar-small');

      // NEW: Cache popup DOM elements
      state.dom.popup.main = document.getElementById('productPopup');
      state.dom.popup.title = document.getElementById('popupProductTitle');
      state.dom.popup.weight = document.getElementById('popupProductWeight');
      state.dom.popup.priceSection = document.getElementById('popupPriceSection');
      state.dom.popup.infoContent = document.getElementById('productInfoContent');
      state.dom.popup.mainImage = document.getElementById('popupMainImage');
      state.dom.popup.cta = document.getElementById('popupStickyCta');
      state.dom.popup.contentWrapper = document.getElementById('popupContentWrapper');
      state.dom.popup.backBtn = state.dom.popup.main.querySelector('.popup-back-btn');



      UI.showInitialSkeletons();

      try {
          // --- PERFORMANCE: Fetch ALL products initially. This is a trade-off for simplicity.
          // FIX: Removed orderBy('id') to prevent a missing-index error. Products will be fetched in Firestore's default order.
          // For long-term, create the composite index in your Firebase console as suggested by the browser error log.
          const productsSnapshot = await state.db.collection('products').where('available', '==', true).get();
          state.products = productsSnapshot.docs.map(doc => doc.data());
          
          // Process products to add helper properties
          state.products.forEach(p => {
            if (p.variants && p.variants.length > 0) {
              p.finalPrice = p.variants[0].finalPrice;
              p.mrp = p.variants[0].mrp;
            }
          });

          // Initial Renders
          UI.renderFeaturedProducts();
          UI.renderCategoryProducts();
          UI.renderFlashSale();
          UI.initFlashSaleTimer(); // renderProductSchema() is now removed from here
          // Load cart after products are loaded to ensure data integrity
          Handlers.loadCart();

          const path = window.location.pathname;
          const productMatch = path.match(/^\/product\/(.+)-(\d+)$/);
          const urlParams = new URLSearchParams(window.location.search);

          if (productMatch) {
              const productId = parseInt(productMatch[2], 10);
              UI.showProductPopup(productId);
          }

          const searchQuery = urlParams.get('q');
          if (searchQuery) {
              UI.showPage('categoriesPage');
              const searchInput = document.getElementById('categoriesSearch');
              if (searchInput) {
                  searchInput.value = searchQuery;
                  Handlers.handleCategorySearch({ target: searchInput });
              }
          }
      } catch (error) {
          console.error("Could not load product data:", error);
          UI.showToast('Could not load products. Please check your connection.');
      }

      UI.renderTrustIcons();
      UI.renderCategories();
      UI.renderCustomerReviews();
      Handlers.setupEvents();
      UI.initCarousel('#home .carousel');
      UI.initCarousel('#communicationCarousel');

      if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                
                // If permission has already been granted, initialize messaging to get the token.
                // The prompt for permission is now handled on user action (login) or app install.
                 if (Notification.permission === 'granted') {
                    Handlers.initFirebaseMessaging(registration);
                 }
            } catch (err) {
                console.log('ServiceWorker registration failed: ', err);
            }
        });
      }

      window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault();
          state.deferredInstallPrompt = e;
          UI.showInstallPrompt();

          const profileInstallBtn = document.getElementById('profileInstallBtn');
          if (profileInstallBtn) {
              profileInstallBtn.style.display = 'flex';
          }
      });

      // NEW: Listen for the appinstalled event to prompt for notifications right after installation.
      window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        // After installation, show a toast and then request permission.
        // This provides context to the user for the upcoming permission dialog.
        UI.showToast('App installed! Enable notifications for order updates.');
        
        // Wait a moment for the toast to be seen, then request permission.
        setTimeout(() => {
            navigator.serviceWorker.ready.then(Handlers.initFirebaseMessaging);
        }, 2000);
      });
  } catch (e) {
      console.error("A critical error occurred during app initialization:", e);
      document.body.innerHTML = `<div style="padding: 40px; text-align: center; font-family: sans-serif; color: #333;"><h1>Application Error</h1><p>A critical error occurred and the app cannot start. Please try refreshing the page.</p><p style="color: #888; font-size: 12px; margin-top: 20px;">Error: ${e.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
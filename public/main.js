// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw", // This is safe to be public
  authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
  projectId: "coastal-fresh---sea-foods",
  storageBucket: "coastal-fresh---sea-foods.appspot.com",
  messagingSenderId: "782759620106",
  appId: "1:782759620106:web:960ec7c125faa30675f9f3",
  measurementId: "G-GSHMPRYPW1"
};

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch(e) {
  console.error("Firebase initialization error", e);
}

(function() { // IIFE to avoid polluting global scope
  /* ===== App Configuration ===== */
  const TRUST_ICONS = [
    { icon: 'fas fa-shield-alt', title: 'Hygienic', text: 'Clean & Safe' },
    { icon: 'fas fa-snowflake', title: 'Temp Control', text: 'Ice Packed' },
    { icon: 'fas fa-fish', title: '100% Fresh', text: 'Sourced Daily' },
  ];

  /* ===== NEW: Customer Reviews Data ===== */
  const CUSTOMER_REVIEWS = [
    {
      name: 'Priya S.',
      location: 'Gachibowli, Hyderabad',
      rating: 5,
      image: null,
      review: 'The freshest seafood I’ve had in Hyderabad! The pomfret was cleaned perfectly. Delivery was on time and packaging was top-notch. Highly recommend!'
    },
    {
      name: 'Amit K.',
      location: 'Jubilee Hills, Hyderabad',
      rating: 5,
      image: null,
      review: 'Finally, authentic coastal taste in the city. The prawns were juicy and the pickles are just like my grandmother used to make. Will be ordering every week.'
    },
    {
      name: 'Sunita R.',
      location: 'Kondapur, Hyderabad',
      rating: 4,
      image: null,
      review: 'Good quality fish and very convenient. The net weight was accurate. Would love to see more variety in small fish, but overall a great experience.'
    }
  ];

  /* NEW: Category Data with Icons */
  const CATEGORIES_DATA = [
    { key: 'All',    label: 'All',    icon: null },
    { key: 'Prawns', label: 'Prawns', icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005093/shrimp_1_yzblqb.png' },
    { key: 'Fish',   label: 'Fish',   icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005094/food_yircgb.png' },
    { key: 'Crabs',  label: 'Crabs',  icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005094/crab_n5ukwx.png' },
    { key: 'Pickles',label: 'Pickles',icon: 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005242/mason-jar_a5mtg4.png' }
  ];

  const ENABLE_FLASH_SALE = true; // NEW: Set to false to hide the flash sale section
  const FLASH_SALE_PRODUCT_IDS = [11, 12, 20, 22]; // Configurable product IDs for the flash sale
  const FLASH_SALE_DURATION_HOURS = 12; // Configurable duration in hours
  const FEATURED_PRODUCT_IDS = [17, 13, 21, 1];
  const FREE_DELIVERY_THRESHOLD = 1500;
  const ITEMS_PER_PAGE = 8;

  /* ===== Products DATA ===== */

  /* ===== App State ===== */
  let products = [];
  let cart = {};
  let currentPage = 'home';
  let pageHistory = ['home'];
  let currentCategory = 'All';
  let currentSearch = '';
  let currentPageNumber = 1;
  let carouselTimer = null;
  let previouslyFocusedElement = null; // NEW: For accessibility
  let currentCarouselIndex = 0;
  let currentProductQty = 1;
  let isPopupOpen = false;
  let searchDebounceTimer = null;
  let typewriterTimer = null;
  let db = null; // NEW: Firestore database instance
  let currentUser = null;
  let editingAddressId = null; // NEW: To track which address is being edited
  
  let afterLoginAction = null; // NEW: To handle actions after login (like checkout)
  /* NEW: Variables for popup functionality */
  let currentPopupImageIndex = 0;
  let isPopupFavorite = false;
  let popupDetailsExpanded = false;
  let popupDescriptionExpanded = false;

  let popupProduct = null;

  /* ===== Init ===== */
  async function init() {
    // Firebase Auth Listener
    firebase.auth().onAuthStateChanged(handleAuthStateChange);
    db = firebase.firestore(); // NEW: Initialize Firestore

    // --- NEW: Show skeletons immediately for better perceived performance ---
    showInitialSkeletons();

    try {
      const response = await fetch('/products.json');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      products = await response.json();

      // --- Populate content now that data is available ---
      renderFeaturedProducts();
      renderCatalogProducts();
      renderFlashSale();
      renderProductSchema(); // NEW: Add product schema
      loadCart();

      // Check for search query in URL
      const urlParams = new URLSearchParams(window.location.search);
      const productId = urlParams.get('product');
      if (productId) {
        showProductPopup(productId);
      }
      const searchQuery = urlParams.get('q');
      if (searchQuery) {
        showPage('catalog');
        const searchInput = document.getElementById('catalogSearch');
        if (searchInput) {
          searchInput.value = searchQuery;
          handleCatalogSearch({ target: searchInput });
        }
      }
    } catch (error) {
      console.error("Could not load product data:", error);
      // You could show an error message to the user here.
    }

    // These functions can run independently
    renderTrustIcons();
    renderCategories(); // NEW: Render categories dynamically
    renderCustomerReviews();
    setupEvents();
    initOneSignal(currentUser); // NEW: Initialize OneSignal from external file
    initFlashSaleTimer();
    // Initialize all carousels first to ensure all slides (including duplicates) are in the DOM
    initCarousel('#slides');
    initCarousel('#communicationCarousel .slides');
    // Now lazy load the banners
    lazyLoadBanners();

  }

  function setupEvents() {
    // --- Event Delegation on the Body for Dynamic/Repeated Elements ---
    document.body.addEventListener('click', (e) => {
      const target = e.target; // FIX: Ensure target is defined

      // Product card click (but not on buttons)
      const productCard = target.closest('.product');
      if (productCard && !target.closest('.cart-controls, .add-to-cart-btn')) {
        e.preventDefault();
        const productId = productCard.dataset.id;
        if (productId) showProductPopup(parseInt(productId));
      }

      // Add to cart button on product cards
      const addBtn = target.closest('.add-to-cart-btn');
      if (addBtn) {
        e.stopPropagation();
        const productId = addBtn.dataset.id;
        if (productId) addToCart(parseInt(productId));
      }

      // Quantity controls on product cards
      const productQtyBtn = target.closest('.product .cart-controls .qty-btn');
      if (productQtyBtn) {
        e.stopPropagation();
        const controls = productQtyBtn.closest('.cart-controls');
        const productId = controls.dataset.id;
        if (productId) {
          const change = productQtyBtn.classList.contains('inc') ? 1 : -1;
          updateQty(parseInt(productId), change);
        }
      }

      // Quantity controls in the cart
      const cartQtyBtn = target.closest('.cart-item .qty-controls .cart-qty-btn');
      if (cartQtyBtn) {
        const cartItem = cartQtyBtn.closest('.cart-item');
        const productId = cartItem.dataset.id;
        if (productId) {
          const change = cartQtyBtn.classList.contains('inc') ? 1 : -1;
          updateQty(parseInt(productId), change);
        }
      }

      // Remove from cart button
      const removeBtn = target.closest('.remove-item');
      if (removeBtn) {
        const cartItem = removeBtn.closest('.cart-item');
        const productId = cartItem.dataset.id;
        if (productId) removeFromCart(parseInt(productId));
      }

      // FAQ toggle
      const faqToggle = target.closest('.faq .q');
      if (faqToggle) {
        toggleFAQ(faqToggle);
      }

      // Show More button in catalog
      const showMoreBtn = target.closest('.show-more-btn');
      if (showMoreBtn) {
        showMoreProducts();
      }

      // Carousel slide click
      const slide = target.closest('.slide[data-action]');
      if (slide) {
        const { action, target: slideTarget } = slide.dataset;
        if (action === 'showPage' && typeof showPage === 'function') {
          showPage(slideTarget);
        } else if (action === 'showProductPopup' && typeof showProductPopup === 'function') {
          const productId = parseInt(slideTarget, 10);
          if (!isNaN(productId)) {
            showProductPopup(productId);
          }
        } else if (action === 'openWhatsApp' && typeof openWhatsApp === 'function') {
          // NEW: Handle whatsapp action for banners
          openWhatsApp(slideTarget);
        }
      }
      
      // Product description toggle
      const descToggle = target.closest('.popup-description-toggle');
      if (descToggle) {
        toggleProductDescription();
      }

      // NEW: Accordion toggle for product details
      const detailHeader = target.closest('.detail-header');
      if (detailHeader) {
        const detailItem = detailHeader.closest('.detail-item');
        if (detailItem) {
          const content = detailItem.querySelector('.detail-content');
          const icon = detailHeader.querySelector('i');
          const isOpen = detailItem.classList.toggle('active');

          content.style.maxHeight = isOpen ? content.scrollHeight + 'px' : '0';
          content.style.padding = isOpen ? '0 0 16px 0' : '0';
          if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });

    // Typewriter focus/blur handlers
    const catalogSearchInput = document.getElementById('catalogSearch');
    catalogSearchInput.addEventListener('focus', stopTypewriter);
    catalogSearchInput.addEventListener('blur', () => {
      if (!catalogSearchInput.value) startTypewriter();
    });

    // NEW: Keyboard accessibility for carousel slides and other role="button" elements
    document.body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.matches('.slide[data-action], [role="button"]')) e.target.click();
      }
    });

    // NEW: Tooltip handler
    document.body.addEventListener('click', e => {
      const infoIcon = e.target.closest('.summary-row .fa-info-circle');
      if (infoIcon) {
        e.preventDefault();
        showSimpleTooltip(infoIcon);
      }
    });

    // Login Modal Close Button
    document.querySelector('#loginModal .back-btn').addEventListener('click', closeLoginModal);

    // Auth Form Submissions
    document.getElementById('loginForm').addEventListener('submit', handleEmailLogin);
    document.getElementById('signupForm').addEventListener('submit', handleEmailSignup);
    document.getElementById('googleLoginBtn').addEventListener('click', handleGoogleLogin);
    document.getElementById('forgotPassword').addEventListener('click', handlePasswordReset);

    // NEW: Login/Signup form toggling
    document.getElementById('showLogin').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('authTitle').textContent = 'Welcome Back';
      document.getElementById('authSubtitle').textContent = 'Login to access your account';
      document.getElementById('signupForm').classList.remove('active');
      document.getElementById('loginForm').classList.add('active');
      document.getElementById('authError').textContent = '';
    });
    document.getElementById('showSignup').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('authTitle').textContent = 'Get Started';
      document.getElementById('authSubtitle').textContent = 'Sign up to order the freshest coastal seafood';
      document.getElementById('loginForm').classList.remove('active');
      document.getElementById('signupForm').classList.add('active');
      document.getElementById('authError').textContent = '';
    });
    // --- Static Element Listeners ---
    // Header search inputs
    document.getElementById('catalogSearch').addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => handleCatalogSearch(e), 300);
    });

    // Category filter buttons
    document.getElementById('categories').addEventListener('click', (e) => {
      const categoryButton = e.target.closest('.category');
      if (categoryButton) {
        if (categoryButton.classList.contains('active')) return; // Do nothing if already active

        document.querySelector('.category.active').classList.remove('active');
        categoryButton.classList.add('active');
        currentCategory = categoryButton.dataset.category;
        currentPageNumber = 1;
        document.getElementById('catalogSearch').value = '';
        currentSearch = '';
        renderCatalogProducts();
        if (typeof gtag === 'function') gtag('event', 'select_category', { category: currentCategory });
      }
    });

    // Header buttons (Back, Cart) and View All
    document.querySelector('#home .view-all').addEventListener('click', () => showPage('catalog'));
    // Refined back button listeners to avoid conflicts
    document.querySelector('#catalog .back-btn').addEventListener('click', goBack);
    document.querySelector('#faqPage .back-btn').addEventListener('click', goBack);
    document.querySelector('#ordersPage .back-btn').addEventListener('click', goBack);
    document.querySelector('#profilePage .back-btn').addEventListener('click', goBack);
    document.querySelector('#addressPage .back-btn').addEventListener('click', () => {
      // If we were editing, cancel the edit and show the list
      if (editingAddressId) {
        cancelEditAddress();
      } else goBack();
    });

    // NEW: Event delegation for address list actions
    document.getElementById('addressListContainer').addEventListener('click', e => { // FIX: Use addressListContainer
      const target = e.target;
      // Handle 3-dot menu toggle
      const optionsBtn = target.closest('.address-options-btn');
      if (optionsBtn) {
        const dropdown = optionsBtn.nextElementSibling;
        // Close other open dropdowns
        document.querySelectorAll('.address-dropdown-content.active').forEach(openDropdown => {
          if (openDropdown !== dropdown) {
            openDropdown.classList.remove('active');
          }
        });
        dropdown.classList.toggle('active');
        e.stopPropagation(); // Prevent document click from closing immediately
        return;
      }

      const actionBtn = target.closest('.address-action-btn');
      if (actionBtn) {
        const addressId = actionBtn.dataset.id;
        if (actionBtn.classList.contains('delete-address-btn')) {
          deleteAddress(addressId);
        } else if (actionBtn.classList.contains('set-default-btn')) {
          setDefaultAddress(addressId);
        } else if (actionBtn.classList.contains('edit-address-btn')) {
          editAddress(addressId);
        }
        // Close dropdown after action
        actionBtn.closest('.address-dropdown-content').classList.remove('active');
        return;
      }
    });
    // Close dropdowns if clicking anywhere else on the document
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.address-options-menu')) {
        document.querySelectorAll('.address-dropdown-content.active').forEach(openDropdown => {
          openDropdown.classList.remove('active');
        });
      }
    });

    // NEW: Confirmation modal buttons
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => document.getElementById('confirmDeleteModal').classList.remove('active'));
    document.getElementById('confirmDeleteBtn').addEventListener('click', executeDeleteAddress);


    // Address form submission
    document.getElementById('addressForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) {
        showToast('You must be logged in to save an address.');
        return;
      }

      // --- NEW: Enhanced Validation ---
      const mobileInput = document.getElementById('addressMobile');
      const pincodeInput = document.getElementById('addressPincode');

      if (!/^\d{10}$/.test(mobileInput.value)) {
        showToast('Please enter a valid 10-digit mobile number.');
        mobileInput.focus();
        return;
      }
      if (!/^\d{6}$/.test(pincodeInput.value)) {
        showToast('Please enter a valid 6-digit pincode.');
        pincodeInput.focus();
        return;
      }

      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="loading"></div>';

      const addressData = {
        fullName: document.getElementById('addressFullName').value,
        mobile: mobileInput.value,
        house: document.getElementById('addressHouse').value,
        street: document.getElementById('addressStreet').value,
        city: document.getElementById('addressCity').value,
        pincode: pincodeInput.value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        const addressesRef = db.collection('users').doc(currentUser.uid).collection('addresses');
        
        if (editingAddressId) {
          // Update existing address
          await addressesRef.doc(editingAddressId).update(addressData);
          showToast('Address updated successfully!');
        } else {
          // Add new address
          const snapshot = await addressesRef.get();
          // If this is the first address, make it the default
          if (snapshot.empty) {
            addressData.isDefault = true;
          }
          await addressesRef.add(addressData);
          showToast('Address saved successfully!');
        }

        await renderAddressList(); // Refresh the list view
        showAddressList(); // Show the list
      } catch (error) {
        console.error("Error saving address: ", error);
        showToast('Failed to save address. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Address'; // Reset button text
      }
    });

    // NEW: Listener for the fixed "Add New Address" button
    document.getElementById('addNewAddressBtnFixed').addEventListener('click', showAddressForm);

    // The cart back button is handled separately
    document.querySelector('#cartModal .back-btn').addEventListener('click', closeCart);

    document.querySelectorAll('.cart-btn').forEach(btn => btn.addEventListener('click', showCart));

    // Profile page buttons
    document.querySelector('.profile-button.orders').addEventListener('click', () => showPage('ordersPage'));
    document.querySelector('.profile-button.address').addEventListener('click', async () => {
      if (currentUser) {
        // NEW: Render the list of addresses
        await renderAddressList();
        showPage('addressPage');
      } else {
        showToast('Please login to manage your address.');
        showLoginModal();
      }
    });
    document.querySelector('.profile-button.faq').addEventListener('click', () => showPage('faqPage'));
    document.querySelector('.profile-button.about').addEventListener('click', () => showPage('aboutPage'));
    document.querySelector('.profile-button.support').addEventListener('click', () => openWhatsApp('support'));
    document.querySelector('.profile-button.refer').addEventListener('click', () => showPage('referPage'));
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('loginBtn').addEventListener('click', showLoginModal);
    document.getElementById('profileLoginLink').addEventListener('click', showLoginModal);

    // Product Popup buttons
    document.querySelector('#aboutPage .back-btn').addEventListener('click', goBack);

    // NEW: Refer a Friend page buttons
    document.querySelector('#referPage .back-btn').addEventListener('click', goBack);
    document.getElementById('copyReferralBtn').addEventListener('click', copyReferralLink);
    document.getElementById('shareOnWhatsAppBtn').addEventListener('click', () => openWhatsApp('refer'));

    // Product Popup buttons
    document.querySelector('.popup-back-btn').addEventListener('click', closePopup);
    document.querySelector('.popup-action-btn.favorite').addEventListener('click', toggleFavorite);
    document.querySelector('.popup-action-btn.share').addEventListener('click', shareProduct);
    document.querySelector('.popup-qty-btn.dec').addEventListener('click', () => changePopupQty(-1));
    document.querySelector('.popup-qty-btn.inc').addEventListener('click', () => changePopupQty(1));
    document.querySelector('.popup-add-to-cart-btn').addEventListener('click', addPopupToCart);

    // Cart page buttons
    document.querySelector('#cartModal .empty-cart-btn').addEventListener('click', () => { showPage('catalog'); closeCart(); });
    document.querySelector('#ordersPage .empty-cart-btn').addEventListener('click', () => showPage('home'));

    // FIX: The checkout button is inside a container that gets re-rendered.
    // Attach the listener to the static parent `cart-footer` to ensure it always works.
    document.getElementById('cartFooter').addEventListener('click', (e) => {
      if (e.target.closest('.checkout-btn')) {
        checkout();
      }
    });

    // Bottom Navigation
    document.getElementById('bottomNav').addEventListener('click', e => {
      const navItem = e.target.closest('.nav-item');
      if (!navItem) return;
      const page = navItem.dataset.page;
      if (page === 'cart') {
        showCart();
      } else if (page) {
        if (page === 'profilePage' && !currentUser) {
          // Allow showing profile page, but UI will prompt login
          showPage(page);
        } else {
          showPage(page);
        }
      }
    });
  }

  function renderTrustIcons() {
    const container = document.getElementById('trustStrip');
    if (!container) return;
    
    container.innerHTML = '';
    TRUST_ICONS.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'trust-item';
      item.setAttribute('data-index', String(i));
      item.setAttribute('data-title', t.title);

      // FIX: Correctly create and assign classes to the icon element
      const iconWrap = document.createElement('div');
      iconWrap.className = 'icon-container';
      iconWrap.innerHTML = `<i class="${t.icon}"></i>`;
      const content = document.createElement('div');
      content.className = 'trust-content';
      const title = document.createElement('div'); title.className='trust-title'; title.textContent = t.title;
      const sub = document.createElement('div'); sub.className='trust-sub'; sub.textContent = t.text;

      content.appendChild(title); content.appendChild(sub);
      item.appendChild(iconWrap); item.appendChild(content);
      item.addEventListener('click', () => {
        if (typeof gtag === 'function') gtag('event', 'click', { location: 'trust_strip', item_title: t.title, item_index: i });
      });
      container.appendChild(item);
    });
  }

  /* NEW: Render Categories with Icons */
  function renderCategories() {
    const container = document.getElementById('categories');
    if (!container) return;

    container.innerHTML = CATEGORIES_DATA.map((cat, index) => `
      <button class="category ${index === 0 ? 'active' : ''}" data-category="${cat.key}">
        ${cat.icon ? `<img src="${cat.icon}" alt="${cat.label}" class="category-icon" loading="lazy">` : ''}
        <span>${cat.label}</span>
      </button>
    `).join('');
  }
  /* ===== End of New Function ===== */

  /* ===== NEW: Render Customer Reviews ===== */
  function renderCustomerReviews() {
    const container = document.getElementById('reviewsCarousel');
    if (!container) return;

    container.innerHTML = CUSTOMER_REVIEWS.map(review => {
      // Sanitize inputs to prevent XSS
      const firstName = review.name.split(' ')[0];
      const safeName = DOMPurify.sanitize(firstName);
      const safeLocation = DOMPurify.sanitize(review.location);
      const safeReview = DOMPurify.sanitize(review.review);

      // Check for valid rating
      const rating = (typeof review.rating === 'number' && review.rating >= 0 && review.rating <= 5)
        ? review.rating
        : 0;


      // If an image is not provided, create initials from the name
      const avatar = review.image // FIX: Add meaningful alt text
        ? `<img src="${review.image}" alt="Avatar of ${safeName}" class="review-avatar" loading="lazy">`
        : `<div class="review-avatar-initials">${review.name.charAt(0)}</div>`;

      // Create star rating
      let stars = '';
      for (let i = 0; i < 5; i++) {
        stars += `<i class="fas fa-star ${i < rating ? '' : 'far'}"></i>`; // Use 'far' for empty stars
      }
      
      return `
        <div class="review-card">
          <div class="review-header">
            ${avatar}
            <div class="review-customer">
              <div class="review-name">${safeName}</div>
              <div class="review-location">${safeLocation}</div>
            </div>
          </div>
          <div class="review-rating" role="img" aria-label="Rating: ${rating} out of 5 stars">${stars}</div>
          <p class="review-body">“${safeReview}”</p>
        </div>
      `;
    }).join('');
  }
  /* ===== End of New Function ===== */

  /* ===== NEW: Flash Sale Functions ===== */
  function renderFlashSale() {
    const section = document.getElementById('flashSaleSection');
    if (!ENABLE_FLASH_SALE) {
      if (section) section.style.display = 'none';
      return;
    }

    const container = document.getElementById('flashSaleProducts');
    if (!container) return;

    // 1. Show skeleton loaders first
    let skeletonHTML = '';
    for (let i = 0; i < FLASH_SALE_PRODUCT_IDS.length; i++) {
      skeletonHTML += createSkeletonProductHTML();
    }
    container.innerHTML = skeletonHTML;

    // 2. Render real products once data is available
    const flashSaleProducts = products.filter(p => FLASH_SALE_PRODUCT_IDS.includes(p.id));
    if (flashSaleProducts.length === 0) {
      if (section) section.style.display = 'none';
      return;
    }
    container.innerHTML = flashSaleProducts.map(createProductHTML).join('');
  }

  function initFlashSaleTimer() {
    const countdownContainer = document.getElementById('countdownTimer');
    if (!countdownContainer) return;

    // NEW: Check if the flash sale is enabled
    if (!ENABLE_FLASH_SALE) {
      // The section is already hidden by renderFlashSale, so we just need to not run the timer.
      return;
    }

    let saleEndTime = localStorage.getItem('flashSaleEndTime');
    // Reset timer if it's expired or doesn't exist
    if (!saleEndTime || new Date().getTime() > saleEndTime) {
      saleEndTime = new Date().getTime() + FLASH_SALE_DURATION_HOURS * 60 * 60 * 1000;
      localStorage.setItem('flashSaleEndTime', saleEndTime);
    }

    const hoursEl = countdownContainer.querySelector('.hours');
    const minutesEl = countdownContainer.querySelector('.minutes');
    const secondsEl = countdownContainer.querySelector('.seconds');

    function updateTimer() {
      const now = new Date().getTime();
      const distance = saleEndTime - now;

      if (distance < 0) {
        countdownContainer.innerHTML = "<div class='timer-ended'>Sale Ended!</div>";
        if(timerInterval) clearInterval(timerInterval);
        // Hide the product scroll when the timer ends
        const productsContainer = document.getElementById('flashSaleProducts');
        if(productsContainer) productsContainer.style.display = 'none';
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
      if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
      if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    const timerInterval = setInterval(updateTimer, 1000);
    updateTimer(); // Initial call to display timer immediately
  }
  /* ===== End of New Functions ===== */

  function createSkeletonProductHTML() {
    return `
      <div class="skeleton-card">
        <div class="skeleton-image shimmer"></div>
        <div class="skeleton-info">
          <div class="skeleton-text shimmer w-75"></div>
          <div class="skeleton-text shimmer w-50"></div>
          <div class="skeleton-footer">
            <div class="skeleton-price shimmer"></div>
            <div class="skeleton-button shimmer"></div>
          </div>
        </div>
      </div>
    `;
  }

  /* ===== NEW: SEO Functions ===== */
  function updateSEOTags({ title, description, canonicalPath, imageUrl }) {
    const defaultTitle = 'Coastal Fresh India: Buy Fresh Fish & Seafood Online in Hyderabad';
    const defaultDesc = 'The best place to buy fresh fish and seafood online in Hyderabad, India! Coastal Fresh offers a wide variety of hygienically cleaned fish, prawns, crabs, and authentic Andhra pickles with next-day delivery. Order now for the freshest catch.';
    const defaultImage = 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757311267/Coastal_Fresh_-_Home_page_banner_eg5mbv.png';
    const baseUrl = 'https://www.coastalfresh.in';

    const finalTitle = title || defaultTitle;
    const finalDesc = description || defaultDesc;
    const finalCanonical = baseUrl + (canonicalPath || '/');
    const finalImage = imageUrl || defaultImage;

    document.title = finalTitle;

    const descTag = document.querySelector('meta[name="description"]');
    if (descTag) descTag.setAttribute('content', finalDesc);

    const canonicalTag = document.querySelector('link[rel="canonical"]');
    if (canonicalTag) canonicalTag.setAttribute('href', finalCanonical);

    // Also update Open Graph (OG) tags for social sharing
    document.querySelector('meta[property="og:title"]').setAttribute('content', finalTitle);
    document.querySelector('meta[property="og:description"]').setAttribute('content', finalDesc);
    document.querySelector('meta[property="og:url"]').setAttribute('content', finalCanonical);
    document.querySelector('meta[property="og:image"]').setAttribute('content', finalImage);
    document.querySelector('meta[name="twitter:title"]').setAttribute('content', finalTitle);
    document.querySelector('meta[name="twitter:description"]').setAttribute('content', finalDesc);
    document.querySelector('meta[name="twitter:image"]').setAttribute('content', finalImage);
  }

  /* ===== NEW: Image Optimization Function ===== */
  function getOptimizedImageUrl(url, width, height) {
    if (!url || !url.includes('res.cloudinary.com')) {
      return url; // Return original URL if it's not from Cloudinary
    }
    // Transformations:
    // f_auto: Automatically select the best format (e.g., WebP, AVIF)
    // q_auto: Automatically adjust quality to balance file size and visual fidelity
    // c_fill: Crop to fill the specified dimensions without distortion
    // w_{width}: Target width
    // h_{height}: Target height
    const transformations = `f_auto,q_auto,c_fill,w_${width},h_${height}`;
    
    return url.replace('/image/upload/', `/image/upload/${transformations}/`);
  }

  function renderFeaturedProducts() {
    const container = document.getElementById('featuredProducts');
    if (!container) return;

    const featured = products.filter(p => FEATURED_PRODUCT_IDS.includes(p.id));
    container.innerHTML = featured.map(createProductHTML).join('');
  }
  
  function renderCatalogProducts() {
    const container = document.getElementById('catalogProducts');
    if (!container) return;
    
    // If it's a fresh render (not pagination), show a full-grid loader.
    if (currentPageNumber === 1) {
      let skeletonHTML = '';
      for (let i = 0; i < ITEMS_PER_PAGE; i++) {
        skeletonHTML += createSkeletonProductHTML();
      }
      container.innerHTML = skeletonHTML;
    } else {
      const showMoreBtn = container.querySelector('.show-more-btn');
      if (showMoreBtn) {
        showMoreBtn.innerHTML = '<div class="loading"></div>';
        showMoreBtn.disabled = true;
      }
    }
    
    populateCatalogProducts();
  }

  function populateCatalogProducts() {
    const container = document.getElementById('catalogProducts');
    if (!container) return;

    let filtered = products.filter(p => {
      const matchCategory = currentCategory === 'All' || p.category === currentCategory;
      const matchSearch = !currentSearch || p.name.toLowerCase().includes(currentSearch.toLowerCase()) || 
                         (p.desc && p.desc.toLowerCase().includes(currentSearch.toLowerCase()));
      return matchCategory && matchSearch;
    });

    const startIndex = 0;
    const endIndex = currentPageNumber * ITEMS_PER_PAGE;
    const paginatedProducts = filtered.slice(startIndex, endIndex);

    const oldShowMoreBtn = container.querySelector('.show-more-btn');
    if (oldShowMoreBtn) oldShowMoreBtn.remove();

    if (paginatedProducts.length === 0) {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #8E8E93;">No products found</div>';
      return;
    }

    const newProductsHTML = paginatedProducts.slice((currentPageNumber - 1) * ITEMS_PER_PAGE).map(createProductHTML).join('');

    if (currentPageNumber === 1) {
      container.innerHTML = newProductsHTML;
    } else {
      container.insertAdjacentHTML('beforeend', newProductsHTML);
    }

    if (endIndex < filtered.length) {
      const showMoreBtn = document.createElement('button');
      showMoreBtn.textContent = 'Show More';
      showMoreBtn.className = 'show-more-btn';
      showMoreBtn.style.cssText = 'grid-column: 1 / -1; margin: 20px auto; padding: 12px 24px; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer;';
      showMoreBtn.onclick = showMoreProducts;
      container.appendChild(showMoreBtn);
    }
  }

  function showMoreProducts() {
    currentPageNumber++;
    renderCatalogProducts();
    
    // Track show more event
    if (typeof gtag === 'function') {
      gtag('event', 'show_more', { 
        category: currentCategory, 
        search_term: currentSearch,
        page: currentPageNumber
      });
    }
  }

  function createProductHTML(product) {
    const hasOffer = product.mrp > product.finalPrice;
    const isInCart = cart[product.id];
    const optimizedImage = getOptimizedImageUrl(product.image, 300, 300); // Optimized for grid view
    const sanitizedName = DOMPurify.sanitize(product.name);
    return `
      <div class="product" data-id="${product.id}">
        <div class="product-image">
          ${hasOffer ? `<div class="offer-badge">${product.offer}% OFF</div>` : ''}
          ${!product.available ? `<div class="out-of-stock">Out of Stock</div>` : ''}
          <img src="${optimizedImage}" alt="Fresh ${sanitizedName} delivery in Hyderabad by Coastal Fresh India" loading="lazy" width="300" height="300">
        </div>
        <div class="product-info">
          <div class="product-name">${sanitizedName}</div>
          <div class="product-weight">${product.net} Net Weight</div>
          <div class="product-footer">
            <div class="product-price">
              <span class="price">₹${product.finalPrice}</span>
              ${hasOffer ? `<span class="old-price">₹${product.mrp}</span>` : ''}
            </div>
            ${product.available ? 
              (isInCart ? 
                `<div class="cart-controls" data-id="${product.id}">
                  <button class="qty-btn dec">-</button>
                  <span class="qty">${isInCart}</span>
                  <button class="qty-btn inc">+</button>
                </div>` 
                : `<button class="add-to-cart-btn add-pill" data-id="${product.id}"><i class="fas fa-plus"></i> Add</button>`)
            : ''}
          </div>
        </div>
      </div>
    `;
  }

  /* NEW: Updated showProductPopup function with new design */
  function showProductPopup(id) {
    const numericId = parseInt(id);
    if (isNaN(numericId)) return;
    const product = products.find(p => p.id === numericId);
    if (!product) return;

    popupProduct = product;
    currentProductQty = cart[product.id] || 1;
    const popup = document.getElementById('productPopup');

    // --- NEW: Update SEO Tags for this product ---
    const productUrl = `/?product=${product.id}`;
    const productTitle = `Buy Fresh ${product.name} Online in Hyderabad | Coastal Fresh India`;
    const productDesc = product.desc;
    const optimizedProductImage = getOptimizedImageUrl(product.image, 1200, 630);
    updateSEOTags({ title: productTitle, description: productDesc, canonicalPath: productUrl, imageUrl: optimizedProductImage });

    // --- NEW: Update dynamic ARIA labels ---
    const ratingContainer = document.getElementById('popupRatingContainer');
    if (ratingContainer) ratingContainer.setAttribute('aria-label', '4.2 out of 5 stars'); // Example, make dynamic if you have real ratings

    
    // --- Populate Basic Info ---
    document.getElementById('popupProductTitle').textContent = DOMPurify.sanitize(product.name);
    document.getElementById('popupProductWeight').textContent = `${product.net} Net Weight`; // Simplified main weight display

    // --- Populate Price ---
    const priceSection = document.getElementById('popupPriceSection');
    if (product.mrp > product.finalPrice) {
      const savings = product.mrp - product.finalPrice;
      const offerPercentage = product.offer > 0 ? `, ${product.offer}% OFF` : '';
      priceSection.innerHTML = `
        <span class="popup-price-mrp">₹${product.mrp}</span>
        <span class="popup-price-final">₹${product.finalPrice}</span>
        <span class="popup-price-savings">(Save ₹${savings}${offerPercentage})</span>
      `;
    } else {
      priceSection.innerHTML = `<span class="popup-price-final">₹${product.finalPrice}</span>`;
    }
    
    // --- Populate Collapsible Details ---
    document.getElementById('popupDescriptionContent').innerHTML = `<p>${DOMPurify.sanitize(product.desc)}</p>`;
    document.getElementById('popupWeightContent').innerHTML = `
      <p><strong>Gross Weight:</strong> ${product.gross}<br><strong>Net Weight:</strong> ${product.net}<br><small>(Net weight is after cleaning & processing. Weight loss varies by product.)</small></p>
    `;

    // Set product image
    const optimizedPopupImage = getOptimizedImageUrl(product.image, 600, 600);
    document.getElementById('popupMainImage').src = optimizedPopupImage;
    document.getElementById('popupMainImage').alt = `High-quality ${DOMPurify.sanitize(product.name)} from Coastal Fresh India`;
    
    // Hide image indicators as there's only one image
    document.getElementById('popupImageIndicators').style.display = 'none';
    
    // --- Reset UI State ---
    // Reset accordions
    document.querySelectorAll('.detail-item.active').forEach(item => {
      item.classList.remove('active');
      item.querySelector('.detail-content').style.maxHeight = '0';
      item.querySelector('.detail-content').style.padding = '0';
      const icon = item.querySelector('.detail-header i');
      if (icon) icon.style.transform = 'rotate(0deg)';
    });

    // Update bottom button text
    const totalPrice = product.finalPrice * currentProductQty;
    document.querySelector('.popup-add-to-cart-btn').textContent = `Add to Cart - ₹${totalPrice}`;
    
    // Set quantity
    document.getElementById('popupQty').textContent = currentProductQty;
    
    // Ensure the popup content is scrolled to the top on open
    const contentWrapper = document.getElementById('popupContentWrapper');
    if (contentWrapper) contentWrapper.scrollTop = 0;
    
    isPopupOpen = true;
    openModal(popup, popup.querySelector('.popup-back-btn'));

    // Track product view
    if (typeof gtag === 'function') {
      gtag('event', 'view_item', {
        currency: 'INR',
        value: product.finalPrice,
        items: [{
          item_id: product.id,
          item_name: product.name,
          item_category: product.category,
          price: product.finalPrice
        }]
      });
    }
  }

  /* NEW: Function to change quantity in popup */
  function changePopupQty(change) {
    const qtyElement = document.getElementById('popupQty');
    let qty = parseInt(qtyElement.textContent);
    qty = Math.max(1, Math.min(99, qty + change));
    qtyElement.textContent = qty;
    
    // Update bottom price with quantity
    if (popupProduct) {
      const totalPrice = popupProduct.finalPrice * qty;
      document.querySelector('.popup-add-to-cart-btn').textContent = `Add to Cart - ₹${totalPrice}`;
    }
    
    currentProductQty = qty;
  }

  /* NEW: Function to add to cart from popup */
  function addPopupToCart() {
    if (!popupProduct || !popupProduct.available) return;

    const qty = parseInt(document.getElementById('popupQty').textContent);
    
    if (cart[popupProduct.id]) {
      cart[popupProduct.id] = Math.min(99, cart[popupProduct.id] + qty);
    } else {
      cart[popupProduct.id] = qty;
    }

    saveCart();
    updateCartUI();
    showToast(`${DOMPurify.sanitize(popupProduct.name)} added to cart!`);
    closePopup();
    
    // Track add to cart
    trackAddToCart(popupProduct.id, qty);
  }

  /* NEW: Function to toggle favorite in popup */
  function toggleFavorite() {
    isPopupFavorite = !isPopupFavorite;
    const favoriteBtn = document.querySelector('.popup-action-btn.favorite');
    favoriteBtn.setAttribute('aria-pressed', isPopupFavorite);
    favoriteBtn.setAttribute('aria-label', isPopupFavorite ? 'Remove from Favorites' : 'Add to Favorites');
    // Use Font Awesome classes for solid/regular heart icons
    favoriteBtn.innerHTML = `<i class="${isPopupFavorite ? 'fas' : 'far'} fa-heart"></i>`;
    favoriteBtn.style.color = isPopupFavorite ? 'var(--error-color)' : 'var(--primary-color)';

    // Track favorite action
    if (popupProduct && typeof gtag === 'function') {
      gtag('event', isPopupFavorite ? 'add_to_wishlist' : 'remove_from_wishlist', {
        currency: 'INR',
        value: popupProduct.finalPrice * currentProductQty,
        items: [{
          item_id: popupProduct.id,
          item_name: popupProduct.name,
          item_category: popupProduct.category,
          price: popupProduct.finalPrice
        }]
      });
    }
  }

  /* NEW: Function to share product from popup */
  function shareProduct() {
    if (!popupProduct) return;

    const productUrl = `${window.location.origin}/?product=${popupProduct.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Coastal Fresh - ' + popupProduct.name,
        text: 'Check out this fresh product from Coastal Fresh!',
        url: productUrl
      });
    } else {
      // Fallback for browsers that don't support Web Share API
      alert('Share this product: ' + productUrl);
    }
    
    // Track share action
    if (typeof gtag === 'function') {
      gtag('event', 'share', {
        method: 'Web Share API',
        content_type: 'product',
        item_id: popupProduct.id,
      });
    }
  }

  /* NEW: Function to toggle product description */
  function toggleProductDescription() {
    const container = document.getElementById('popupDescriptionContainer');
    const shortDiv = container.querySelector('.popup-description-short');
    const toggle = container.querySelector('.popup-description-toggle');
    
    popupDescriptionExpanded = !popupDescriptionExpanded;
    
    if (popupDescriptionExpanded) {
      shortDiv.style.webkitLineClamp = 'unset';
      toggle.textContent = 'Read Less';
    } else {
      shortDiv.style.webkitLineClamp = '2';
      toggle.textContent = 'Read More';
    }
  }

  function goBack() {
    if (pageHistory.length > 1) {
      pageHistory.pop(); // Remove the current page
      const previousPage = pageHistory[pageHistory.length - 1];
      showPage(previousPage);
    } else {
      // If history is empty, default to home and reset SEO tags
      showPage('home');
    }
  }

  function closePopup() {
    const popup = document.getElementById('productPopup');
    if (!popup) return;
    
    closeModal(popup);
    isPopupOpen = false;
    popupProduct = null;
    
    const underlyingPage = pageHistory[pageHistory.length - 1] || 'home';
    showPage(underlyingPage, true); // Revert SEO tags without pushing to history
  }

  function addToCart(id, qty = 1) {
    const product = products.find(p => p.id === id);
    if (!product || !product.available) return;

    if (cart[id]) {
      cart[id] = Math.min(99, cart[id] + qty);
    } else {
      cart[id] = qty;
    }

    saveCart();
    updateCartUI();
    updateProductCardState(id); // Targeted update instead of full re-render
    showToast(`${product.name} added to cart!`);
    
    // Track add to cart
    trackAddToCart(id, qty);
  }

  function updateCartUI() {
    updateCartBadges();
    // updateProductCardStates(); // This is now handled by more targeted updates
  }

  /* NEW: Separated badge updates */
  function updateCartBadges() {
    const totalQty = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

    // Update all cart badges
    ['cartCount', 'cartCountCatalog', 'navBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (totalQty > 0) {
          el.style.display = 'flex';
          el.textContent = totalQty > 9 ? '9+' : totalQty;
        } else {
          el.style.display = 'none';
        }
      }
    });
  }

  /* REFACTORED: Targeted product card update */
  function updateProductCardState(productId) {
      const productCards = document.querySelectorAll(`.product[data-id="${productId}"]`);
      if (productCards.length === 0) return;

      const product = products.find(p => p.id === productId);
      if (!product) return;

      const newCardHTML = createProductHTML(product);
      productCards.forEach(card => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newCardHTML;
          card.parentNode.replaceChild(tempDiv.firstElementChild, card);
      });
  }

  function showCart() {
    const items = Object.keys(cart).map(id => {
      const product = products.find(p => p.id === parseInt(id));
      return { ...product, qty: cart[id] };
    });
    
    const cartItems = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');
    const emptyCart = document.getElementById('emptyCart');

    if (items.length === 0) {
      emptyCart.style.display = 'flex';
      cartItems.innerHTML = '';
      cartSummary.innerHTML = '';
      cartFooter.style.display = 'none';
    } else { // REFACTOR: Simplified cart rendering
      emptyCart.style.display = 'none';
      cartFooter.style.display = 'block';
      
      // Render cart items with new layout
      cartItems.innerHTML = items.map(item => {
        const hasOffer = item.mrp > item.finalPrice;
        const subtotal = item.finalPrice * item.qty;
        const totalMrp = (item.mrp || item.finalPrice) * item.qty;
        const optimizedCartImage = getOptimizedImageUrl(item.image, 152, 152); // 76px * 2 for retina
        const itemSavings = (item.mrp - item.finalPrice) * item.qty;

        return `
          <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-image">
              <img src="${optimizedCartImage}" alt="${item.name} in cart">
            </div>
            <div class="cart-item-info">
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-weight">${item.net} Net Weight</div>
            </div>
            <div class="cart-item-actions">
              <div class="cart-item-pricing">
                <span class="cart-item-current-price">₹${subtotal}</span>
                ${hasOffer ? `<span class="cart-item-mrp">₹${totalMrp}</span>` : ''}
              </div>
              <div class="qty-controls" role="group" aria-label="Quantity for ${item.name}">
                <button class="cart-qty-btn dec" aria-label="Decrease quantity">-</button>
                <span class="cart-qty" aria-label="Current quantity: ${item.qty}">${item.qty}</span>
                <button class="cart-qty-btn inc" aria-label="Increase quantity">+</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // REFACTOR: Call centralized summary update function
      updateCartSummary();
    }

    // Show cart modal
    const cartModal = document.getElementById('cartModal');
    openModal(cartModal, cartModal.querySelector('.back-btn'));
    
    // Track cart view
    if (typeof gtag === 'function') {
      const subtotal = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
      gtag('event', 'view_cart', {
        currency: 'INR',
        value: subtotal,
        items: items.map(item => ({
          item_id: item.id,
          item_name: item.name,
          item_category: item.category,
          price: item.finalPrice,
          quantity: item.qty
        }))
      });
    }
  }

  /* NEW: Function to only update the summary in the cart */
  function updateCartSummary() {
    const items = Object.keys(cart).map(id => {
      const product = products.find(p => p.id === parseInt(id));
      return { ...product, qty: cart[id] };
    });

    const cartSummary = document.getElementById('cartSummary');
    if (!cartSummary) return;

    const subtotal = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
    const originalTotal = items.reduce((sum, item) => sum + ((item.mrp || item.finalPrice) * item.qty), 0);
    const savings = originalTotal - subtotal;
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : 50;
    const total = subtotal + deliveryFee;

    document.querySelector('.checkout-btn').innerHTML = `<span>Proceed to Checkout</span> <span class="checkout-btn-price">₹${total}</span>`;

    cartSummary.innerHTML = ` 
      <div class="cart-summary">
        ${subtotal < FREE_DELIVERY_THRESHOLD ? `
          <div class="delivery-progress-container">
            <div class="delivery-progress-text">
              <span>🎉 Add ₹${FREE_DELIVERY_THRESHOLD - subtotal} more for FREE Delivery!</span>
            </div>
            <div class="progress-bar">
              <div class="progress-bar-fill" style="width: ${(subtotal / FREE_DELIVERY_THRESHOLD) * 100}%;"></div>
            </div>
          </div>
        ` : ''}
        <div class="summary-row"><span>Subtotal</span><span>₹${subtotal}</span></div>
        ${savings > 0 ? `<div class="summary-row summary-savings"><span>Total Savings</span><span>-₹${savings}</span></div>` : ''}
        <div class="summary-row">
          <span>Delivery Fee <i class="fas fa-info-circle" title="Free on orders over ₹${FREE_DELIVERY_THRESHOLD}"></i></span>
          <span>${deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
        </div>
        <div class="summary-row summary-total"><span>Total</span><span>₹${total}</span></div>
      </div>
    `;

    // Also check if cart is now empty
    if (items.length === 0) {
      document.getElementById('emptyCart').style.display = 'flex';
      document.getElementById('cartFooter').style.display = 'none';
    }
  }

  function closeCart() {
    const cartModal = document.getElementById('cartModal');
    closeModal(cartModal);
  }

  function updateQty(id, change) {
    if (!cart[id]) return;

    cart[id] += change;
    if (cart[id] <= 0) {
      delete cart[id];
    }
    saveCart();
    
    // If we're on the cart page, refresh it
    if (document.getElementById('cartModal').classList.contains('active')) {
      // More efficient update: just update the specific item and the summary
      const itemEl = document.querySelector(`.cart-item[data-id="${id}"]`);
      if (itemEl) {
        if (cart[id]) { // If item still in cart, update its values
          const product = products.find(p => p.id === id);
          const subtotal = product.finalPrice * cart[id];
          const totalMrp = product.mrp * cart[id];
          const qtyEl = itemEl.querySelector('.cart-qty');
          const priceEl = itemEl.querySelector('.cart-item-current-price');
          const mrpEl = itemEl.querySelector('.cart-item-mrp');
          
          qtyEl.textContent = cart[id];
          priceEl.textContent = `₹${subtotal}`;
          if (mrpEl) mrpEl.textContent = `₹${totalMrp}`;
        } else {
          itemEl.classList.add('removing');
          itemEl.addEventListener('transitionend', () => itemEl.remove(), { once: true });
        }
      }
      updateCartSummary();
      updateCartBadges();
    } else {
      updateCartUI();
    }
    updateProductCardState(id);
    
    // Track quantity change
    trackChangeQty(id, change);
  }

  function removeFromCart(id) {
    const numericId = parseInt(id);
    if (!cart[numericId]) return;

    const product = products.find(p => p.id === numericId);
    const qtyToRemove = cart[numericId]; // Get quantity before deleting
    delete cart[numericId];
    saveCart();

    // Animate removal if the cart is open
    const cartItemEl = document.querySelector(`#cartModal .cart-item[data-id="${numericId}"]`);
    if (cartItemEl) {
      cartItemEl.classList.add('removing');
      cartItemEl.addEventListener('transitionend', () => cartItemEl.remove(), { once: true });
    }

    updateCartUI();
    updateCartSummary();
    updateProductCardState(numericId);

    // Track removal
    if (typeof gtag === 'function') {
      const product = products.find(p => p.id === parseInt(id));
    }
  }

  async function checkout() {
    const cartFooter = document.getElementById('cartFooter');
    const items = Object.keys(cart).map(id => {
      const product = products.find(p => p.id === parseInt(id));
      return { ...product, qty: cart[id] };
    });
    
    if (items.length === 0) return;

    // 1. Check if user is logged in
    if (!currentUser) {
      // FIX: Close the cart modal before showing the login modal for a cleaner transition.
      // We don't use the generic closeCart() function here to avoid side effects.
      document.getElementById('cartModal').classList.remove('active');
      showToast('Please sign up or log in to place your order.');
      afterLoginAction = checkout; // Set the action to perform after a successful login.
      showLoginModal(); // Now, show the login modal.
      return;
    }

    // 2. Fetch user's default address from Firestore
    let userAddress = null;
    try {
      const addressSnapshot = await db.collection('users').doc(currentUser.uid).collection('addresses').where('isDefault', '==', true).limit(1).get();
      if (!addressSnapshot.empty) {
        userAddress = addressSnapshot.docs[0].data();
      }
    } catch (error) {
      console.error("Error fetching user address for checkout:", error);
      showToast("Could not verify your address. Please try again.");
      return;
    }

    // 3. If no address, redirect to address page
    if (!userAddress) {
      // NEW: Directly show the address page and form for a smoother flow.
      showToast('Please add a delivery address to continue.');
      showPage('addressPage');
      showAddressForm(); // Explicitly show the form.
      closeCart(); // Close cart to show the address page clearly
      return;
    }

    // 4. Construct the WhatsApp message with cart and address
    const subtotal = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
    const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : 50;
    const total = subtotal + deliveryFee;

    let message = "Hi! I'd like to place an order:\n\n";
    items.forEach(item => {
      const safeName = item.name.replace(/[^\w\s-]/g, '');
      message += `• ${safeName} x${item.qty} - ₹${item.finalPrice * item.qty}\n`;
    });
    message += `\nSubtotal: ₹${subtotal}\nDelivery: ${deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}\nTotal: ₹${total}\n`;
    message += `\n--- Delivery Address ---\nName: ${userAddress.fullName}\nMobile: ${userAddress.mobile}\nAddress: ${userAddress.house}, ${userAddress.street}, ${userAddress.city}, ${userAddress.pincode}\n`;
    message += "\nPlease confirm availability.";

    window.open(`https://wa.me/919985125678?text=${encodeURIComponent(message)}`, '_blank');

    if (items.length > 0 && typeof gtag === 'function') {
      gtag('event', 'begin_checkout', {
        currency: 'INR',
        value: subtotal,
        items: items.map(item => ({
          item_id: item.id,
          item_name: item.name,
          item_category: item.category,
          price: item.finalPrice,
          quantity: item.qty
        }))
      });
    }
  }

  function showPage(page, fromHistory = false) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(page).classList.add('active');
    
    // Manage navigation history
    if (!fromHistory && page !== 'cart' && page !== pageHistory[pageHistory.length - 1]) {
      // Avoid adding duplicates or popups to history
      pageHistory.push(page);
    }

    // --- NEW: Update SEO tags for the current page ---
    let pageTitle, pageDesc, pagePath;
    if (page === 'catalog') {
      pageTitle = 'All Products - Fish, Prawns, Crabs & More | Coastal Fresh India';
      pageDesc = 'Browse our entire collection of fresh seafood, including Pomfret, Prawns, Crabs, and authentic Andhra pickles. Order online for next-day delivery in Hyderabad.';
      pagePath = '/catalog'; // Conceptual path for SEO
    } else if (page === 'faqPage') {
      pageTitle = 'Frequently Asked Questions | Coastal Fresh India';
      pageDesc = 'Find answers to common questions about our delivery, sourcing, freshness, and payment for fresh seafood in Hyderabad.';
      pagePath = '/faq'; // Conceptual path for SEO
    } else if (page === 'referPage') {
      pageTitle = 'Refer a Friend & Earn Rewards | Coastal Fresh India';
      pageDesc = 'Share Coastal Fresh with your friends! They get 10% off their first order, and you get a 10% discount on your next purchase. Start sharing and earning today.';
      pagePath = '/refer'; // Conceptual path for SEO
    } else if (page === 'profilePage' || page === 'addressPage' || page === 'ordersPage') {
      pageTitle = 'Your Account | Coastal Fresh India';
      pageDesc = 'Manage your orders, addresses, and profile settings at Coastal Fresh India.';
      pagePath = '/profile'; // Conceptual path for SEO
    } else {
      // Default to home page SEO
      pageTitle = null; pageDesc = null; pagePath = '/';
    }
    updateSEOTags({ title: pageTitle, description: pageDesc, canonicalPath: pagePath });

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page='${page}']`);
    if (navItem) navItem.classList.add('active');
    
    currentPage = page;
    window.scrollTo(0, 0); // Scroll to top on page change
    
    // NEW: Show/hide ticker and adjust header based on the current page
    const ticker = document.querySelector('.ticker-container');
    const headers = document.querySelectorAll('.header');
    if (page === 'home' || page === 'catalog') {
      if (ticker) ticker.style.display = 'block';
      headers.forEach(h => h.style.top = '30px');
    } else {
      if (ticker) ticker.style.display = 'none';
      headers.forEach(h => h.style.top = '0px');
    }

    // NEW: Manage typewriter animation based on page
    if (page === 'catalog') {
      startTypewriter();
    } else {
      stopTypewriter();
    }

  }

  function handleCatalogSearch(e) {
    currentSearch = e.target.value;
    currentPageNumber = 1;
    renderCatalogProducts();
    
    // Track search
    if (typeof gtag === 'function' && currentSearch) {
      gtag('event', 'view_search_results', {
        search_term: currentSearch,
        category: currentCategory
      });
    }
  }

  function showToast(text) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');
    if (toast && toastText) {
      toastText.textContent = text;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
  }

  function initCarousel(slidesSelector, isInfinite = true) {
    const slides = document.querySelector(slidesSelector);
    if (!slides) return;

    const carouselContainer = slides.closest('.carousel, .communication-carousel');
    if (!carouselContainer) return;

    // FIX: Get the correct number of slides *before* adding clones.
    const total = slides.children.length;
    const dotsContainer = carouselContainer.querySelector('.carousel-dots');

    if (total <= 1) {
      if(dotsContainer) dotsContainer.style.display = 'none';
      return; // Don't initialize for single-slide carousels
    }

    // --- NEW: Infinite Loop Logic ---
    if (isInfinite) {
      const firstClone = slides.firstElementChild.cloneNode(true);
      const lastClone = slides.lastElementChild.cloneNode(true);
      slides.appendChild(firstClone);
      slides.insertBefore(lastClone, slides.firstElementChild);
    }

    let currentIndex = 0;
    let timer = null;
    let isTransitioning = false;

    // Create dots if container exists
    if (dotsContainer) {
        dotsContainer.innerHTML = Array.from({ length: total }, (_, i) => 
            `<div class="dot ${i === 0 ? 'active' : ''}"></div>`
        ).join('');
    }
    const dots = dotsContainer ? dotsContainer.children : [];

    function goToSlide(index) {
      if (isTransitioning) return;
      isTransitioning = true;

      currentIndex = index;
      const offset = isInfinite ? 1 : 0;
      slides.style.transition = 'transform 0.5s ease';
      slides.style.transform = `translateX(${-(currentIndex + offset) * 100}%)`;

      // FIX: Update dots correctly for infinite loop
      if (dotsContainer) {
        let realIndex = index;
        if (index === total) realIndex = 0;
        if (index === -1) realIndex = total - 1;
        Array.from(dots).forEach((dot, i) => dot.classList.toggle('active', i === realIndex));
      }
    }

    slides.addEventListener('transitionend', () => {
      isTransitioning = false;
      if (isInfinite) {
        if (currentIndex === -1) {
          slides.style.transition = 'none';
          currentIndex = total - 1;
          slides.style.transform = `translateX(${-(currentIndex + 1) * 100}%)`;
        }
        if (currentIndex === total) {
          slides.style.transition = 'none';
          currentIndex = 0;
          slides.style.transform = `translateX(-100%)`;
        }
      }
    });

    function next() { 
      if (isTransitioning) return;
      goToSlide(currentIndex + 1);
    }

    function startTimer() {
      stopTimer();
      timer = setInterval(next, 5000);
    }
    function stopTimer() {
      clearInterval(timer);
    }

    carouselContainer.addEventListener('mouseenter', stopTimer);
    carouselContainer.addEventListener('mouseleave', startTimer);
    
    // Add touch events for mobile swipe
    let startX = 0;
    let isDragging = false;
    
    carouselContainer.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      stopTimer();
    });
    
    carouselContainer.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const currentX = e.touches[0].clientX;
      const diff = startX - currentX;
      slides.style.transform = `translateX(calc(${-currentIndex * 100}% - ${diff}px))`;
    });
    
    carouselContainer.addEventListener('touchend', (e) => {
      if (isDragging) {
        isDragging = false;
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        slides.style.transition = 'transform 0.5s ease'; // Restore transition
        if (Math.abs(diff) > 50) {
          goToSlide(diff > 0 ? currentIndex + 1 : currentIndex - 1);
        } else {
          goToSlide(currentIndex);
        }
        startTimer();
      }
    });

    // Initial position for infinite carousel
    if (isInfinite && total > 1) slides.style.transform = 'translateX(-100%)';

    document.addEventListener('visibilitychange', () => {
      document.hidden ? stopTimer() : startTimer();
    });

    startTimer();
  }

  function startTypewriter() {
    if (typewriterTimer) clearTimeout(typewriterTimer);

    const base = 'Search — ';
    const names = ['Prawns', 'Rohu', 'Sea Bass', 'Crab', 'Pickle'];
    let i = 0, pos = 0, dir = 1, pause = 0;

    // FIX: Target the correct search input and remove reference to non-existent 'searchInput'
    const inputs = [document.getElementById('catalogSearch')].filter(Boolean);

    function tick() {
      const shouldAnimate = inputs.every(input => document.activeElement !== input && !input.value);
      if (!shouldAnimate) return; // Stop if user is interacting

      if (pause > 0) {
        pause--;
      } else {
        const full = names[i];
        const text = full.slice(0, pos);
        inputs.forEach(input => input.setAttribute('placeholder', base + text));

        pos += dir;
        if (pos > full.length) { // Finished typing
          pause = 15; dir = -1;
        }
        if (pos < 0) { // Finished deleting
          dir = 1; i = (i + 1) % names.length; pos = 0;
        }
      }
      typewriterTimer = setTimeout(tick, dir === 1 ? 120 : 80);
    }
    tick();
  }

  /* NEW: Function to stop the typewriter animation */
  function stopTypewriter() {
    if (typewriterTimer) clearTimeout(typewriterTimer);
    const input = document.getElementById('catalogSearch');
    if (input) input.setAttribute('placeholder', 'Search products...');
  }

  /* ===== NEW: Skeleton Rendering Functions ===== */
  function showInitialSkeletons() {
    const featuredContainer = document.getElementById('featuredProducts');
    if (featuredContainer) {
      let skeletonHTML = '';
      for (let i = 0; i < FEATURED_PRODUCT_IDS.length; i++) {
        skeletonHTML += createSkeletonProductHTML();
      }
      featuredContainer.innerHTML = skeletonHTML;
    }

    const catalogContainer = document.getElementById('catalogProducts');
    if (catalogContainer) {
      let skeletonHTML = '';
      for (let i = 0; i < ITEMS_PER_PAGE; i++) {
        skeletonHTML += createSkeletonProductHTML();
      }
      catalogContainer.innerHTML = skeletonHTML;
    }
    // Note: Flash sale skeletons are handled within its own render function.
  }

  /* ===== NEW: Tooltip Functions ===== */
  function showSimpleTooltip(targetElement) {
    const tooltip = document.getElementById('simpleTooltip');
    const text = targetElement.getAttribute('title');
    if (!tooltip || !text) return;

    // Hide any other tooltips first
    hideSimpleTooltip();

    tooltip.textContent = text;
    tooltip.classList.add('show');

    const targetRect = targetElement.getBoundingClientRect();

    // Position tooltip centered above the target element
    const top = targetRect.top - 8; // 8px gap above the icon
    const left = targetRect.left + (targetRect.width / 2);

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Set a timer to auto-hide the tooltip after a few seconds
    setTimeout(hideSimpleTooltip, 3000);
  }

  function hideSimpleTooltip() {
    const tooltip = document.getElementById('simpleTooltip');
    if (tooltip) {
      tooltip.classList.remove('show');
    }
  }
  /* ===== End of New Functions ===== */


  function lazyLoadBanners() {
    // FIX: Observe individual slides instead of the whole carousel to ensure all images load.
    const slides = document.querySelectorAll('.slide img[data-src]');
    if (slides.length === 0) return;

    const observer = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const isCommBanner = img.closest('.communication-carousel');
          const bannerHeight = isCommBanner ? 132 : 300; // 66px * 2 for retina vs 150px * 2

          // Get optimized banner images
          const originalSrc = img.dataset.src;
          const optimizedSrc = getOptimizedImageUrl(originalSrc, 960, bannerHeight);
          img.src = optimizedSrc;
          img.removeAttribute('data-src');
          img.onload = () => {
            img.parentElement.classList.add('loaded');
          };
          // FIX: Add this check in case the image is already cached by the browser
          if (img.complete) {
              img.parentElement.classList.add('loaded');
          }
          observer.unobserve(img); // Stop observing this specific image
        }
      });
    }, { rootMargin: '100px' }); // Start loading when it's 100px away from viewport
    slides.forEach(slide => observer.observe(slide));
  }

  function saveCart() {
    try {
      localStorage.setItem('coastalFreshCart', JSON.stringify(cart));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, cart may not persist.');
      } else {
        console.error('Error saving cart:', e);
      }
    }
  }

  function toggleFAQ(button) {
    const faq = button.closest('.faq');
    if (!faq) return;
    
    const isActive = faq.classList.contains('active');
    document.querySelectorAll('.faq.active').forEach(item => {
      if (item !== faq) item.classList.remove('active');
    });
    
    faq.classList.toggle('active', !isActive);
    
    // Rotate chevron
    const chevron = button.querySelector('.fa-chevron-down');
    if (chevron) {
      chevron.style.transform = faq.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0)';
    }
    
    if (faq.classList.contains('active')) {
      const qTextEl = button.querySelector('.q-text');
      const qText = qTextEl ? qTextEl.textContent : '';
      if (typeof gtag === 'function') gtag('event', 'faq_click', { question: qText });
    }
  }

  /* ===== NEW: Refer a Friend Functions ===== */
  function copyReferralLink() {
    const referralLink = document.getElementById('referralLink').textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink).then(() => {
        showToast('Referral link copied!');
      }, (err) => {
        console.error('Could not copy text: ', err);
        showToast('Failed to copy link.');
      });
    }
  }

  function openWhatsApp(type) {
    let message = '';
    let url = 'https://wa.me/919985125678'; // Default to business number for support

    if (type === 'support') {
      message = 'Hi Coastal Fresh, I need assistance with my order.';
    } else if (type === 'refer') {
      const referralLink = document.getElementById('referralLink').textContent;
      message = `Hey! I’ve been ordering seafood from Coastal Fresh – always fresh, neatly cleaned and delivered to my home in Hyderabad. You should try it! Use my referral link for 10% off on your first order. 👉 ${referralLink}`;
      url = 'https://wa.me/'; // Use generic URL to allow sharing with any contact
    }
    window.open(`${url}?text=${encodeURIComponent(message)}`, '_blank');
  }

  function loadCart() {
    try {
      const saved = localStorage.getItem('coastalFreshCart');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Sanitize cart data
        cart = sanitizeCartShape(parsed);
        updateCartUI();
      }
    } catch (e) {
      console.error('Error loading cart from localStorage:', e);
    }
  }

 function sanitizeCartShape(cartData) {
if (!cartData || typeof cartData !== 'object') return {};
const sanitized = {};

for (const [id, qty] of Object.entries(cartData)) {
  // Validate product ID exists
  const product = products.find(p => p.id === parseInt(id));
  if (!product) continue;

  // Validate and clamp quantity
  const numericQty = parseInt(qty);
  if (isNaN(numericQty)) continue;

  const clampedQty = Math.max(0, Math.min(99, numericQty));
  if (clampedQty > 0) {
    sanitized[id] = clampedQty;
  }
}

return sanitized;
}

  /* ===== NEW: Auth Functions ===== */
  function showLoginModal(e) {
    if (e) e.preventDefault();
    const loginModal = document.getElementById('loginModal');
    openModal(loginModal, loginModal.querySelector('#signupEmail'));

    // ALWAYS reset to the default signup view when the modal is opened.
    document.getElementById('authTitle').textContent = 'Get Started';
    document.getElementById('authSubtitle').textContent = 'Sign up to order the freshest coastal seafood';
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('signupForm').classList.add('active');
  }

  function closeLoginModal() {
    const loginModal = document.getElementById('loginModal');
    closeModal(loginModal);
  }

  function handleEmailSignup(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const authError = document.getElementById('authError');
    authError.textContent = '';

    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(userCredential => {
        // NEW: Track successful sign-up event in GA4
        if (typeof gtag === 'function') {
          gtag('event', 'sign_up', {
            method: 'Email'
          });
        }
        showToast('Account created successfully!');
        closeLoginModal();
      })
      .catch(error => {
        authError.textContent = error.message;
        // Also track signup failure
        if (typeof gtag === 'function') {
          gtag('event', 'sign_up_failure', {
            method: 'Email',
          });
        }
      });
  }

  function handleEmailLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const authError = document.getElementById('authError');
    authError.textContent = '';

    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(userCredential => {
        // NEW: Track successful login event in GA4
        if (typeof gtag === 'function') {
          gtag('event', 'login', {
            method: 'Email'
          });
        }
        showToast('Logged in successfully!');
        closeLoginModal();
      })
      .catch(error => {
        authError.textContent = error.message;
      });
  }

  function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const authError = document.getElementById('authError');
    authError.textContent = '';
    firebase.auth().signInWithPopup(provider)
      .then(result => {
        // NEW: Track sign_up or login events for Google Auth
        if (typeof gtag === 'function') {
          // Check if this is a new user or a returning one
          if (result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
            gtag('event', 'sign_up', {
              method: 'Google'
            });
          } else {
            gtag('event', 'login', {
              method: 'Google'
            });
          }
        }

        // If this is the first time the user is signing in with Google
        showToast(`Welcome, ${result.user.displayName}!`);
        closeLoginModal();
      }).catch(error => {
        authError.textContent = error.message;
        if (typeof gtag === 'function') gtag('event', 'login_failure', { method: 'Google' });
      });
  }

  function handlePasswordReset(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const authError = document.getElementById('authError');
    if (!email) {
      authError.textContent = 'Please enter your email in the login form to reset password.';
      return;
    }
    firebase.auth().sendPasswordResetEmail(email)
      .then(() => {
        showToast('Password reset email sent!');
      })
      .catch(error => {
        authError.textContent = error.message;
      });
  }

  function handleLogout() {
    firebase.auth().signOut().then(() => {
      showToast('You have been logged out.');
      showPage('home');
    }).catch(error => {
      console.error('Logout Error:', error);
    });
  }

  function handleAuthStateChange(user) {
    const isNewLogin = !currentUser && user; // Check if this is a transition from logged-out to logged-in
    currentUser = user;
    updateUIForAuthState();

    if (user) { // User is logged in
      // Associate this device with the user's ID in OneSignal
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          await OneSignal.login(user.uid);
          console.log('OneSignal user logged in with ID:', user.uid);
        });
      }

      // NEW: Identify user in GA4 and Hotjar for unified session tracking
      if (typeof gtag === 'function') {
        gtag('config', 'G-GSHMPRYPW1', { 'user_id': user.uid });
        console.log('GA4 user identified with ID:', user.uid);
      }
      if (window.hj) {
        hj('identify', user.uid, { email: user.email });
        console.log('Hotjar user identified with ID:', user.uid);
      }

      // If there was a pending action (like checkout), execute it now.
      if (typeof afterLoginAction === 'function') {
        setTimeout(afterLoginAction, 100);
        afterLoginAction = null; // Clear the action so it doesn't run again
      }
    } else { // User is logged out
      // Disassociate the device from the user ID
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          await OneSignal.logout();
          console.log('OneSignal user logged out.');
        });
      }
      // NEW: Forget user on logout in Hotjar
      if (window.hj) {
        hj('identify', null, {});
        console.log('Hotjar user session anonymized.');
      }
    }
  }

  function updateUIForAuthState() {
    const userNameEl = document.getElementById('profileUserName');
    const userStatusEl = document.getElementById('profileUserStatus');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtn');
    const loginLink = document.getElementById('profileLoginLink');
    const avatarEl = document.querySelector('.profile-avatar-small');

    if (currentUser) {
      // --- Update Avatar ---
      if (currentUser.photoURL) {
        avatarEl.innerHTML = `<img src="${currentUser.photoURL}" alt="Profile Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      } else {
        avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
      }

      // NEW: Update referral link with user ID
      const referralLinkEl = document.getElementById('referralLink');
      if (referralLinkEl) {
        const refCode = btoa(currentUser.uid).substring(0, 8).replace(/[/+=]/g, '');
        referralLinkEl.textContent = `https://coastalfresh.in?ref=${refCode}`;
      }

      // --- Update Name ---
      let displayName = 'Valued Customer';
      if (currentUser.displayName) {
        // Use the full display name provided by the auth provider (Google, etc.)
        displayName = currentUser.displayName;
      } else if (currentUser.email) {
        // For email/password signups, derive a name from the email address.
        const emailName = currentUser.email.split('@')[0];
        // Clean up common separators like '.', '_', or '-' and take the first part.
        const cleanedName = emailName.replace(/[\._-]/g, ' ').split(' ')[0];
        displayName = cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1);
      }

      userNameEl.textContent = displayName;
      userStatusEl.textContent = currentUser.email;
      logoutBtn.style.display = 'flex';
      loginBtn.style.display = 'none';
      if (loginLink) loginLink.style.display = 'none';
    } else {
      // --- Reset to Guest State ---
      avatarEl.innerHTML = `<i class="fas fa-user"></i>`; // Reset avatar
      userNameEl.textContent = 'Guest User';

      // Reset referral link to a generic one
      const referralLinkEl = document.getElementById('referralLink');
      if (referralLinkEl) {
        referralLinkEl.textContent = `https://coastalfresh.in?ref=GUEST123`;
      }
      userStatusEl.innerHTML = 'You are browsing as a guest. <a href="#" id="profileLoginLink">Login</a>';
      // Re-add event listener as innerHTML removes it
      document.getElementById('profileLoginLink').addEventListener('click', showLoginModal);

      logoutBtn.style.display = 'none';
      loginBtn.style.display = 'none';
    }
  }
  /* ===== End of Auth Functions ===== */

  /* ===== NEW: Address Page Functions ===== */
  function showAddressForm() {
    editingAddressId = null; // Ensure we are in "add new" mode
    document.getElementById('addressForm').reset();
    document.getElementById('addressCity').value = 'Hyderabad';
    if (currentUser.displayName) {
      document.getElementById('addressFullName').value = currentUser.displayName;
    }
    document.getElementById('addressListContainer').style.display = 'none';
    document.getElementById('addressFormContainer').style.display = 'block';
    document.querySelector('#addressForm .cta').textContent = 'Save Address';
  }

  function showAddressList() {
    document.getElementById('addressListContainer').style.display = 'block';
    document.getElementById('addressFormContainer').style.display = 'none';
  }

  async function renderAddressList() {
    if (!currentUser) return;

    const listContainer = document.getElementById('addressListContainer');
    const addNewAddressBtnFixed = document.getElementById('addNewAddressBtnFixed');
    listContainer.innerHTML = '<div class="loading" style="margin: 40px auto;"></div>'; // Show loader
    addNewAddressBtnFixed.style.display = 'none'; // Hide fixed button by default

    try {
      const addressesRef = db.collection('users').doc(currentUser.uid).collection('addresses');
      const snapshot = await addressesRef.orderBy('updatedAt', 'desc').get();

      if (snapshot.empty) {
        listContainer.innerHTML = `
          <div class="empty-state-address">
            <i class="fas fa-map-marker-alt"></i>
            <h3>No Saved Addresses</h3>
            <p>Add an address for faster checkout.</p>
          </div>
        `;
        // Don't automatically show the form here unless it's part of the checkout flow.
        showAddressForm(); // Automatically show the form if no addresses exist.
      } else {
        let addressesHTML = snapshot.docs.map(doc => {
          const address = doc.data();
          return `
            <div class="address-item ${address.isDefault ? 'default' : ''}" data-id="${doc.id}" role="listitem">
              <div class="address-main-content">
                <i class="fas fa-map-marker-alt address-pin-icon"></i>
                <div class="address-text-content">
                  <div class="address-name-line">
                    <span class="address-name">${DOMPurify.sanitize(address.fullName)}</span>
                    ${address.isDefault ? '<span class="default-badge" aria-label="Default Address">Default</span>' : ''}
                  </div>
                  <p class="address-full-text">${DOMPurify.sanitize(address.house)}, ${DOMPurify.sanitize(address.street)}<br>${DOMPurify.sanitize(address.city)}, ${DOMPurify.sanitize(address.pincode)}</p>
                  <div class="address-mobile-line">
                    <i class="fas fa-mobile-alt"></i>
                    <span>${DOMPurify.sanitize(address.mobile)}</span>
                  </div>
                </div>
              </div>
              <div class="address-options-menu">
                <button class="address-options-btn" aria-label="Address options"><i class="fas fa-ellipsis-v"></i></button>
                <div class="address-dropdown-content">
                  <button class="address-action-btn edit-address-btn" data-id="${doc.id}" aria-label="Edit Address">Edit</button>
                  <button class="address-action-btn delete-address-btn" data-id="${doc.id}" aria-label="Delete Address">Delete</button>
                  ${!address.isDefault ? `<button class="address-action-btn set-default-btn" data-id="${doc.id}" aria-label="Set as Default">Set as Default</button>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('');

        listContainer.innerHTML = addressesHTML;
        addNewAddressBtnFixed.style.display = 'flex'; // Show fixed button
        showAddressList(); // Show the list view
      }
    } catch (error) {
      console.error("Error rendering addresses:", error);
      listContainer.innerHTML = '<p style="color: var(--error-color); text-align: center;">Could not load addresses.</p>';
    }
  }

  async function editAddress(addressId) {
    if (!currentUser || !addressId) return;
    editingAddressId = addressId; // Set the global state

    try {
      const addressRef = db.collection('users').doc(currentUser.uid).collection('addresses').doc(addressId);
      const doc = await addressRef.get();

      if (doc.exists) {
        const address = doc.data();
        // Populate the form
        document.getElementById('addressFullName').value = address.fullName || '';
        document.getElementById('addressMobile').value = address.mobile || '';
        document.getElementById('addressHouse').value = address.house || '';
        document.getElementById('addressStreet').value = address.street || '';
        document.getElementById('addressCity').value = address.city || 'Hyderabad';
        document.getElementById('addressPincode').value = address.pincode || '';

        // Show the form
        document.getElementById('addressListContainer').style.display = 'none';
        document.getElementById('addressFormContainer').style.display = 'block';
        document.querySelector('#addressForm .cta').textContent = 'Update Address';
      } else {
        showToast('Address not found.');
        editingAddressId = null; // Reset state
      }
    } catch (error) {
      console.error("Error fetching address for edit:", error);
      showToast('Could not load address data.');
      editingAddressId = null; // Reset state
    }
  }

  function cancelEditAddress() {
    editingAddressId = null;
    showAddressList();
  }

  async function deleteAddress(addressId) {
    const modal = document.getElementById('confirmDeleteModal');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    if (!modal || !confirmBtn) return;

    // Store the ID on the button to be used by the confirmation handler
    confirmBtn.dataset.addressId = addressId;
    openModal(modal, cancelBtn);
  }

  async function executeDeleteAddress() {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const addressId = confirmBtn.dataset.addressId;

    if (!currentUser || !addressId) return;
    
    try {
      await db.collection('users').doc(currentUser.uid).collection('addresses').doc(addressId).delete();
      showToast('Address deleted.');
      await renderAddressList();
    } catch (error) {
      console.error("Error deleting address:", error);
      showToast('Failed to delete address.');
    } finally {
      closeModal(document.getElementById('confirmDeleteModal'));
    }
  }

  async function setDefaultAddress(newDefaultId) {
    if (!currentUser || !newDefaultId) return;

    const addressesRef = db.collection('users').doc(currentUser.uid).collection('addresses');
    const batch = db.batch();

    try {
      // Find the current default and unset it
      const currentDefaultSnapshot = await addressesRef.where('isDefault', '==', true).get();
      currentDefaultSnapshot.forEach(doc => {
        batch.update(doc.ref, { isDefault: false });
      });

      // Set the new default
      const newDefaultRef = addressesRef.doc(newDefaultId);
      batch.update(newDefaultRef, { isDefault: true });

      await batch.commit();
      showToast('Default address updated.');
      await renderAddressList();
    } catch (error) {
      console.error("Error setting default address:", error);
      showToast('Failed to update default address.');
    }
  }

  function trackAddToCart(id, qty) {
    const product = products.find(p => p.id === parseInt(id));
    if (!product || typeof gtag !== 'function') return;
    
    gtag('event', 'add_to_cart', {
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
  }

  function trackChangeQty(id, delta) {
    const product = products.find(p => p.id === parseInt(id));
    if (!product || typeof gtag !== 'function') return;
    
    gtag('event', 'change_cart_quantity', {
      change: delta,
      item_id: product.id,
      item_name: product.name,
      item_category: product.category,
      price: product.finalPrice,
      quantity: cart[id] || 0
    });
  }

  function renderProductSchema() {
    if (!products || products.length === 0) return;

    const schemaContainer = document.createDocumentFragment();

    products.forEach(product => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';

      const schema = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.name,
        "image": product.image,
        "description": product.desc,
        "sku": `CF-${product.id}`,
        "brand": { "@type": "Brand", "name": "Coastal Fresh" },
        "offers": {
          "@type": "Offer",
          "url": `https://www.coastalfresh.in/?product=${product.id}`,
          "priceCurrency": "INR",
          "price": product.finalPrice,
          "priceValidUntil": new Date(new Date().getFullYear() + 1, 11, 31).toISOString().split('T')[0],
          "itemCondition": "https://schema.org/NewCondition",
          "availability": product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
        },
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.2", "bestRating": "5", "ratingCount": "387" }
      };

      script.textContent = JSON.stringify(schema);
      schemaContainer.appendChild(script);
    });
    document.head.appendChild(schemaContainer);
  }

  /* ===== NEW: Accessibility & Focus Management ===== */
  function openModal(modalElement, elementToFocus) {
    previouslyFocusedElement = document.activeElement;
    const appContainer = document.querySelector('.app');
    
    // Hide background content from screen readers
    Array.from(appContainer.children).forEach(child => {
      if (child !== modalElement && !child.classList.contains('toast')) {
        child.setAttribute('aria-hidden', 'true');
      }
    });

    modalElement.classList.add('active');
    document.body.classList.add('popup-open');
    
    // Set focus inside the modal
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const focusTarget = elementToFocus || firstFocusable;
    if (focusTarget) {
      setTimeout(() => focusTarget.focus(), 100);
    }

    // Trap focus
    modalElement.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !lastFocusable) return;

      if (e.shiftKey) { // Shift + Tab
        if (document.activeElement === firstFocusable) {
          lastFocusable.focus();
          e.preventDefault();
        }
      } else { // Tab
        if (document.activeElement === lastFocusable) {
          firstFocusable.focus();
          e.preventDefault();
        }
      }
    });
  }

  function closeModal(modalElement) {
    Array.from(document.querySelector('.app').children).forEach(child => {
      child.removeAttribute('aria-hidden');
    });

    modalElement.classList.remove('active');
    document.body.classList.remove('popup-open');
    if (previouslyFocusedElement) previouslyFocusedElement.focus();
  }
  // Initialize app when DOM is loaded
  document.addEventListener('DOMContentLoaded', init);
})();
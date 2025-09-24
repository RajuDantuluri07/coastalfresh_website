let state, config, UI;

/**
 * Creates a simple, non-cryptographic hash from a string.
 * @param {string} str The string to hash.
 * @returns {number} A positive integer hash.
 */
function _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

export const Handlers = {
    init: (appState, appConfig, uiModule) => {
        state = appState;
        config = appConfig;
        UI = uiModule;
    },

    /**
     * A helper function to safely add event listeners.
     * It checks if the element exists before adding the listener.
     * @param {string} selector - The CSS selector for the element.
     * @param {string} event - The event type (e.g., 'click').
     * @param {Function} handler - The event handler function.
     */
    setupEvents: () => {
        // --- Event Delegation on the Body for Dynamic/Repeated Elements ---
        document.body.addEventListener('click', (e) => {
            const target = e.target;

            // Product card click (but not on buttons)
            const productCard = target.closest('.product');
            if (productCard && !target.closest('.cart-controls, .add-to-cart-btn')) {
                e.preventDefault();
                const productId = productCard.dataset.id;
                // OPTIMIZATION: Prefetch the large image on mousedown/touchstart for faster popup load
                const product = state.products.find(p => p.id === parseInt(productId));
                if (product) {
                    const img = new Image();
                    img.src = UI.getOptimizedImageUrl(product.image, 600, 600);
                }

                if (productId) UI.showProductPopup(parseInt(productId));
            }

            // Add to cart button on product cards
            const addBtn = target.closest('.add-to-cart-btn');
            if (addBtn) {
                e.stopPropagation();
                const productId = addBtn.dataset.id;
                if (productId) Handlers.addToCart(parseInt(productId));
            }

            // Quantity controls on product cards
            const productQtyBtn = target.closest('.product .cart-controls .qty-btn');
            if (productQtyBtn) {
                e.stopPropagation();
                const controls = productQtyBtn.closest('.cart-controls');
                const productId = controls.dataset.id;
                if (productId) {
                    const change = productQtyBtn.classList.contains('inc') ? 1 : -1;
                    Handlers.updateQty(parseInt(productId), change);
                }
            }

            // Quantity controls in the cart
            const cartQtyBtn = target.closest('.cart-item-card .qty-controls .cart-qty-btn');
            if (cartQtyBtn) {
                const productId = cartQtyBtn.dataset.id;
                if (productId) {
                    const change = cartQtyBtn.classList.contains('inc') ? 1 : -1;
                    Handlers.updateQty(parseInt(productId), change);
                }
            }

            // FAQ toggle
            const faqToggle = target.closest('.faq .q');
            if (faqToggle) {
                UI.toggleFAQ(faqToggle);
            }

            // Carousel slide click
            const slide = target.closest('.slide[data-action]');
            if (slide) {
                const { action, target: slideTarget } = slide.dataset;
                if (action === 'showPage' && typeof UI.showPage === 'function') {
                    UI.showPage(slideTarget);
                } else if (action === 'showProductPopup' && typeof UI.showProductPopup === 'function') {
                    const productId = parseInt(slideTarget, 10);
                    if (!isNaN(productId)) {
                        UI.showProductPopup(productId);
                    }
                } else if (action === 'openWhatsApp' && typeof Handlers.openWhatsApp === 'function') {
                    Handlers.openWhatsApp(slideTarget);
                }
            }

            // Product description toggle
            const descToggle = target.closest('.popup-description-toggle');
            if (descToggle) {
                UI.toggleProductDescription();
            }

            // Accordion toggle for product details
            const detailHeader = target.closest('.detail-header');
            if (detailHeader) {
                const detailItem = detailHeader.closest('.detail-item');
                if (detailItem) {
                    if (detailItem.id === 'productInfoDetailItem') {
                        window.Analytics.trackEvent('view_item_details', {
                            item_id: state.popupProduct?.id,
                            item_name: state.popupProduct?.name
                        });
                    }
                    const content = detailItem.querySelector('.detail-content');
                    const icon = detailHeader.querySelector('i');
                    const isOpen = detailItem.classList.toggle('active');

                    content.style.maxHeight = isOpen ? content.scrollHeight + 'px' : '0';
                    content.style.padding = isOpen ? '0 0 16px 0' : '0';
                    if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            }

            // --- Safely handle clicks on page-specific or modal buttons ---

            // Login/Signup form toggling
            if (target.id === 'showLogin') {
                e.preventDefault();
                document.getElementById('authTitle').textContent = 'Welcome Back';
                document.getElementById('authSubtitle').textContent = 'Login to access your account';
                document.getElementById('signupForm').classList.remove('active');
                document.getElementById('loginForm').classList.add('active');
                document.getElementById('authError').textContent = '';
            }
            if (target.id === 'showSignup') {
                e.preventDefault();
                document.getElementById('authTitle').textContent = 'Get Started';
                document.getElementById('authSubtitle').textContent = 'Sign up to order the freshest coastal seafood';
                document.getElementById('loginForm').classList.remove('active');
                document.getElementById('signupForm').classList.add('active');
                document.getElementById('authError').textContent = '';
            }

            // Category filter buttons
            const categoryButton = target.closest('.category');
            if (categoryButton) {
                if (categoryButton.classList.contains('active')) return;
                document.querySelector('.category.active').classList.remove('active');
                categoryButton.classList.add('active');
                state.currentCategory = categoryButton.dataset.category;
                state.currentPageNumber = 1;
                const searchInput = document.getElementById('catalogSearch');
                if (searchInput) searchInput.value = '';
                state.currentSearch = '';
                UI.renderCatalogProducts();
                window.Analytics.trackEvent('select_category', { category: state.currentCategory });
            }

            // Header buttons and View All
            if (target.closest('#home .view-all')) {
                e.preventDefault();
                UI.showPage('catalog');
            }

            // Back buttons
            const backBtn = target.closest('.page .back-btn');
            if (backBtn) {
                const pageId = backBtn.closest('.page').id;
                if (pageId === 'addressPage') {
                    state.editingAddressId ? Handlers.cancelEditAddress() : Handlers.goBack();
                } else if (pageId !== 'loginModal' && pageId !== 'productPopup' && pageId !== 'cartModal') {
                    Handlers.goBack();
                }
            }

            // Address list actions
            const optionsBtn = target.closest('.address-options-btn');
            if (optionsBtn) {
                const dropdown = optionsBtn.nextElementSibling;
                document.querySelectorAll('.address-dropdown-content.active').forEach(openDropdown => {
                    if (openDropdown !== dropdown) openDropdown.classList.remove('active');
                });
                dropdown.classList.toggle('active');
                e.stopPropagation();
                return;
            }
            const actionBtn = target.closest('.address-action-btn');
            if (actionBtn) {
                const addressId = actionBtn.dataset.id;
                if (actionBtn.classList.contains('delete-address-btn')) Handlers.deleteAddress(addressId);
                else if (actionBtn.classList.contains('set-default-btn')) Handlers.setDefaultAddress(addressId);
                else if (actionBtn.classList.contains('edit-address-btn')) Handlers.editAddress(addressId);
                actionBtn.closest('.address-dropdown-content').classList.remove('active');
                return;
            }
            if (!target.closest('.address-options-menu')) {
                document.querySelectorAll('.address-dropdown-content.active').forEach(d => d.classList.remove('active'));
            }

            // Confirmation modal buttons
            if (target.id === 'cancelDeleteBtn') document.getElementById('confirmDeleteModal').classList.remove('active');
            if (target.id === 'confirmDeleteBtn') Handlers.executeDeleteAddress();

            // Order Success modal buttons
            if (target.id === 'continueShoppingBtn') UI.closeOrderSuccessModal();
            if (target.id === 'trackOrderBtn') Handlers.handleTrackOrder(e);

            // Fixed "Add New Address" button
            if (target.id === 'addNewAddressBtnFixed') UI.showAddressForm();

            // Cart back button
            if (target.closest('#cartModal .back-btn')) UI.closeCart();
            if (target.closest('.cart-btn')) UI.showCart();

            // Profile page buttons
            const profileBtn = target.closest('.profile-button');
            if (profileBtn) Handlers.handleProfileButtonClick(profileBtn);

            // Checkout button in cart
            if (target.id === 'cartPlaceOrderBtn') Handlers.checkout();

        });

        // Typewriter focus/blur handlers
        const catalogSearchInput = document.getElementById('catalogSearch');
        catalogSearchInput.addEventListener('focus', UI.stopTypewriter);
        catalogSearchInput.addEventListener('blur', () => {
            if (!catalogSearchInput.value) UI.startTypewriter();
        });

        // Tooltip handler
        document.body.addEventListener('click', e => {
            const infoIcon = e.target.closest('.summary-row .fa-info-circle');
            if (infoIcon) {
                e.preventDefault();
                UI.showSimpleTooltip(infoIcon);
            }
        });

        // Login Modal Close Button
        document.querySelector('#loginModal .back-btn').addEventListener('click', UI.closeLoginModal);

        // Auth Form Submissions
        document.getElementById('loginForm').addEventListener('submit', Handlers.handleEmailLogin);
        document.getElementById('signupForm').addEventListener('submit', Handlers.handleEmailSignup);
        document.getElementById('googleLoginBtn').addEventListener('click', Handlers.handleGoogleLogin);
        document.getElementById('forgotPassword').addEventListener('click', Handlers.handlePasswordReset);

        // Header search inputs
        document.getElementById('catalogSearch').addEventListener('input', (e) => {
            clearTimeout(state.searchDebounceTimer);
            state.searchDebounceTimer = setTimeout(() => Handlers.handleCatalogSearch(e), 300);
        });

        // Address form submission
        document.getElementById('addressForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!state.currentUser) {
                if (state.afterAddressAction) {
                    state.afterAddressAction = null;
                }
                UI.showToast('You must be logged in to save an address.');
                return;
            }

            const mobileInput = document.getElementById('addressMobile');
            const pincodeInput = document.getElementById('addressPincode');

            if (!/^\d{10}$/.test(mobileInput.value)) {
                UI.showToast('Please enter a valid 10-digit mobile number.');
                mobileInput.focus();
                return;
            }
            if (!/^\d{6}$/.test(pincodeInput.value)) {
                UI.showToast('Please enter a valid 6-digit pincode.');
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
                const addressesRef = state.db.collection('users').doc(state.currentUser.uid).collection('addresses');

                if (state.editingAddressId) {
                    await addressesRef.doc(state.editingAddressId).update(addressData);
                    UI.showToast('Address updated successfully!');
                } else {
                    const snapshot = await addressesRef.get();
                    if (snapshot.empty) {
                        addressData.isDefault = true;
                    }
                    await addressesRef.add(addressData);
                    UI.showToast('Address saved successfully!');
                }

                if (typeof state.afterAddressAction === 'function') {
                    UI.showToast('Address saved! Completing your order...');
                    const action = state.afterAddressAction;
                    state.afterAddressAction = null;
                    action();
                } else {
                    await UI.renderAddressList();
                    Handlers.goBack();
                }
            } catch (error) {
                console.error("Error saving address: ", error);
                UI.showToast('Failed to save address. Please try again.');
                if (state.afterAddressAction) state.afterAddressAction = null;
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Address';
            }
        });

        // Product Popup buttons
        document.getElementById('ordersMainContent').addEventListener('click', e => {
            // NEW: Handle click on the entire order card to show details
            const orderCard = e.target.closest('.order-card');
            if (orderCard) { // The entire card is now the "Track Order" button
                const orderId = orderCard.dataset.orderId;
                if (orderId) {
                    state.db.collection('orders').doc(orderId).get().then(doc => {
                        if (doc.exists) {
                            UI.openOrderDetailsDrawer(doc.data());
                        }
                    });
                }
            }
        });
        document.querySelector('.popup-back-btn').addEventListener('click', UI.closePopup);
        document.querySelector('.popup-action-btn.favorite').addEventListener('click', Handlers.toggleFavorite);
        document.querySelector('.popup-action-btn.share').addEventListener('click', Handlers.shareProduct);

        // Event delegation for the dynamic sticky CTA
        document.getElementById('popupStickyCta').addEventListener('click', (e) => {
            const addBtn = e.target.closest('.popup-cta-add-btn');
            const qtyBtn = e.target.closest('.qty-btn');
            if (addBtn) Handlers.addPopupToCart();
            if (qtyBtn) {
                const isInCart = state.cart[state.popupProduct?.id] > 0;
                const change = qtyBtn.classList.contains('inc') ? 1 : -1;
                if (isInCart) Handlers.updateQty(state.popupProduct.id, change);
                else Handlers.changePopupQty(change);
            }
        });

        // Coupon section
        document.getElementById('cartCouponSection').addEventListener('click', e => {
            if (e.target.id === 'applyCouponBtn') {
                Handlers.applyCoupon();
            }
            if (e.target.id === 'removeCouponBtn') {
                Handlers.removeCoupon();
            }
        });

        // Payment options
        document.getElementById('paymentOptions').addEventListener('click', e => {
            const paymentBtn = e.target.closest('.cart-pay-item');
            if (paymentBtn && !paymentBtn.classList.contains('active')) {
                document.querySelector('.payment-btn.active').classList.remove('active');
                paymentBtn.classList.add('active');
                state.selectedPaymentMethod = paymentBtn.dataset.method;

                window.Analytics.trackEvent('select_payment_method', { method: state.selectedPaymentMethod });

                if (state.selectedPaymentMethod === 'online') {
                    UI.showToast('Online payment is coming soon!');
                }
            }
        });

        // Bottom Navigation
        document.getElementById('bottomNav').addEventListener('click', e => {
            const navItem = e.target.closest('.nav-item');
            if (!navItem) return;
            const page = navItem.dataset.page;
            if (page === 'cart') {
                UI.showCart();
            } else if (page) {
                if (page === 'profilePage' && !state.currentUser) {
                    UI.showPage(page);
                } else {
                    UI.showPage(page);
                }
            }
        });

        // Dynamic Padding & Keyboard Handling for Product Popup
        const popupStickyCta = document.getElementById('popupStickyCta');
        const popupContentWrapper = document.getElementById('popupContentWrapper');

        const resizeObserver = new ResizeObserver(() => {
            const ctaHeight = popupStickyCta.offsetHeight;
            popupContentWrapper.style.paddingBottom = `${ctaHeight + 10}px`;
        });
        if (popupStickyCta) resizeObserver.observe(popupStickyCta);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                const isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.7;
                popupStickyCta.classList.toggle('keyboard-open', isKeyboardOpen);
            });
        }

        // Dynamic Padding for Cart Footer
        const cartFooterEl = document.getElementById('cartFooter');
        const cartContentWrapperEl = document.querySelector('.cart-content-wrapper');
        const cartResizeObserver = new ResizeObserver(() => {
            const footerHeight = cartFooterEl.offsetHeight;
            cartContentWrapperEl.style.paddingBottom = `${footerHeight}px`;
        });
        if (cartFooterEl && cartContentWrapperEl) cartResizeObserver.observe(cartFooterEl);

        Handlers.setupInstallPromptEvents();
    },

    handleProfileButtonClick: async (button) => {
        if (button.id === 'guestProfileCta') {
            UI.showLoginModal(null, 'signup');
        } else if (button.id === 'logoutBtn') {
            Handlers.handleLogout();
        } else if (button.id === 'referBtn') {
            UI.showPage('referPage');
        } else if (button.id === 'profileInstallBtn') {
            UI.triggerInstallPrompt();
        } else if (button.classList.contains('orders')) {
            UI.showPage('ordersPage');
        } else if (button.classList.contains('address')) {
            if (state.currentUser) {
                await UI.renderAddressList();
                UI.showPage('addressPage');
            } else {
                UI.showToast('Please login to manage your address.');
                UI.showLoginModal();
            }
        } else if (button.classList.contains('faq')) {
            UI.showPage('faqPage');
        } else if (button.classList.contains('about')) {
            UI.showPage('aboutPage');
        } else if (button.classList.contains('support')) {
            Handlers.openWhatsApp('support');
        }
    },

    changePopupQty: (change) => {
        state.currentProductQty = Math.max(1, Math.min(99, state.currentProductQty + change));
        UI.updatePopupCta();
    },

    addPopupToCart: () => {
        if (!state.popupProduct || !state.popupProduct.available) return;

        const qty = state.currentProductQty;

        if (state.cart[state.popupProduct.id]) {
            state.cart[state.popupProduct.id] = Math.min(99, state.cart[state.popupProduct.id] + qty);
        } else {
            state.cart[state.popupProduct.id] = qty;
        }

        Handlers.saveCart();
        UI.updateCartUI();
        UI.showToast(`${DOMPurify.sanitize(state.popupProduct.name)} added to cart!`);
        UI.closePopup();

        window.Analytics.trackAddToCart(state.popupProduct, qty);
    },

    /**
     * Adds multiple items to the cart, saves, and updates UI.
     * This is more efficient than calling addToCart in a loop as it shows a single toast.
     * @param {Array} items - Array of items from an order ({ id, qty }).
     */
    addMultipleToCart: (items) => {
        if (!items || items.length === 0) return;

        let itemsAddedCount = 0;
        items.forEach(item => {
            const product = state.products.find(p => p.id === item.id);
            if (product && product.available) {
                state.cart[item.id] = (state.cart[item.id] || 0) + item.qty;
                itemsAddedCount++;
            }
        });

        if (itemsAddedCount > 0) {
            Handlers.saveCart();
            UI.updateCartUI();
            UI.showToast(`${itemsAddedCount} item(s) from your previous order have been added to the cart!`);
            UI.showCart();
        }
    },
    toggleFavorite: () => {
        state.isPopupFavorite = !state.isPopupFavorite;
        const favoriteBtn = document.querySelector('.popup-action-btn.favorite');
        favoriteBtn.setAttribute('aria-pressed', state.isPopupFavorite);
        favoriteBtn.setAttribute('aria-label', state.isPopupFavorite ? 'Remove from Favorites' : 'Add to Favorites');
        favoriteBtn.innerHTML = `<i class="${state.isPopupFavorite ? 'fas' : 'far'} fa-heart"></i>`;
        favoriteBtn.style.color = state.isPopupFavorite ? 'var(--error-color)' : 'var(--primary-color)';

        if (state.popupProduct) {
            window.Analytics.trackEvent(state.isPopupFavorite ? 'add_to_wishlist' : 'remove_from_wishlist', {
                currency: 'INR',
                value: state.popupProduct.finalPrice * state.currentProductQty,
                items: [{
                    item_id: state.popupProduct.id,
                    item_name: state.popupProduct.name,
                    item_category: state.popupProduct.category,
                    price: state.popupProduct.finalPrice
                }]
            });
        }
    },

    shareProduct: async () => {
        let referralLink = 'https://coastalfresh.in?ref=GUEST123';
        if (state.currentUser && state.currentUser.uid) {
            referralLink = `https://coastalfresh.in?ref=${_simpleHash(state.currentUser.uid)}`;
        }
        // The text message is the most important part, as it contains the referral link.
        const referralMessage = `Hey! I’ve been ordering from Coastal Fresh – always fresh and delivered to my home in Hyderabad. You should try it! Use my link for 10% off on your first order. 👉 ${referralLink}`;
        const shareTitle = 'Get 10% Off at Coastal Fresh!';

        if (navigator.share) {
            try {
                // We prioritize sharing the text to ensure the referral link is always sent.
                // Some apps, like WhatsApp, ignore text when an image file is included.
                await navigator.share({
                    title: shareTitle,
                    text: referralMessage,
                    url: referralLink // Providing the URL separately helps some apps create a better preview.
                });
            } catch (error) {
                // This error is thrown if the user cancels the share dialog, which is normal behavior.
                console.log('Share was cancelled or failed', error);
            }
        } else {
            // Fallback for desktop browsers or those that don't support the Web Share API.
            window.open(`https://wa.me/?text=${encodeURIComponent(referralMessage)}`, '_blank');
        }

        window.Analytics.trackEvent('share', {
            method: 'Web Share API',
            content_type: 'referral',
            item_id: 'referral_link',
        });
    },

    goBack: () => {
        if (state.pageHistory.length > 1) {
            state.pageHistory.pop();
            const previousPage = state.pageHistory[state.pageHistory.length - 1];
            UI.showPage(previousPage);
        } else {
            UI.showPage('home');
        }
    },

    addToCart: (id, qty = 1) => {
        const product = state.products.find(p => p.id === id);
        if (!product || !product.available) return;

        if (state.cart[id]) {
            state.cart[id] = Math.min(99, state.cart[id] + qty);
        } else {
            state.cart[id] = qty;
        }

        Handlers.saveCart();
        UI.updateCartUI();
        UI.updatePopupCta();
        UI.updateProductCardState(id);
        UI.showToast(`${product.name} added to cart!`);

        const addedProduct = state.products.find(p => p.id === parseInt(id));
        if (addedProduct) window.Analytics.trackAddToCart(addedProduct, qty);
    },

    updateQty: (id, change) => {
        if (!state.cart[id]) return;

        const product = state.products.find(p => p.id === parseInt(id));
        const originalQty = state.cart[id];

        state.cart[id] += change;
        if (state.cart[id] <= 0) {
            delete state.cart[id];
            if (product) {
                window.Analytics.trackEvent('remove_from_cart', {
                    currency: 'INR',
                    value: product.finalPrice * originalQty,
                    items: [{
                        item_id: product.id,
                        item_name: product.name,
                        item_category: product.category,
                        price: product.finalPrice,
                        quantity: originalQty
                    }]
                });
            }
        } else {
            if (product) window.Analytics.trackChangeQty(product, change, state.cart[id]);
        }
        Handlers.saveCart();

        if (document.getElementById('cartModal').classList.contains('active')) {
            const itemEl = document.querySelector(`.cart-item-card[data-id="${id}"]`);
            UI.updatePopupCta();
            if (itemEl) {
                if (state.cart[id]) {
                    const qtyEl = itemEl.querySelector('.cart-qty');
                    qtyEl.textContent = state.cart[id];
                } else {
                    itemEl.classList.add('removing');
                    // Instead of re-rendering the whole cart, just remove the element
                    itemEl.addEventListener('transitionend', () => {
                        itemEl.remove();
                    }, { once: true });
                }
            }
            UI.updateCartSummary();
            UI.updateCartBadges();
        } else {
            UI.updateCartUI();
        }
        UI.updateProductCardState(id);
    },

    checkout: async () => {
        const cartFooter = document.getElementById('cartFooter');
        const checkoutBtn = document.getElementById('cartPlaceOrderBtn');
        const rawItems = Object.keys(state.cart).map(id => {
            const product = state.products.find(p => p.id === parseInt(id));
            if (!product) {
                console.warn(`Product ID ${id} from cart not found in products data. It will be removed.`);
                return null;
            }
            return { ...product, qty: state.cart[id] };
        });

        const items = rawItems.filter(Boolean);

        if (items.length !== rawItems.length) {
            state.cart = items.reduce((acc, item) => {
                acc[item.id] = item.qty;
                return acc;
            }, {});
            Handlers.saveCart();
            UI.updateCartUI();
            UI.showToast("Some items were removed as they are no longer available. Please review your cart.");
            return;
        }

        if (items.length === 0) return;

        if (state.selectedPaymentMethod === 'online') {
            UI.showToast('Online payment is coming soon! Please select Cash on Delivery.');
            return; // Stop checkout if online payment is selected
        }

        if (!state.currentUser) {
            document.getElementById('cartModal').classList.remove('active');
            UI.showToast('Please log in to continue checkout.');
            // FIX: Instead of re-running checkout, just show the cart again after login.
            // This allows the user to review their cart before placing the order.
            state.afterLoginAction = UI.showCart;

            UI.showLoginModal(null, 'signup');
            return;
        }

        let userAddress = null;
        try {
            const addressSnapshot = await state.db.collection('users').doc(state.currentUser.uid).collection('addresses').where('isDefault', '==', true).limit(1).get();
            if (!addressSnapshot.empty) {
                userAddress = addressSnapshot.docs[0].data();
            }
        } catch (error) {
            console.error("Error fetching user address for checkout:", error);
            UI.showToast("Could not verify your address. Please try again.");
            return;
        }

        if (!userAddress) {
            state.afterAddressAction = Handlers.checkout;
            UI.showToast('Please add a delivery address to continue.');
            UI.showPage('addressPage');
            UI.showAddressForm();
            UI.closeCart();
            return;
        }

        // NEW: Disable the button to prevent double-clicks
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.innerHTML = '<div class="loading"></div>';
        }
        const orderId = `CF-${Date.now()}${Math.floor(Math.random() * 100)}`;

        const subtotal = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
        const couponDiscount = state.appliedCoupon ? (state.appliedCoupon.type === 'percent' ? (subtotal * state.appliedCoupon.value) / 100 : state.appliedCoupon.value) : 0;
        const finalSubtotal = subtotal - couponDiscount;
        const deliveryFee = finalSubtotal >= config.FREE_DELIVERY_THRESHOLD ? 0 : 100;
        const total = finalSubtotal + deliveryFee;

        let message = `Hi! I'd like to place an order (ID: ${orderId}):\n\n`;
        items.forEach(item => {
            const safeName = item.name.replace(/[^\w\s-]/g, '');
            message += `• ${safeName} x${item.qty} - ₹${item.finalPrice * item.qty}\n`;
        });
        message += `\nSubtotal: ₹${subtotal}\nDelivery: ${deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}\nTotal: ₹${total}\n`;
        message += `\nPayment Method: ${state.selectedPaymentMethod.toUpperCase()}\n`;
        message += `\n--- Delivery Address ---\nName: ${userAddress.fullName}\nMobile: ${userAddress.mobile}\nAddress: ${userAddress.house}, ${userAddress.street}, ${userAddress.city}, ${userAddress.pincode}\n\n`;
        message += "\nPlease confirm availability.";

        const orderData = {
            orderId: orderId,
            userId: state.currentUser.uid,
            items: items.map(item => ({ id: item.id, name: item.name, qty: item.qty, price: item.finalPrice, image: item.image })),
            subtotal: Math.round(subtotal),
            coupon: state.appliedCoupon ? { code: state.appliedCoupon.code, discount: Math.round(couponDiscount) } : null,
            deliveryFee: deliveryFee,
            total: Math.round(total),
            address: userAddress,
            paymentMethod: state.selectedPaymentMethod,
            status: 'Pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Track that the user has initiated the checkout process.
        window.Analytics.trackBeginCheckout(orderId, total, items);

        state.db.collection('orders').add(orderData)
            .then(() => {
                state.cart = {};
                Handlers.saveCart();
                UI.updateCartUI();
                UI.closeCart();
                UI.showOrderSuccessModal(orderId, message);

                window.Analytics.trackPurchase(orderId, total, items);
            })
            .catch((error) => {
                console.error("Error saving order to Firestore:", error);
                UI.showToast("Could not place your order. Please try again.");
                window.Analytics.trackEvent('purchase_failure', {
                    error_message: error.message
                });
            })
            .finally(() => {
                // NEW: Re-enable the button after the process is complete
                if (checkoutBtn) {
                    checkoutBtn.disabled = false;
                    // The text will be updated by updateCartSummary if the cart is still open
                    checkoutBtn.textContent = 'Place Order';
                }
            });
    },

    handleTrackOrder: (e) => {
        const message = e.currentTarget.dataset.message;
        if (message) {
            window.open(`https://wa.me/919985125678?text=${encodeURIComponent(message)}`, '_blank');
        }
        UI.closeOrderSuccessModal();
    },

    handleCatalogSearch: (e) => {
        state.currentSearch = e.target.value;
        state.currentPageNumber = 1;
        UI.renderCatalogProducts();

        if (state.currentSearch) {
            window.Analytics.trackEvent('view_search_results', {
                search_term: state.currentSearch,
                category: state.currentCategory
            });
        }
    },

    copyReferralLink: () => {
        const referralLink = document.getElementById('referralLink').textContent;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(referralLink).then(() => {
                UI.showToast('Referral link copied!');
            }, (err) => {
                console.error('Could not copy text: ', err);
                UI.showToast('Failed to copy link.');
            });
        }
    },

    openWhatsApp: (type, orderId = null) => {
        let message = '';
        let url = 'https://wa.me/919985125678';

        if (type === 'support') {
            message = orderId
                ? `Hi Coastal Fresh, I need assistance with my order #${orderId}.`
                : 'Hi Coastal Fresh, I need some assistance.';
        } else if (type === 'refer') {
            const referralLink = document.getElementById('referralLink').textContent;
            message = `Hey! I’ve been ordering seafood from Coastal Fresh – always fresh, neatly cleaned and delivered to my home in Hyderabad. You should try it! Use my referral link for 10% off on your first order. 👉 ${referralLink}`;
            url = 'https://wa.me/';
        }
        window.open(`${url}?text=${encodeURIComponent(message)}`, '_blank');
    },

    loadCart: () => {
        try {
            const saved = localStorage.getItem('coastalFreshCart');
            if (saved) {
                const parsed = JSON.parse(saved);
                state.cart = Handlers.sanitizeCartShape(parsed);
                UI.updateCartUI();
            }
        } catch (e) {
            console.error('Error loading cart from localStorage:', e);
        }
    },

    saveCart: () => {
        try {
            localStorage.setItem('coastalFreshCart', JSON.stringify(state.cart));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn('Storage quota exceeded, cart may not persist.');
            } else {
                console.error('Error saving cart:', e);
            }
        }
    },

    sanitizeCartShape: (cartData) => {
        if (!cartData || typeof cartData !== 'object') return {};
        const sanitized = {};

        for (const [id, qty] of Object.entries(cartData)) {
            const product = state.products.find(p => p.id === parseInt(id));
            if (!product) continue;

            const numericQty = parseInt(qty);
            if (isNaN(numericQty)) continue;

            const clampedQty = Math.max(0, Math.min(99, numericQty));
            if (clampedQty > 0) {
                sanitized[id] = clampedQty;
            }
        }

        return sanitized;
    },

    handleEmailSignup: (e) => {
        e.preventDefault();
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const authError = document.getElementById('authError');
        authError.textContent = '';

        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then(userCredential => {
                const user = userCredential.user;
                state.db.collection('users').doc(user.uid).set({
                    email: user.email,
                    displayName: user.displayName || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                window.Analytics.trackEvent('sign_up', { method: 'Email' });
                if (state.afterLoginAction) {
                    UI.showToast('Success! Taking you to checkout...');
                } else {
                    UI.showToast('Account created successfully!');
                }
                UI.closeLoginModal();
            })
            .catch(error => {
                authError.textContent = error.message;
                window.Analytics.trackEvent('sign_up_failure', { method: 'Email' });
            });
    },

    handleEmailLogin: (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const authError = document.getElementById('authError');
        authError.textContent = '';

        firebase.auth().signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                window.Analytics.trackEvent('login', { method: 'Email' });
                if (state.afterLoginAction) {
                    UI.showToast('Success! Taking you to checkout...');
                } else {
                    UI.showToast('Logged in successfully!');
                }
                UI.closeLoginModal();
            })
            .catch(error => {
                authError.textContent = error.message;
            });
    },

    handleGoogleLogin: () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        const authError = document.getElementById('authError');
        authError.textContent = '';
        firebase.auth().signInWithPopup(provider)
            .then(result => {
                const user = result.user;
                const isNewUser = result.additionalUserInfo.isNewUser;
                if (isNewUser) {
                    state.db.collection('users').doc(user.uid).set({
                        email: user.email,
                        displayName: user.displayName,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }

                if (result.additionalUserInfo && result.additionalUserInfo.isNewUser) {
                    window.Analytics.trackEvent('sign_up', { method: 'Google' });
                } else {
                    window.Analytics.trackEvent('login', { method: 'Google' });
                }

                if (state.afterLoginAction) {
                    UI.showToast('Success! Taking you to checkout...');
                } else {
                    UI.showToast(`Welcome, ${result.user.displayName}!`);
                }
                UI.closeLoginModal();
            }).catch(error => {
                authError.textContent = error.message;
                window.Analytics.trackEvent('login_failure', { method: 'Google' });
            });
    },

    handlePasswordReset: (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const authError = document.getElementById('authError');
        if (!email) {
            authError.textContent = 'Please enter your email in the login form to reset password.';
            return;
        }
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => {
                UI.showToast('Password reset email sent!');
            })
            .catch(error => {
                authError.textContent = error.message;
            });
    },

    handleLogout: () => {
        firebase.auth().signOut().then(() => {
            // Anonymize user for analytics
            if (window.Analytics) window.Analytics.anonymizeUser();
            state.currentUser = null;
            UI.showToast('You have been logged out.');
            Handlers.updateUIForAuthState();
            UI.showPage('home');
        }).catch(error => {
            console.error('Logout Error:', error);
        });
    },

    initFirebaseMessaging: async () => {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !firebase.messaging.isSupported()) {
            console.log('Firebase Messaging is not supported in this browser.');
            return;
        }

        const messaging = firebase.messaging();

        messaging.onMessage(payload => {
            console.log('Message received. ', payload);
            if (payload.notification) {
                UI.showToast(`${payload.notification.title}: ${payload.notification.body}`);
            }
        });

        try {
            const registration = await navigator.serviceWorker.ready;
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Notification permission not granted. User will not receive push notifications.');
                return;
            }

            const token = await messaging.getToken({ serviceWorkerRegistration: registration });

            if (token && state.currentUser) {
                // Save the token to Firestore for the current user.
                // This is a "fire and forget" operation; we don't need to wait for it.
                // If it fails, it will be caught by the global unhandledrejection handler.
                state.db.collection('users').doc(state.currentUser.uid).collection('fcmTokens').doc(token).set({
                    token: token,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    console.log('FCM token saved for user.');
                });
            }
        } catch (err) {
            // This catch block is crucial. It handles errors from `getToken()` if permissions are denied
            // or if the environment doesn't support it (e.g., incognito mode), preventing the unhandled rejection.
            console.warn('Could not get FCM token:', err.message);
        }
    },

    handleAuthStateChange: (user) => {
        const isNewLogin = !state.currentUser && user;
        state.currentUser = user;
        Handlers.updateUIForAuthState();

        if (user) {
            // Update the user's last seen timestamp for active user tracking.
            // Use { merge: true } to avoid overwriting other user data like 'createdAt'.
            state.db.collection('users').doc(user.uid).set({
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            window.Analytics.identifyUser(user);
            if (typeof state.afterLoginAction === 'function') {
                setTimeout(state.afterLoginAction, 100);
                state.afterLoginAction = null;
            }
        } else { // User is logged out
            if (window.Analytics) window.Analytics.anonymizeUser();
        }
    },

    updateUIForAuthState: () => {
        const userNameEl = document.getElementById('profileUserName');
        const userStatusEl = document.getElementById('profileUserStatus');
        const logoutBtn = document.getElementById('logoutBtn');
        const guestCtaBtn = document.getElementById('guestProfileCta');
        const referBtn = document.getElementById('referBtn');
        const avatarEl = document.querySelector('.profile-avatar-small');

        if (state.currentUser) {
            if (state.currentUser.photoURL) {
                avatarEl.innerHTML = `<img src="${state.currentUser.photoURL}" alt="Profile Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
            }

            const referralLinkEl = document.getElementById('referralLink');
            if (referralLinkEl) {
                referralLinkEl.textContent = `https://coastalfresh.in?ref=${_simpleHash(state.currentUser.uid)}`;
            }

            let displayName = 'Valued Customer';
            if (state.currentUser.displayName) {
                displayName = state.currentUser.displayName;
            } else if (state.currentUser.email) {
                const emailName = state.currentUser.email.split('@')[0];
                const cleanedName = emailName.replace(/[\._-]/g, ' ').split(' ')[0];
                displayName = cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1);
            }

            userNameEl.textContent = displayName;
            userStatusEl.textContent = state.currentUser.email;
            logoutBtn.style.display = 'flex';
            if (guestCtaBtn) guestCtaBtn.style.display = 'none';
            if (referBtn) referBtn.style.display = 'flex';
        } else {
            avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
            userNameEl.textContent = 'Guest User';
            userStatusEl.textContent = 'You are browsing as a guest.';

            const referralLinkEl = document.getElementById('referralLink');
            if (referralLinkEl) {
                referralLinkEl.textContent = `https://coastalfresh.in?ref=GUEST123`;
            }

            logoutBtn.style.display = 'none';
            if (guestCtaBtn) guestCtaBtn.style.display = 'flex';
            if (referBtn) referBtn.style.display = 'none';
        }
    },

    editAddress: async (addressId) => {
        if (!state.currentUser || !addressId) return;
        state.editingAddressId = addressId;

        try {
            const addressRef = state.db.collection('users').doc(state.currentUser.uid).collection('addresses').doc(addressId);
            const doc = await addressRef.get();

            if (doc.exists) {
                const address = doc.data();
                document.getElementById('addressFullName').value = address.fullName || '';
                document.getElementById('addressMobile').value = address.mobile || '';
                document.getElementById('addressHouse').value = address.house || '';
                document.getElementById('addressStreet').value = address.street || '';
                document.getElementById('addressCity').value = address.city || 'Hyderabad';
                document.getElementById('addressPincode').value = address.pincode || '';

                document.getElementById('addressListContainer').style.display = 'none';
                document.getElementById('addressFormContainer').style.display = 'block';
                document.querySelector('#addressForm .cta').textContent = 'Update Address';
            } else {
                UI.showToast('Address not found.');
                state.editingAddressId = null;
            }
        } catch (error) {
            console.error("Error fetching address for edit:", error);
            UI.showToast('Could not load address data.');
            state.editingAddressId = null;
        }
    },

    cancelEditAddress: () => {
        state.editingAddressId = null;
        UI.showAddressList();
    },

    deleteAddress: async (addressId) => {
        const modal = document.getElementById('confirmDeleteModal');
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');
        if (!modal || !confirmBtn) return;

        confirmBtn.dataset.addressId = addressId;
        UI.openModal(modal, cancelBtn);
    },

    executeDeleteAddress: async () => {
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const addressId = confirmBtn.dataset.addressId;

        if (!state.currentUser || !addressId) return;

        try {
            await state.db.collection('users').doc(state.currentUser.uid).collection('addresses').doc(addressId).delete();
            UI.showToast('Address deleted.');
            await UI.renderAddressList();
        } catch (error) {
            console.error("Error deleting address:", error);
            UI.showToast('Failed to delete address.');
        } finally {
            UI.closeModal(document.getElementById('confirmDeleteModal'));
        }
    },

    setDefaultAddress: async (newDefaultId) => {
        if (!state.currentUser || !newDefaultId) return;

        const addressesRef = state.db.collection('users').doc(state.currentUser.uid).collection('addresses');
        const batch = state.db.batch();

        try {
            const currentDefaultSnapshot = await addressesRef.where('isDefault', '==', true).get();
            currentDefaultSnapshot.forEach(doc => {
                batch.update(doc.ref, { isDefault: false });
            });

            const newDefaultRef = addressesRef.doc(newDefaultId);
            batch.update(newDefaultRef, { isDefault: true });

            await batch.commit();
            UI.showToast('Default address updated.');
            await UI.renderAddressList();
        } catch (error) {
            console.error("Error setting default address:", error);
            UI.showToast('Failed to update default address.');
        }
    },

    applyCoupon: () => {
        const input = document.getElementById('couponInput');
        if (!input) return;
        const code = input.value.trim().toUpperCase();
        state.couponError = null;

        if (!code) {
            state.couponError = 'Please enter a coupon code.';
            UI.updateCartSummary();
            return;
        }

        const coupon = config.COUPONS[code];
        const items = Object.keys(state.cart).map(id => {
            const product = state.products.find(p => p.id === parseInt(id));
            return { ...product, qty: state.cart[id] };
        });
        const subtotal = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);

        if (!coupon || (coupon.minOrder && subtotal < coupon.minOrder)) {
            state.couponError = coupon ? `This coupon is valid on orders above ₹${coupon.minOrder}.` : 'Promo code is invalid. Please try another code.';
            UI.showToast(coupon ? `Minimum order of ₹${coupon.minOrder} required.` : 'Invalid coupon code.');
            UI.updateCartSummary();
            input.value = code;
            return;
        }

        state.appliedCoupon = { code, ...coupon };
        UI.showToast(`Coupon '${code}' applied successfully!`);
        UI.renderCouponSection();
        UI.updateCartSummary();
        window.Analytics.trackEvent('apply_coupon', { coupon: code });
    },

    removeCoupon: () => {
        const removedCode = state.appliedCoupon.code;
        state.appliedCoupon = null;
        state.couponError = null;
        UI.showToast('Coupon removed.');
        UI.updateCartSummary();
        window.Analytics.trackEvent('remove_coupon', { coupon: removedCode });
    },

    triggerInstallPrompt: async () => {
        if (!state.deferredInstallPrompt) return;

        window.Analytics.trackEvent('pwa_install_clicked');

        state.deferredInstallPrompt.prompt();

        const { outcome } = await state.deferredInstallPrompt.userChoice;
        state.installPromptUsed = true;
        console.log(`User response to the install prompt: ${outcome}`);

        window.Analytics.trackEvent('pwa_install_outcome', { 'outcome': outcome });

        state.deferredInstallPrompt = null;

        UI.hideInstallPrompt();
    },

    trapFocusInInstallPrompt: (e) => {
        if (e.key !== 'Tab') return;

        const installBtn = document.getElementById('installBtn');
        const dismissBtn = document.getElementById('installDismissBtn');

        if (e.shiftKey) {
            if (document.activeElement === installBtn) {
                dismissBtn.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === dismissBtn) {
                installBtn.focus();
                e.preventDefault();
            }
        }
    },

    setupInstallPromptEvents: () => {
        const installBtn = document.getElementById('installBtn');
        const dismissBtn = document.getElementById('installDismissBtn');

        if (installBtn) {
            installBtn.addEventListener('click', Handlers.triggerInstallPrompt);
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', UI.hideInstallPrompt);
        }
    }
};
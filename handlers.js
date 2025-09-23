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

    setupEvents: () => {
        // --- Event Delegation on the Body for Dynamic/Repeated Elements ---
        document.body.addEventListener('click', (e) => {
            const target = e.target;

            // Product card click (but not on buttons)
            const productCard = target.closest('.product');
            if (productCard && !target.closest('.cart-controls, .add-to-cart-btn')) {
                e.preventDefault();
                const productId = productCard.dataset.id;
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
                        Analytics.trackEvent('view_item_details', {
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
        });

        // Typewriter focus/blur handlers
        const catalogSearchInput = document.getElementById('catalogSearch');
        catalogSearchInput.addEventListener('focus', UI.stopTypewriter);
        catalogSearchInput.addEventListener('blur', () => {
            if (!catalogSearchInput.value) UI.startTypewriter();
        });

        // Keyboard accessibility for carousel slides and other role="button" elements
        document.body.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                if (e.target.matches('.slide[data-action], [role="button"]')) e.target.click();
            }
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

        // Login/Signup form toggling
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

        // Header search inputs
        document.getElementById('catalogSearch').addEventListener('input', (e) => {
            clearTimeout(state.searchDebounceTimer);
            state.searchDebounceTimer = setTimeout(() => Handlers.handleCatalogSearch(e), 300);
        });

        // Category filter buttons
        document.getElementById('categories').addEventListener('click', (e) => {
            const categoryButton = e.target.closest('.category');
            if (categoryButton) {
                if (categoryButton.classList.contains('active')) return;

                document.querySelector('.category.active').classList.remove('active');
                categoryButton.classList.add('active');
                state.currentCategory = categoryButton.dataset.category;
                state.currentPageNumber = 1;
                document.getElementById('catalogSearch').value = '';
                state.currentSearch = '';
                UI.renderCatalogProducts();
                Analytics.trackEvent('select_category', { category: state.currentCategory });
            }
        });

        // Header buttons and View All
        document.querySelector('#home .view-all').addEventListener('click', () => UI.showPage('catalog'));

        // Consolidate all back button listeners into one loop
        document.querySelectorAll('.page .back-btn').forEach(btn => {
            const pageId = btn.closest('.page').id;
            if (pageId === 'addressPage') {
                btn.addEventListener('click', () => state.editingAddressId ? Handlers.cancelEditAddress() : Handlers.goBack());
            } else if (pageId !== 'loginModal' && pageId !== 'productPopup' && pageId !== 'cartModal') {
                btn.addEventListener('click', Handlers.goBack);
            }
        });

        // Event delegation for address list actions
        document.getElementById('addressListContainer').addEventListener('click', e => {
            const target = e.target;
            const optionsBtn = target.closest('.address-options-btn');
            if (optionsBtn) {
                const dropdown = optionsBtn.nextElementSibling;
                document.querySelectorAll('.address-dropdown-content.active').forEach(openDropdown => {
                    if (openDropdown !== dropdown) {
                        openDropdown.classList.remove('active');
                    }
                });
                dropdown.classList.toggle('active');
                e.stopPropagation();
                return;
            }

            const actionBtn = target.closest('.address-action-btn');
            if (actionBtn) {
                const addressId = actionBtn.dataset.id;
                if (actionBtn.classList.contains('delete-address-btn')) {
                    Handlers.deleteAddress(addressId);
                } else if (actionBtn.classList.contains('set-default-btn')) {
                    Handlers.setDefaultAddress(addressId);
                } else if (actionBtn.classList.contains('edit-address-btn')) {
                    Handlers.editAddress(addressId);
                }
                actionBtn.closest('.address-dropdown-content').classList.remove('active');
                return;
            }
        });

        // Close dropdowns if clicking anywhere else
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.address-options-menu')) {
                document.querySelectorAll('.address-dropdown-content.active').forEach(openDropdown => {
                    openDropdown.classList.remove('active');
                });
            }
        });

        // Confirmation modal buttons
        document.getElementById('cancelDeleteBtn').addEventListener('click', () => document.getElementById('confirmDeleteModal').classList.remove('active'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', Handlers.executeDeleteAddress);

        // Order Success modal buttons
        document.getElementById('continueShoppingBtn').addEventListener('click', UI.closeOrderSuccessModal);
        document.getElementById('trackOrderBtn').addEventListener('click', Handlers.handleTrackOrder);

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

        // Listener for the fixed "Add New Address" button
        document.getElementById('addNewAddressBtnFixed').addEventListener('click', UI.showAddressForm);

        // The cart back button
        document.querySelector('#cartModal .back-btn').addEventListener('click', UI.closeCart);

        document.querySelectorAll('.cart-btn').forEach(btn => btn.addEventListener('click', UI.showCart));

        // Profile page buttons
        document.querySelector('.profile-button.orders').addEventListener('click', () => UI.showPage('ordersPage'));
        document.querySelector('.profile-button.address').addEventListener('click', async () => {
            if (state.currentUser) {
                await UI.renderAddressList();
                UI.showPage('addressPage');
            } else {
                UI.showToast('Please login to manage your address.');
                UI.showLoginModal();
            }
        });
        document.querySelector('.profile-button.faq').addEventListener('click', () => UI.showPage('faqPage'));
        document.querySelector('.profile-button.about').addEventListener('click', () => UI.showPage('aboutPage'));
        document.querySelector('.profile-button.support').addEventListener('click', () => Handlers.openWhatsApp('support'));
        document.getElementById('referBtn').addEventListener('click', () => UI.showPage('referPage'));
        document.getElementById('profileInstallBtn').addEventListener('click', UI.triggerInstallPrompt);
        document.getElementById('aboutPageCtaBtn').addEventListener('click', () => UI.showPage('catalog'));
        document.querySelector('#aboutPage .back-btn').addEventListener('click', Handlers.goBack);

        // Refer a Friend page buttons
        document.querySelector('#referPage .back-btn').addEventListener('click', Handlers.goBack);
        document.getElementById('copyReferralBtn').addEventListener('click', Handlers.copyReferralLink);
        document.getElementById('shareOnWhatsAppBtn').addEventListener('click', () => Handlers.openWhatsApp('refer'));

        // Product Popup buttons
        document.getElementById('ordersPage').addEventListener('click', e => {
            const tab = e.target.closest('.order-filter-tab');
            // The logic for filtering orders is now self-contained within renderOrdersPage,
            // so this part of the handler is no longer needed.
            // We keep the listener for opening the details drawer.

            const detailsBtn = e.target.closest('.order-card');
            if (detailsBtn) {
                const orderId = detailsBtn.dataset.orderId;
                // Fetch the specific order from Firestore to open the details drawer
                state.db.collection('orders').doc(orderId).get().then(doc => {
                    if (doc.exists) UI.openOrderDetailsDrawer(doc.data());
                });
            }
        });
        document.getElementById('logoutBtn').addEventListener('click', Handlers.handleLogout);
        document.getElementById('guestProfileCta').addEventListener('click', (e) => UI.showLoginModal(e, 'signup'));
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

        // Cart page buttons
        document.querySelector('#cartModal .empty-cart-btn').addEventListener('click', () => { UI.showPage('catalog'); UI.closeCart(); });
        document.getElementById('shopFromOrdersBtn').addEventListener('click', () => UI.showPage('home'));

        // Checkout button
        document.getElementById('cartFooter').addEventListener('click', (e) => {
            if (e.target.closest('.checkout-btn')) {
                Handlers.checkout();
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

                Analytics.trackEvent('select_payment_method', { method: state.selectedPaymentMethod });

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

        Analytics.trackAddToCart(state.popupProduct, qty);
    },

    toggleFavorite: () => {
        state.isPopupFavorite = !state.isPopupFavorite;
        const favoriteBtn = document.querySelector('.popup-action-btn.favorite');
        favoriteBtn.setAttribute('aria-pressed', state.isPopupFavorite);
        favoriteBtn.setAttribute('aria-label', state.isPopupFavorite ? 'Remove from Favorites' : 'Add to Favorites');
        favoriteBtn.innerHTML = `<i class="${state.isPopupFavorite ? 'fas' : 'far'} fa-heart"></i>`;
        favoriteBtn.style.color = state.isPopupFavorite ? 'var(--error-color)' : 'var(--primary-color)';

        if (state.popupProduct) {
            Analytics.trackEvent(state.isPopupFavorite ? 'add_to_wishlist' : 'remove_from_wishlist', {
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
        const referralMessage = `Hey! I’ve been ordering seafood from Coastal Fresh – always fresh, neatly cleaned and delivered to my home in Hyderabad. You should try it! Use my referral link for 10% off on your first order. 👉 ${referralLink}`;
        const shareTitle = 'Get 10% Off at Coastal Fresh!';
        const imageUrl = 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757139649/refer_eran_whats_app_ryhhmi.png';

        if (navigator.share) {
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const file = new File([blob], 'coastal-fresh-referral.png', { type: blob.type });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: shareTitle,
                        text: referralMessage,
                    });
                } else {
                    await navigator.share({
                        title: shareTitle,
                        text: referralMessage,
                    });
                }
            } catch (error) {
                console.error('Error sharing with image, falling back to text only:', error);
                await navigator.share({
                    title: shareTitle,
                    text: referralMessage,
                }).catch(e => console.error("Final share attempt failed", e));
            }
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(referralMessage)}`, '_blank');
        }

        Analytics.trackEvent('share', {
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
        if (addedProduct) Analytics.trackAddToCart(addedProduct, qty);
    },

    updateQty: (id, change) => {
        if (!state.cart[id]) return;

        const product = state.products.find(p => p.id === parseInt(id));
        const originalQty = state.cart[id];

        state.cart[id] += change;
        if (state.cart[id] <= 0) {
            delete state.cart[id];
            if (product) {
                Analytics.trackEvent('remove_from_cart', {
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
            if (product) Analytics.trackChangeQty(product, change, state.cart[id]);
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
                    itemEl.addEventListener('transitionend', () => UI.showCart(), { once: true });
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
            return;
        }

        if (!state.currentUser) {
            document.getElementById('cartModal').classList.remove('active');
            UI.showToast('Please sign up or log in to place your order.');
            state.afterLoginAction = Handlers.checkout;
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

        state.db.collection('orders').add(orderData)
            .then(() => {
                state.cart = {};
                Handlers.saveCart();
                UI.updateCartUI();
                UI.closeCart();
                UI.showOrderSuccessModal(orderId, message);

                Analytics.trackPurchase(orderId, total, items);
            })
            .catch((error) => {
                console.error("Error saving order to Firestore:", error);
                UI.showToast("Could not place your order. Please try again.");
                Analytics.trackEvent('purchase_failure', {
                    error_message: error.message
                });
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
            Analytics.trackEvent('view_search_results', {
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

    openWhatsApp: (type) => {
        let message = '';
        let url = 'https://wa.me/919985125678';

        if (type === 'support') {
            message = 'Hi Coastal Fresh, I need assistance with my order.';
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

                Analytics.trackEvent('sign_up', { method: 'Email' });
                if (state.afterLoginAction) {
                    UI.showToast('Success! Taking you to checkout...');
                } else {
                    UI.showToast('Account created successfully!');
                }
                UI.closeLoginModal();
            })
            .catch(error => {
                authError.textContent = error.message;
                Analytics.trackEvent('sign_up_failure', { method: 'Email' });
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
                Analytics.trackEvent('login', { method: 'Email' });
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
                    Analytics.trackEvent('sign_up', { method: 'Google' });
                } else {
                    Analytics.trackEvent('login', { method: 'Google' });
                }

                if (state.afterLoginAction) {
                    UI.showToast('Success! Taking you to checkout...');
                } else {
                    UI.showToast(`Welcome, ${result.user.displayName}!`);
                }
                UI.closeLoginModal();
            }).catch(error => {
                authError.textContent = error.message;
                Analytics.trackEvent('login_failure', { method: 'Google' });
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
            UI.showToast('You have been logged out.');
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

        try {
            const registration = await navigator.serviceWorker.ready;
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Notification permission not granted.');
                return;
            }
            console.log('Notification permission granted.');

            const token = await messaging.getToken({ serviceWorkerRegistration: registration });

            if (token) {
                console.log('FCM Token:', token);
                if (state.currentUser) {
                    await state.db.collection('users').doc(state.currentUser.uid).collection('fcmTokens').doc(token).set({
                        token: token,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        } catch (err) {
            console.error('Unable to initialize Firebase Messaging.', err);
        }

        messaging.onMessage(payload => {
            console.log('Message received. ', payload);
            if (payload.notification) {
                UI.showToast(`${payload.notification.title}: ${payload.notification.body}`);
            }
        });
    },

    handleAuthStateChange: (user) => {
        const isNewLogin = !state.currentUser && user;
        state.currentUser = user;
        Handlers.updateUIForAuthState();

        if (user) {
            Analytics.identifyUser(user);

            if (typeof state.afterLoginAction === 'function') {
                setTimeout(state.afterLoginAction, 100);
                state.afterLoginAction = null;
            }
        } else {
            if (window.hj) {
                hj('identify', null, {});
                console.log('Hotjar user session anonymized.');
            }
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
        Analytics.trackEvent('apply_coupon', { coupon: code });
    },

    removeCoupon: () => {
        const removedCode = state.appliedCoupon.code;
        state.appliedCoupon = null;
        state.couponError = null;
        UI.showToast('Coupon removed.');
        UI.updateCartSummary();
        Analytics.trackEvent('remove_coupon', { coupon: removedCode });
    },

    triggerInstallPrompt: async () => {
        if (!state.deferredInstallPrompt) return;

        Analytics.trackEvent('pwa_install_clicked');

        state.deferredInstallPrompt.prompt();

        const { outcome } = await state.deferredInstallPrompt.userChoice;
        state.installPromptUsed = true;
        console.log(`User response to the install prompt: ${outcome}`);

        Analytics.trackEvent('pwa_install_outcome', { 'outcome': outcome });

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
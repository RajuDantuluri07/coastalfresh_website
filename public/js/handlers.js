import { _simpleHash } from './ui.js'; // Import _simpleHash
let state, config, UI; // UI is passed in init, so no need to import directly here

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

            // Product card click (but not on buttons that have their own handlers)
            const productCard = target.closest('.product:not(.unavailable)'); // FIX: Only select available product cards
            if (productCard && !target.closest('.cart-controls, .add-btn, .wish, .variant-btn, .notify-btn')) {
                e.preventDefault();
                const productId = parseInt(productCard.dataset.id, 10);
                if (productId) UI.showProductPopup(productId);
            }

            // NEW: Handle "Find Products" button on empty favorites page
            const findProductsBtn = target.closest('#findProductsFromFavorites');
            if (findProductsBtn) {
                UI.showPage('catalog');
            }

            // CTA button on product cards
            const addBtn = target.closest('.add-btn');
            if (addBtn) {
                e.stopPropagation();
                const buttonId = addBtn.dataset.id;
                const isVariantAction = addBtn.classList.contains('variant-btn');
                const productId = isVariantAction ? parseInt(buttonId, 10) : parseInt(buttonId.split('-')[0], 10);
                const product = state.products.find(p => p.id === productId);

                // Analytics
                window.Analytics.trackEvent('product_card_cta_click', {
                    cta_type: addBtn.textContent,
                    product_id: productId,
                    variant_count: product?.variants?.length || 1
                });

                if (isVariantAction) {
                    // This is a multi-variant button ("{n} Sizes" or "ADD" for 2 variants)
                    // It should open the new variant drawer.
                    window.Analytics.trackEvent('variant_picker_opened_from_card', { product_id: productId });
                    UI.openVariantDrawer(productId);
                } else {
                    // This is a direct "ADD" for a single-variant product.
                    Handlers.addToCart(buttonId);
                }
            }

            // Quantity controls on product cards (scoped to image container)
            const productQtyBtn = target.closest('.product-image .cart-controls .qty-btn');
            if (productQtyBtn) {
                e.stopPropagation(); // Prevent card click
                const controls = productQtyBtn.closest('.cart-controls');
                const variantId = controls.dataset.id;
                if (variantId) {
                    const change = productQtyBtn.classList.contains('inc') ? 1 : -1;
                    Handlers.updateQty(variantId, change, 'card');
                }
            }

            // Favorite button on product card
            const favBtn = target.closest('.wish');
            if (favBtn) {
                e.stopPropagation(); // Prevent popup from opening
                const productId = parseInt(favBtn.dataset.id, 10);
                if (!isNaN(productId)) Handlers.toggleFavorite(productId);
            }

            // NEW: Handle notify me button click
            const notifyBtn = target.closest('.notify-btn');
            if (notifyBtn) {
                e.stopPropagation();
                UI.showToast('Notify me feature coming soon!');
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
                if (detailItem) { // Ensure it's a detail item
                    // Track analytics for any detail item click
                    window.Analytics.trackEvent('view_item_details', {
                        item_id: state.popupProduct?.id,
                        item_name: state.popupProduct?.name,
                        detail_section: detailItem.id // Track which section was clicked
                    });

                    // Only toggle if it's NOT the productInfoDetailItem
                    if (detailItem.id !== 'productInfoDetailItem') {
                        const content = detailItem.querySelector('.detail-content');
                        const icon = detailHeader.querySelector('i');
                        const isOpen = detailItem.classList.toggle('active');
                        content.style.maxHeight = isOpen ? content.scrollHeight + 'px' : '0';
                        content.style.padding = isOpen ? '0 0 16px 0' : '0';
                        if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
                    }
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

            // Confirmation modal buttons
            if (target.id === 'cancelDeleteBtn') document.getElementById('confirmDeleteModal').classList.remove('active');
            if (target.id === 'confirmDeleteBtn') Handlers.executeDeleteAddress();
            // NEW: Clear Cart confirmation
            if (target.id === 'clearCartBtn') Handlers.showClearCartConfirmation();
            if (target.id === 'cancelClearCartBtn') UI.closeModal(document.getElementById('confirmClearCartModal'));
            if (target.id === 'confirmClearCartBtn') Handlers.executeClearCart();

            // Order Success modal buttons
            if (target.id === 'continueShoppingBtn') UI.closeOrderSuccessModal();
            if (target.id === 'trackOrderBtn') Handlers.handleTrackOrder(e);

            // Fixed "Add New Address" button
            if (target.id === 'addNewAddressBtnFixed') UI.showAddressForm();

            // Cart back button
            if (target.closest('#cartModal .back-btn') || target.closest('#cartOverlay') === target) UI.closeCart();
            if (target.closest('.cart-btn')) UI.showCart();

            // Profile page buttons
            const profileBtn = target.closest('.profile-button');
            if (profileBtn) Handlers.handleProfileButtonClick(profileBtn);

            // Checkout button in cart
            if (target.id === 'cartPlaceOrderBtn') Handlers.checkout();

            // NEW: Handle click on the entire order card to show details
            const orderCard = target.closest('.order-card');
            if (orderCard) {
                const orderId = orderCard.dataset.orderId;
                if (orderId) {
                    state.db.collection('orders').doc(orderId).get().then(doc => {
                        if (doc.exists) {
                            UI.openOrderDetailsDrawer(doc.data());
                        }
                    });
                }
            }

            // NEW: Handle click on the "Explore Today's Fresh Catch" button on the About Us page
            if (target.id === 'aboutPageCtaBtn') {
                UI.showPage('catalog');
            }

            // NEW: Handle "Share on WhatsApp" button on the refer page
            if (target.id === 'shareOnWhatsAppBtn') {
                e.preventDefault();
                Handlers.openWhatsApp('refer');
            }

            // NEW: Handle "Share on Other Apps" button on refer page
            if (target.id === 'shareOnOtherAppsBtn') {
                e.preventDefault();
                Handlers.shareProduct(); // Re-use the generic share handler
            }

            // NEW: Handle "Terms" button on refer page
            if (target.id === 'showTermsBtn') {
                UI.openModal(document.getElementById('referralTermsModal'));
            }
            if (target.id === 'closeTermsBtn') {
                UI.closeModal(document.getElementById('referralTermsModal'));
            }

            // --- FIX: Cart quantity controls ---
            const cartQtyBtn = target.closest('.cart-item-qty .qty-btn'); // This selector is specific to the cart items
            if (cartQtyBtn) {
                e.stopPropagation();
                // FIX: The data-id is on the parent '.cart-item-qty' or '.cart-item-card'
                const cartControls = target.closest('[data-id]');
                const variantId = cartControls.dataset.id;
                const change = cartQtyBtn.classList.contains('inc') ? 1 : -1;
                // The check for variantId happens inside updateQty
                Handlers.updateQty(variantId, change, 'cart');
            }
        });

        // Variant Drawer events
        document.getElementById('variantDrawerClose').addEventListener('click', UI.closeVariantDrawer);
        document.getElementById('variantDrawerOverlay').addEventListener('click', UI.closeVariantDrawer);
        document.getElementById('variantDrawerContent').addEventListener('click', (e) => {
            const addBtn = e.target.closest('.add-btn');
            if (addBtn) {
                e.stopPropagation(); // FIX: Stop the event from bubbling up to the body handler.
                Handlers.addToCart(addBtn.dataset.id);
            }
            const qtyBtn = e.target.closest('.qty-btn');
            if (qtyBtn) {
                e.stopPropagation(); // FIX: Also stop quantity button events from bubbling.
                // FIX: Ensure we are targeting the correct container for the variant ID.
                const controls = qtyBtn.closest('[data-id]');
                const variantId = controls.dataset.id;
                const change = qtyBtn.classList.contains('inc') ? 1 : -1;
                Handlers.updateQty(variantId, change, 'drawer');
                // FIX: Update the drawer UI after changing quantity.
                // This was a bug where the drawer UI wouldn't refresh after a quantity change.
                UI.updateVariantDrawer();
            }
        });

        // --- NEW: Event listener for the enhanced Refer a Friend page ---
        const referPage = document.getElementById('referPage');
        if (referPage) { // FIX: Add listener for the new login button
            referPage.addEventListener('click', (e) => {
                if (e.target.closest('#copyReferralBtn')) Handlers.copyReferralLink();
                // NEW: Handle click on the login button on the refer page
                if (e.target.closest('#referralLoginBtn')) UI.showLoginModal(null, 'signup');
            });
        }

        // Typewriter focus/blur handlers
        const catalogSearchInput = document.getElementById('catalogSearch');
        catalogSearchInput.addEventListener('focus', UI.stopTypewriter);
        catalogSearchInput.addEventListener('blur', () => {
            if (!catalogSearchInput.value) UI.startTypewriter();
        });

        // Tooltip handler
        document.body.addEventListener('click', e => {
            const infoIcon = e.target.closest('.cart-bill-row .fa-info-circle');
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

        // --- NEW: Event listeners for the new product popup design ---
        const popup = document.getElementById('productPopupOverlay');
        popup.addEventListener('click', (e) => {
            // Close button or clicking the overlay background
            if (e.target.closest('.popup-close-btn') || e.target.closest('.back-btn') || e.target === popup) {
                UI.closePopup();
            }
            // Add to cart button
            const addToCartBtn = e.target.closest('#popupAddToCartBtn');
            if (addToCartBtn) {
                Handlers.addPopupToCart();
            }
            // Wishlist button
            // Quantity controls
            const qtyBtn = e.target.closest('.qty-control button');
            if (qtyBtn) {
                const change = qtyBtn.id.includes('Inc') ? 1 : -1;
                Handlers.changePopupQty(change);
            }
        });

        // Variant selector dropdown
        document.getElementById('popupVariantSelector').addEventListener('change', (e) => {
            const newIndex = parseInt(e.target.value, 10);
            UI.updatePopupSelection(newIndex);
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

        // NEW: Top Navigation (Desktop)
        document.getElementById('topNavDesktop').addEventListener('click', e => {
            e.preventDefault(); // Prevent the link's default # behavior
            const navItem = e.target.closest('.top-nav-item');
            if (!navItem) return;
            const page = navItem.dataset.page;
            if (page) {
                UI.showPage(page);
            }
        });

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
        } else if (button.classList.contains('support')) { // MODIFIED: Redirect to contact page
            UI.showPage('contactPage');
        }
    },

    changePopupQty: (change) => {
        state.currentProductQty = Math.max(1, Math.min(99, state.currentProductQty + change));
        const variantId = `${state.popupProduct.id}-${state.selectedVariantIndex}`;
        const newQty = (state.cart[variantId] || 0) + change;
        Handlers.updateQty(variantId, change, 'popup');
    },

    addPopupToCart: () => {
        if (!state.popupProduct) return;
        const variantId = `${state.popupProduct.id}-${state.selectedVariantIndex}`;
        Handlers.addToCart(variantId, state.currentProductQty); 
    },

    /**
     * Adds multiple items to the cart, saves, and updates UI.
     * This is more efficient than calling addToCart in a loop as it shows a single toast.
     * @param {Array} items - Array of items from an order ({ id, qty }).
     */
    addMultipleToCart: (items) => {
        if (!items || items.length === 0) return;

        // FIX: The 'items' from an order have {id, name, qty, price, image}. The 'id' is the variantId.
        let itemsAddedCount = 0;
        items.forEach(item => {
            const [productId, variantIndex] = item.id.split('-').map(Number);
            const product = state.products.find(p => p.id === productId);
            const qtyToAdd = (typeof item.qty === 'number' && item.qty > 0) ? item.qty : 1;
            if (product && product.variants[variantIndex]?.available) {
                // FIX #6: Analytics was tracking the wrong price on reorder.
                const variant = product.variants[variantIndex];
                state.cart[item.id] = (state.cart[item.id] || 0) + qtyToAdd;
                itemsAddedCount++;
                window.Analytics.trackAddToCart({ ...product, ...variant }, qtyToAdd);
            }
        });

        if (itemsAddedCount > 0) {
            Handlers.saveCart();
            UI.updateCartUI();
            UI.showToast(`${itemsAddedCount} item(s) from your order have been added to the cart!`);
            UI.showCart();
        }
    },

    shareProduct: async () => {
        let referralLink = 'https://coastalfresh.in?ref=GUEST123';
        if (state.currentUser && state.currentUser.uid && typeof _simpleHash === 'function') { // Check if _simpleHash is available
            referralLink = `https://coastalfresh.in?ref=${_simpleHash(state.currentUser.uid)}`;
        }
        // The text message is the most important part, as it contains the referral link.
        const referralMessage = `Hey! I’ve been ordering from Coastal Fresh – always fresh and delivered to my home in Hyderabad. You should try it! Use my link for 10% off on your first order. 👉 ${referralLink}`;
        const shareTitle = 'Get 10% Off at Coastal Fresh!';

        if (navigator.share) {
            try {
                // We prioritize sharing the text to ensure the referral link is always sent.
                // FIX: Remove the `url` property. Some apps (like WhatsApp) append the `url` to the `text`, causing the link to appear twice. The link is already in the `text` property.
                await navigator.share({
                    title: shareTitle,
                    text: referralMessage
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

    addToCart: (variantId, qty = 1) => {
        const [productIdStr, variantIndexStr] = variantId.split('-');
        const productId = parseInt(productIdStr, 10);
        const variantIndex = parseInt(variantIndexStr, 10);
        const product = state.products.find(p => p.id === productId);
        if (!product || !product.variants[variantIndex] || !product.variants[variantIndex].available) return;

        const variant = product.variants[variantIndex];

        if (state.cart.hasOwnProperty(variantId)) { // Use hasOwnProperty for safer check
            state.cart[variantId] = Math.min(99, state.cart[variantId] + qty);
        } else {
            state.cart[variantId] = qty;
        }

        Handlers.saveCart();
        UI.updateCartUI();
        UI.updateProductCardState(productId); // FIX: Pass productId to update all cards for that product.
        
        // FIX: Construct toast message correctly to avoid duplicate names.
        const toastMessage = (variant.name && variant.name !== product.name) ? `${product.name} (${variant.name})` : product.name;
        UI.showToast(`${toastMessage} added to cart!`);

        // Animate the "ADD" button to "ADDED" temporarily
        const addBtn = document.querySelector(`.add-btn[data-id='${variantId}']`);
        if (addBtn) {
            addBtn.disabled = true;
        }

        // NEW: If the cart is currently open, re-render it to show the newly added item.
        if (document.getElementById('cartOverlay')?.classList.contains('active')) {
            UI.showCart();
        }

        // Analytics
        window.Analytics.trackAddToCart({ ...product, ...variant }, qty);
    },

    showClearCartConfirmation: () => {
        const modal = document.getElementById('confirmClearCartModal');
        if (modal) {
            UI.openModal(modal, modal.querySelector('#cancelClearCartBtn'));
        }
    },

    executeClearCart: () => {
        state.cart = {};
        Handlers.saveCart();
        UI.updateCartUI();
        UI.showToast('Cart has been cleared.');
        UI.closeModal(document.getElementById('confirmClearCartModal'));
        // Re-render any visible product cards to show "ADD" instead of quantity controls
        UI.renderFeaturedProducts();
        UI.renderCatalogProducts();
    },

    checkout: async () => {
        const cartFooter = document.getElementById('cartFooter');
        const checkoutBtn = document.getElementById('cartPlaceOrderBtn');
        const rawItems = Object.entries(state.cart).map(([variantId, qty]) => {
            const [productId, variantIndex] = variantId.split('-').map(Number);
            const product = state.products.find(p => p.id === productId);
            const variant = product?.variants[variantIndex];
            if (!product || !variant) {
                console.warn(`Variant ID ${variantId} from cart not found. It will be removed.`);
                return null;
            }
            return { ...product, ...variant, variantId, qty };
        });

        const items = rawItems.filter(Boolean);

        if (items.length !== rawItems.length) {
            state.cart = items.reduce((acc, item) => {
                acc[item.variantId] = item.qty;
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
            UI.closeCart();
            UI.showToast('Please log in to continue checkout.'); 
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

        const deliveryFee = 0;
        const total = subtotal - couponDiscount + deliveryFee;

        const orderData = {
            orderId: orderId,
            userId: state.currentUser.uid,
            items: items.map(item => ({ id: item.variantId, name: `${item.name} (${item.variantName || item.net})`, qty: item.qty, price: item.finalPrice, image: item.image })), // Use variantName or net
            subtotal: Math.round(subtotal),
            coupon: state.appliedCoupon ? { code: state.appliedCoupon.code, discount: Math.round(couponDiscount) } : null,
            deliveryFee: Math.round(deliveryFee),
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
                UI.showOrderSuccessModal(orderId);

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
                    checkoutBtn.textContent = 'Place Order';
                }
            });
    },

    updateQty: (variantId, change, source = 'card') => {
        if (!state.cart[variantId] && change < 1) return;

        const [productIdStr, variantIndexStr] = variantId.split('-');
        const productId = parseInt(productIdStr, 10);
        const variantIndex = parseInt(variantIndexStr, 10);
        const product = state.products.find(p => p.id === productId);
        const variant = product?.variants[variantIndex];
        const originalQty = state.cart[variantId] || 0;

        state.cart[variantId] = (state.cart[variantId] || 0) + change;

        if (state.cart[variantId] <= 0) {
            delete state.cart[variantId];
            if (product && variant) {
                window.Analytics.trackEvent('remove_from_cart', {
                    currency: 'INR',
                    value: variant.finalPrice * originalQty,
                    items: [{ item_id: variantId, item_name: `${product.name} (${variant.name || ''})`, price: variant.finalPrice, quantity: originalQty }]
                });
            }
        } else {
            if (product) window.Analytics.trackChangeQty({ ...product, ...variant }, change, state.cart[variantId]);
        }
        Handlers.saveCart();
        UI.updateCartUI();

        if (state.isPopupOpen && state.popupProduct?.id === productId) {
            UI.updatePopupCta();
        }
        UI.updateProductCardState(productId);
    },

    toggleFavorite: (productId) => {
        if (isNaN(productId)) return;

        const isFavorited = state.favorites.has(productId);
        const product = state.products.find(p => p.id === productId);

        // FIX: Correctly handle adding/removing from favorites. The old logic was reversed.
        if (isFavorited) {
            state.favorites.delete(productId);
            UI.showToast(`${product.name} removed from favorites`);
            if (product) window.Analytics.trackEvent('remove_from_wishlist', {
                currency: 'INR', value: product.finalPrice, items: [{ item_id: product.id, item_name: product.name }]
            });
        } else {
            state.favorites.add(productId);
            UI.showToast(`${product.name} added to favorites!`);
            if (product) window.Analytics.trackEvent('add_to_wishlist', {
                currency: 'INR', value: product.finalPrice, items: [{ item_id: product.id, item_name: product.name }]
            });
        }

        Handlers.saveFavorites();
        // Update all matching buttons
        document.querySelectorAll(`.wish[data-id="${productId}"]`).forEach(btn => {
            btn.innerHTML = !isFavorited ? '♥' : '♡'; // The new state is the opposite of the old one
            btn.setAttribute('aria-pressed', !isFavorited);
        });

        // Update popup if it's open for this product
        if (state.isPopupOpen && state.popupProduct?.id === productId) {
            const wishlistBtn = document.getElementById('popupWishlistBtn');
            if (wishlistBtn) {
                wishlistBtn.textContent = !isFavorited ? '♥' : '♡';
                wishlistBtn.setAttribute('aria-pressed', isFavorited);
            }
        }
    },

    loadFavorites: async () => {
        if (state.currentUser) {
            try {
                const doc = await state.db.collection('users').doc(state.currentUser.uid).get();
                if (doc.exists && doc.data().favorites) {
                    state.favorites = new Set(doc.data().favorites);
                }
            } catch (error) {
                console.error("Error loading favorites from Firestore:", error);
            }
        } else {
            try {
                const saved = localStorage.getItem('guestFavorites');
                if (saved) {
                    state.favorites = new Set(JSON.parse(saved));
                }
            } catch (e) {
                console.error('Error loading favorites from localStorage:', e);
            }
        }
    },

    saveFavorites: () => {
        if (state.currentUser) {
            state.db.collection('users').doc(state.currentUser.uid).set({
                favorites: Array.from(state.favorites)
            }, { merge: true }).catch(error => {
                console.error("Error saving favorites to Firestore:", error);
            });
        } else {
            try {
                localStorage.setItem('guestFavorites', JSON.stringify(Array.from(state.favorites)));
            } catch (e) {
                console.error('Error saving favorites to localStorage:', e);
            }
        }
    },

    handleAuthStateChange: async (user) => {
        const isNewLogin = !state.currentUser && user;
        state.currentUser = user;

        // Load user-specific data
        await Handlers.loadFavorites();
        Handlers.loadCart(); // Reload cart which might have been saved from a previous session

        UI.updateUIForAuthState();
        // Re-render visible products to reflect new favorite status
        UI.renderCatalogProducts();
        UI.renderFeaturedProducts();
        if (state.currentPage === 'favoritesPage') UI.renderFavoritesPage();
    },

    handleTrackOrder: () => {
        UI.closeModal(document.getElementById('orderSuccessModal'));
        UI.showPage('ordersPage');
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
        const referralLinkContainer = document.getElementById('copyReferralBtn');
        if (!referralLinkContainer) return;

        const linkSpan = referralLinkContainer.querySelector('.refer-link');
        const icon = referralLinkContainer.querySelector('i');
        if (!linkSpan || !icon) return;

        const originalText = linkSpan.textContent;
        const originalIconClass = icon.className;
        const referralLink = originalText;

        if (navigator.clipboard) {
            navigator.clipboard.writeText(referralLink).then(() => {
                linkSpan.textContent = 'Copied!';
                icon.className = 'fas fa-check';
                setTimeout(() => {
                    linkSpan.textContent = originalText;
                    icon.className = originalIconClass;
                }, 2000);
            }, (err) => {
                console.error('Could not copy text: ', err);
                UI.showToast('Failed to copy link.', true);
            });
        }
    },

    openWhatsApp: (type, orderId = null) => {
        let message = '';
        // FIX: Use centralized phone number from config
        let url = `https://wa.me/${config.SUPPORT_PHONE_NUMBER}`;

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

        for (const [variantId, qty] of Object.entries(cartData)) { // Iterate over variantId
            const [productIdStr, variantIndexStr] = variantId.split('-');
            const productId = parseInt(productIdStr, 10);
            const variantIndex = parseInt(variantIndexStr, 10);
            const product = state.products.find(p => p.id === productId);
            if (!product || !product.variants[variantIndex]) continue; // Check if product and variant exist

            const numericQty = parseInt(qty);
            if (isNaN(numericQty)) continue;

            const clampedQty = Math.max(0, Math.min(99, numericQty));
            if (clampedQty > 0) {
                sanitized[variantId] = clampedQty;
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
                    // FIX #10: User role was not being set on email signup.
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    role: 'customer' // Assign default role
                });

                window.Analytics.trackEvent('sign_up', { method: 'Email' });
                if (state.afterLoginAction) {
                    UI.showToast('Success! Taking you to checkout...');
                } else {
                    UI.showToast('Account created successfully!');
                }
                // Set a flag to trigger the notification prompt
                state.isNewLogin = true;
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
                // Set a flag to trigger the notification prompt
                state.isNewLogin = true;
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
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        role: 'customer' // Assign default role
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
                // Set a flag to trigger the notification prompt
                state.isNewLogin = true;
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
            UI.updateUIForAuthState(); // This now correctly calls the function in ui.js
            UI.showPage('home');
        }).catch(error => {
            console.error('Logout Error:', error);
        });
    },

    initFirebaseMessaging: async (registration) => {
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
    
        // Request permission if it hasn't been granted or denied yet.
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        // If permission is not granted after the prompt (or was already denied), exit.
        if (Notification.permission !== 'granted') {
            console.log('Notification permission not granted. User will not receive push notifications.');
            return;
        }
    
        try {
            // The VAPID key is required for web push notifications.
            // This is generated in your Firebase project settings under Cloud Messaging.
            const vapidKey = "BBVKpOXnP5lq1tVGX0lAhnnsIzt9uET8jzdE98ocBBnO3-vlS7IDLRInG2iJ3COVkK5ycZ-toAE68kZdDpUuH_g";
            const token = await messaging.getToken({ serviceWorkerRegistration: registration, vapidKey });
    
            if (token && state.currentUser) {
                await Handlers.saveFcmToken(token);
            }
    
            // Handle token refresh. FCM tokens can be updated periodically.
            messaging.onTokenRefresh(async () => {
                try {
                    const refreshedToken = await messaging.getToken({ serviceWorkerRegistration: registration, vapidKey });
                    if (refreshedToken && state.currentUser) {
                        console.log('FCM token refreshed.');
                        await Handlers.saveFcmToken(refreshedToken);
                    }
                } catch (refreshErr) {
                    console.error('Unable to retrieve refreshed FCM token.', refreshErr.message);
                }
            });
    
        } catch (err) {
            // This catch block is crucial. It handles errors from `getToken()` if permissions are denied
            // or if the environment doesn't support it (e.g., incognito mode), preventing unhandled rejections.
            console.warn('Could not get FCM token:', err.message);
        }
    },

    /**
     * Saves or updates the user's FCM token in Firestore.
     * @param {string} token The FCM token to save.
     */
    saveFcmToken: async (token) => {
        if (!state.currentUser || !token) return;

        try {
            const tokenRef = state.db.collection('users').doc(state.currentUser.uid).collection('fcmTokens').doc(token);
            await tokenRef.set({
                token: token,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: navigator.userAgent,
                platform: navigator.platform
            });
            console.log('FCM token saved for user.');
            UI.showToast('Notification preferences updated!');
        } catch (error) {
            console.error('Error saving FCM token:', error);
            UI.showToast('Could not save notification preferences.', true);
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
        // FIX: Re-render the coupon section *before* updating the summary to prevent race conditions.
        UI.renderCouponSection();
        UI.showToast('Coupon removed.');
        UI.updateCartSummary();
        window.Analytics.trackEvent('remove_coupon', { coupon: removedCode });
    },

    triggerInstallPrompt: async () => {
        if (!state.deferredInstallPrompt) {
            console.log('Install prompt not available.');
            return;
        }
    
        try {
            if (window.Analytics) window.Analytics.trackEvent('pwa_install_clicked');
    
            // Show the browser's installation prompt
            state.deferredInstallPrompt.prompt();
    
            // Wait for the user to respond to the prompt
            const { outcome } = await state.deferredInstallPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
    
            if (window.Analytics) window.Analytics.trackEvent('pwa_install_outcome', { 'outcome': outcome });
    
            // Store install event in Firebase if accepted
            if (outcome === 'accepted') {
                state.installPromptUsed = true; // Mark as used only if accepted
                state.db.collection('installs').add({
                        userId: state.currentUser ? state.currentUser.uid : null,
                        outcome: outcome,
                        platform: 'web',
                        userAgent: navigator.userAgent,
                        installedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).catch(error => {
                        // This catch is for the Firestore write, not the prompt itself.
                        console.error('Error recording PWA install event:', error);
                    });
            }
        } catch (error) {
            // This will catch errors if the prompt cannot be shown or if userChoice rejects.
            console.error('Error during PWA install prompt:', error);
        } finally {
            // Always clean up, regardless of the outcome.
            state.deferredInstallPrompt = null;
            UI.hideInstallPrompt();
        }
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
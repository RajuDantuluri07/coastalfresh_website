let state, config, Handlers;

/**
 * Creates a simple, non-cryptographic hash from a string.
 * @param {string} str The string to hash.
 * @returns {number} A positive integer hash.
 */
export function _simpleHash(str) { // Exported for use in handlers.js
    if (!str) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash);
}

export const UI = {
    init: (appState, appConfig, appHandlers) => {
        state = appState;
        config = appConfig;
        Handlers = appHandlers;
    },

    renderTrustIcons: () => {
        const container = document.getElementById('trustStrip');
        if (!container) return;

        container.innerHTML = '';
        config.TRUST_ICONS.forEach((t, i) => {
            const item = document.createElement('div');
            item.className = 'trust-item';
            item.setAttribute('data-index', String(i));
            item.setAttribute('data-title', t.title);

            const iconWrap = document.createElement('div');
            iconWrap.className = 'icon-container';
            iconWrap.innerHTML = `<i class="${t.icon}"></i>`;
            const content = document.createElement('div');
            content.className = 'trust-content';
            const title = document.createElement('div'); title.className = 'trust-title'; title.textContent = t.title;
            const sub = document.createElement('div'); sub.className = 'trust-sub'; sub.textContent = t.text;

            content.appendChild(title); content.appendChild(sub);
            item.appendChild(iconWrap); item.appendChild(content);
            item.addEventListener('click', () => {
                window.Analytics.trackEvent('click', { location: 'trust_strip', item_title: t.title, item_index: i });
            });
            container.appendChild(item);
        });
    },

    renderCategories: () => {
        const container = document.getElementById('categories');
        if (!container) return;

        container.innerHTML = config.CATEGORIES_DATA.map((cat, index) => `
      <button class="category ${index === 0 ? 'active' : ''}" data-category="${cat.key}">
        ${cat.icon ? `<img src="${cat.icon}" alt="${cat.label}" class="category-icon" loading="lazy">` : ''}
        <span>${cat.label}</span>
      </button>
    `).join('');
    },

    renderCustomerReviews: () => {
        const container = document.getElementById('reviewsCarousel');
        if (!container) return;

        container.innerHTML = config.CUSTOMER_REVIEWS.map(review => {
            const firstName = review.name.split(' ')[0];
            const safeName = DOMPurify.sanitize(firstName);
            const safeLocation = DOMPurify.sanitize(review.location);
            const safeReview = DOMPurify.sanitize(review.review);

            const rating = (typeof review.rating === 'number' && review.rating >= 0 && review.rating <= 5)
                ? review.rating
                : 0;

            const avatar = review.image
                ? `<img src="${review.image}" alt="Avatar of ${safeName}" class="review-avatar" loading="lazy">`
                : `<div class="review-avatar-initials">${review.name.charAt(0)}</div>`;

            let stars = '';
            for (let i = 0; i < 5; i++) {
                stars += `<i class="fas fa-star ${i < rating ? '' : 'far'}"></i>`;
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
    },

    renderFlashSale: () => {
        const section = document.getElementById('flashSaleSection');
        if (!config.ENABLE_FLASH_SALE) {
            if (section) section.style.display = 'none';
            return;
        }

        const container = document.getElementById('flashSaleProducts');
        if (!container) return;

        let skeletonHTML = '';
        for (let i = 0; i < config.FLASH_SALE_PRODUCT_IDS.length; i++) {
            skeletonHTML += UI.createSkeletonProductHTML();
        }
        container.innerHTML = skeletonHTML;

        const flashSaleProducts = state.products.filter(p => config.FLASH_SALE_PRODUCT_IDS.includes(p.id));
        if (flashSaleProducts.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }
        container.innerHTML = flashSaleProducts.map(p => UI.createProductHTML(p, { isFlashSale: true })).join('');
    },

    createSkeletonProductHTML: () => {
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
    },

    updateSEOTags: ({ title, description, canonicalPath, imageUrl }) => {
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

        document.querySelector('meta[property="og:title"]').setAttribute('content', finalTitle);
        document.querySelector('meta[property="og:description"]').setAttribute('content', finalDesc);
        document.querySelector('meta[property="og:url"]').setAttribute('content', finalCanonical);
        document.querySelector('meta[property="og:image"]').setAttribute('content', finalImage);
        document.querySelector('meta[name="twitter:title"]').setAttribute('content', finalTitle);
        document.querySelector('meta[name="twitter:description"]').setAttribute('content', finalDesc);
        document.querySelector('meta[name="twitter:image"]').setAttribute('content', finalImage);
    },

    getOptimizedImageUrl: (url, width, height) => {
        if (!url || !url.includes('res.cloudinary.com')) {
            return url;
        }
        const transformations = `f_auto,q_auto,c_fill,w_${width},h_${height}`;
        return url.replace('/image/upload/', `/image/upload/${transformations}/`);
    },

    renderFeaturedProducts: () => {
        const container = document.getElementById('featuredProducts');
        if (!container) return;

        const featured = state.products.filter(p => config.FEATURED_PRODUCT_IDS.includes(p.id));
        container.innerHTML = featured.map(UI.createProductHTML).join('');
    },

    renderCatalogProducts: () => {
        const container = document.getElementById('catalogProducts');
        if (!container) return;

        if (state.currentPageNumber === 1) {
            let skeletonHTML = '';
            for (let i = 0; i < config.ITEMS_PER_PAGE; i++) {
                skeletonHTML += UI.createSkeletonProductHTML();
            }
            container.innerHTML = skeletonHTML;
        } else {
            const showMoreBtn = container.querySelector('.show-more-btn');
            if (showMoreBtn) {
                showMoreBtn.innerHTML = '<div class="loading"></div>';
                showMoreBtn.disabled = true;
            }
        }

        UI.populateCatalogProducts();
    },

    populateCatalogProducts: () => {
        const container = document.getElementById('catalogProducts');
        if (!container) return;

        let filtered = state.products.filter(p => {
            const matchCategory = state.currentCategory === 'All' || p.category === state.currentCategory;
            const matchSearch = !state.currentSearch || p.name.toLowerCase().includes(state.currentSearch.toLowerCase()) ||
                (p.desc && p.desc.toLowerCase().includes(state.currentSearch.toLowerCase()));
            return matchCategory && matchSearch;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #8E8E93;">No products found</div>';
            return;
        }

        container.innerHTML = filtered.map(UI.createProductHTML).join('');
    },

    createProductHTML: (product, options = {}) => {
        try {
            // Defensive check for the most critical product properties.
            if (!product || typeof product.id === 'undefined' || !product.name) {
                console.warn('Skipping render for invalid product data:', product);
                return ''; // Return an empty string to not break the .join('')
            }

            const primaryVariant = (product.variants && product.variants.length > 0) ? product.variants[0] : {};
            const hasOffer = primaryVariant.mrp > primaryVariant.finalPrice;
            const savings = hasOffer ? Math.round(primaryVariant.mrp - primaryVariant.finalPrice) : 0;
            const isInCart = Object.keys(state.cart).some(key => key.startsWith(`${product.id}-`));
            const optimizedImage = UI.getOptimizedImageUrl(product.image, 300, 300);
            const sanitizedName = DOMPurify.sanitize(product.name);

            let ctaButton = '';
            // FIX: Check availability of the specific variant for single-variant products.
            // FIX #4: Ensure out-of-stock for single variant products is based on the variant's availability.
            if (product.variants && product.variants.length > 1) {
                // For multi-variant products, the 'Options' button is always shown if the product is generally available.
                if (product.available) {
                    ctaButton = `<button class="add-btn variant-btn" data-id="${product.id}" aria-label="Choose options for ${sanitizedName}">OPTIONS</button>`;
                }
            } else if (primaryVariant && primaryVariant.available) {
                // For single-variant products, only show CTA if that variant is available.
                const variantId = `${product.id}-0`;
                const qtyInCart = state.cart[variantId] || 0;
                ctaButton = qtyInCart ?
                    `<div class="cart-controls" data-id="${variantId}"><button class="qty-btn dec" aria-label="Decrease quantity">&ndash;</button><span class="qty" aria-live="polite">${qtyInCart}</span><button class="qty-btn inc" aria-label="Increase quantity">+</button></div>` :
                    `<button class="add-btn add-pill" data-id="${variantId}" aria-label="Add ${sanitizedName} to cart"><i class="fas fa-plus"></i> ADD</button>`;
            }

            return `
        <div class="card product ${options.isFlashSale ? 'flash-sale-item' : ''}" data-id="${product.id}" role="article" aria-label="Product: ${sanitizedName}">
          <div class="product-image"> 
            <img src="${optimizedImage}" alt="Fresh ${sanitizedName} from Coastal Fresh India" loading="lazy" width="300" height="300">
            <button class="wish" aria-label="Add to wishlist">♡</button>
            ${!product.available ? `<div class="out-of-stock-badge">Out of Stock</div>` : ctaButton}
          </div>
          <div class="info">
            <h3 class="name">${sanitizedName}</h3>
            <div class="price-container">
              <span class="final-price">₹${primaryVariant.finalPrice || 'N/A'}</span>
              ${hasOffer ? `<span class="old-price">₹${primaryVariant.mrp}</span>` : ''}
              ${hasOffer && savings > 0 ? `<span class="save">SAVE ₹${savings}</span>` : ''}
            </div>
          </div>
        </div>
      `;
        } catch (error) {
            console.error(`Error rendering product card for product ID ${product?.id}:`, error);
            // Return an empty string so the rest of the products can render.
            return '';
        }
    },

    generateProductSlug: (product) => {
        if (!product || !product.name) return '';
        const namePart = product.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
        return `${namePart}-${product.id}`;
    },

    showProductPopup: (id) => {
        const numericId = parseInt(id);
        if (isNaN(numericId)) return;
        const product = state.products.find(p => p.id === numericId);
        if (!product) return;

        // --- OPTIMIZATION: Prioritize visual updates first ---
        state.popupProduct = product;
        state.selectedVariantIndex = 0; // Default to the first variant
        state.currentProductQty = state.cart[`${product.id}-${state.selectedVariantIndex}`] || 1; // Reflect quantity of selected variant in cart

        // Use cached DOM elements for speed
        const { main: popup, title, weight, priceSection, infoContent, mainImage, contentWrapper, backBtn } = state.dom.popup;

        const populatePopup = () => {
            title.textContent = product.name;

            // FIX: Only show variant selector for specific categories with multiple variants.
            const showVariantSelector = (product.category === 'Prawns' || product.category === 'Pickles') && product.variants && product.variants.length > 1;

            if (showVariantSelector) {
                weight.innerHTML = product.variants.map((v, index) => {
                    const isSelected = index === state.selectedVariantIndex;
                    // FIX: Display variant name intelligently to avoid duplication.
                    const variantDisplayName = (v.name && v.name !== product.name) ? `${v.name} (${v.net})` : v.net;
                    return `
                        <div class="variant-card ${isSelected ? 'active' : ''}" data-variant-index="${index}" role="radio" aria-checked="${isSelected}" tabindex="0">
                            <div class="variant-name">${variantDisplayName}</div>
                        </div>`;
                }).join('');
            } else if (product.variants && product.variants.length === 1) {
                // For single-variant products, just show the net weight without a selector.
                weight.innerHTML = `<div class="variant-card active"><div class="variant-name">${product.variants[0]?.net || ''}</div></div>`;
            } else {
                // Fallback if no variants exist
                weight.innerHTML = '';
            }

            UI.updatePopupPrice();

            const selectedVariant = product.variants[state.selectedVariantIndex];
            infoContent.innerHTML = `
                <p>${product.desc}</p>
                <p style="margin-top: 16px;"><strong>Gross Wt:</strong> ${selectedVariant?.gross || ''} | <strong>Net Wt:</strong> ${selectedVariant?.net || ''}<br><small>Net weight is after cleaning. Weight loss varies by product.</small></p>`;

            const optimizedPopupImage = UI.getOptimizedImageUrl(product.image, 600, 600);
            mainImage.src = optimizedPopupImage;
            mainImage.alt = `High-quality ${DOMPurify.sanitize(product.name)} from Coastal Fresh India`;

            document.getElementById('popupImageIndicators').style.display = 'none';

            // Reset accordion state
            document.querySelectorAll('.detail-item.active').forEach(item => {
                item.classList.remove('active');
                item.querySelector('.detail-content').style.maxHeight = '0';
                item.querySelector('.detail-content').style.padding = '0';
                const icon = item.querySelector('.detail-header i');
                if (icon) icon.style.transform = 'rotate(0deg)';
            });

            // Automatically open the "Product Details" accordion by default
            const productInfoItem = document.getElementById('productInfoDetailItem');
            if (productInfoItem) {
                const content = productInfoItem.querySelector('.detail-content');
                const icon = productInfoItem.querySelector('.detail-header i');

                productInfoItem.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
                content.style.padding = '0 0 16px 0';
                if (icon) icon.style.transform = 'rotate(180deg)';
            }

            UI.updatePopupCta();
            if (contentWrapper) contentWrapper.scrollTop = 0;

            // Defer non-critical tasks to run after the popup is visible
            const runDeferredTasks = () => {
                const productSlug = UI.generateProductSlug(product);
                const productUrl = `/product/${productSlug}`;
                const productTitle = `Buy Fresh ${product.name} Online in Hyderabad | Coastal Fresh India`;
                const productDesc = product.desc;
                const optimizedProductImage = UI.getOptimizedImageUrl(product.image, 1200, 630);

                UI.updateSEOTags({ title: productTitle, description: productDesc, canonicalPath: productUrl, imageUrl: optimizedProductImage });
                history.pushState({ page: 'product', productId: product.id }, productTitle, productUrl);

                // Inject JSON-LD schema
                const existingJsonLd = document.getElementById('product-breadcrumb-jsonld');
                if (existingJsonLd) existingJsonLd.remove();
                const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.coastalfresh.in/" }, { "@type": "ListItem", "position": 2, "name": "All Products", "item": "https://www.coastalfresh.in/catalog" }, { "@type": "ListItem", "position": 3, "name": product.name, "item": `https://www.coastalfresh.in${productUrl}` }] };
                const script = document.createElement('script');
                script.type = 'application/ld+json';
                script.id = 'product-breadcrumb-jsonld';
                script.textContent = JSON.stringify(breadcrumb);
                document.head.appendChild(script);
            };

            // Use requestIdleCallback for modern browsers, fallback to setTimeout
            if ('requestIdleCallback' in window) {
                requestIdleCallback(runDeferredTasks, { timeout: 500 });
            } else {
                setTimeout(runDeferredTasks, 100);
            }
        };

        populatePopup();
        state.isPopupOpen = true;
        UI.openModal(popup, backBtn);
        
        // Analytics can also be tracked after the initial render
        window.Analytics.trackEvent('view_item', {
            currency: 'INR',
            value: product.variants?.[0]?.finalPrice || 0,
            items: [{
                item_id: product.id,
                item_name: product.name,
                item_category: product.category,
                price: product.variants?.[0]?.finalPrice || 0
            }]
        });
    },

    updatePopupPrice: () => {
        const product = state.popupProduct;
        if (!product) return;

        const selectedVariant = product.variants[state.selectedVariantIndex];
        if (!selectedVariant) return;

        const priceSection = state.dom.popup.priceSection;

        if (selectedVariant.mrp > selectedVariant.finalPrice) {
            const savings = selectedVariant.mrp - selectedVariant.finalPrice;
            priceSection.innerHTML = `
                <span class="popup-price-final">₹${selectedVariant.finalPrice}</span>
                <span class="popup-price-mrp">₹${selectedVariant.mrp}</span>
                <span class="popup-price-savings-badge">SAVE ₹${savings}</span>
            `;
        } else {
            priceSection.innerHTML = `<span class="popup-price-final">₹${selectedVariant.finalPrice}</span>`;
        }
    },

    /**
     * NEW: Efficiently updates the product popup when a new variant is selected.
     * @param {number} newIndex - The index of the newly selected variant.
     */
    updatePopupSelection: (newIndex) => {
        if (!state.popupProduct || !state.popupProduct.variants[newIndex]) return;

        state.selectedVariantIndex = newIndex;

        // Update the active state on variant cards
        document.querySelectorAll('#popupProductWeight .variant-card').forEach((card, index) => {
            card.classList.toggle('active', index === newIndex);
            card.setAttribute('aria-checked', index === newIndex);
        });

        UI.updatePopupPrice();
        UI.updatePopupCta();
    },

    updatePopupCta: () => {
        const ctaContainer = document.getElementById('popupStickyCta');
        if (!state.popupProduct || !ctaContainer) return;

        const variantId = `${state.popupProduct.id}-${state.selectedVariantIndex}`;
        const qtyInCart = state.cart[variantId] || 0;
        const isInCart = qtyInCart > 0;

        if (isInCart) {
            ctaContainer.innerHTML = `
        <div class="popup-sticky-cta-inner">
          <div class="cart-controls" data-id="${variantId}" style="margin-left: auto;">
            <button class="qty-btn dec">-</button>
            <span class="qty">${qtyInCart}</span>
            <button class="qty-btn inc">+</button>
          </div>
        </div>`;
        } else {
            const selectedVariant = state.popupProduct.variants[state.selectedVariantIndex];
            ctaContainer.innerHTML = `
        <div class="popup-sticky-cta-inner">
          <span class="popup-cta-price">₹${selectedVariant.finalPrice}</span>
          <button class="popup-cta-add-btn">Add to Cart</button>
        </div>`;
        }
    },

    // NEW: Variant Drawer functions
    openVariantDrawer: (productId) => {
        const product = state.products.find(p => p.id === productId);
        if (!product || !product.variants) return;

        document.getElementById('variantDrawerTitle').textContent = `Select variant for ${product.name}`;
        const content = document.getElementById('variantDrawerContent');
        content.innerHTML = product.variants.map((variant, index) => {
            const variantId = `${product.id}-${index}`;
            const qtyInCart = state.cart[variantId] || 0; // Correctly get quantity for the specific variant
            return `
                <div class="variant-option" data-id="${variantId}">
                    <div class="variant-info">
                        <strong>${variant.name}</strong> (${variant.net}) - ₹${variant.finalPrice}
                    </div>
                    <div class="variant-cta">
                    ${qtyInCart > 0 ?
                        `<div class="cart-controls" data-id="${variantId}"><button class="qty-btn dec">-</button><span class="qty">${qtyInCart}</span><button class="qty-btn inc">+</button></div>` :
                        `<button class="add-btn" data-id="${variantId}">ADD</button>`
                    }
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('variantDrawerOverlay').classList.add('active');
        document.getElementById('variantDrawer').classList.add('active');
    },

    closeVariantDrawer: () => {
        document.getElementById('variantDrawerOverlay').classList.remove('active');
        document.getElementById('variantDrawer').classList.remove('active');
    },

    toggleProductDescription: () => {
        const container = document.getElementById('popupDescriptionContainer');
        const shortDiv = container.querySelector('.popup-description-short');
        const toggle = container.querySelector('.popup-description-toggle');

        state.popupDescriptionExpanded = !state.popupDescriptionExpanded;

        if (state.popupDescriptionExpanded) {
            shortDiv.style.webkitLineClamp = 'unset';
            toggle.textContent = 'Read Less';
        } else {
            shortDiv.style.webkitLineClamp = '2';
            toggle.textContent = 'Read More';
        }
    },

    closePopup: () => {
        const popup = document.getElementById('productPopup');
        if (!popup || !state.isPopupOpen) return; // FIX: Check isPopupOpen to prevent errors on rapid clicks

        UI.closeModal(popup);
        state.isPopupOpen = false;
        // UI.updateProductCardState(state.popupProduct.id); // This is now more complex, handled differently
        state.popupProduct = null;

        const underlyingPage = state.pageHistory[state.pageHistory.length - 1] || 'home';
        let pageInfo = { path: '/', title: 'Coastal Fresh India' };
        if (underlyingPage === 'catalog') {
            pageInfo = { path: '/catalog', title: 'All Products | Coastal Fresh India' };
        } else if (underlyingPage === 'faqPage') {
            pageInfo = { path: '/faq', title: 'FAQs | Coastal Fresh India' };
        }
        history.pushState({ page: underlyingPage }, pageInfo.title, pageInfo.path);

        UI.showPage(underlyingPage, true);
    },

    updateCartUI: () => {
        // This function is a central point for all cart UI updates.
        UI.updateCartBadges();
        // If the cart is currently open, re-render its contents.
        if (document.getElementById('cartModal')?.classList.contains('active')) UI.showCart();
    },

    updateCartBadges: () => {
        const totalQty = Object.values(state.cart).reduce((sum, qty) => {
            const numQty = Number(qty);
            return sum + (isNaN(numQty) ? 0 : numQty);
        }, 0);

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
    },

    updateProductCardState: (productId) => { // FIX: Now takes productId
        const productCards = document.querySelectorAll(`.product[data-id="${productId}"]`);
        if (productCards.length === 0) return;
    
        const product = state.products.find(p => p.id === parseInt(productId, 10));
        if (!product) return;

        // FIX: Correctly determine if any variant of this product is in the cart.
        const variantsInCart = Object.keys(state.cart).filter(key => key.startsWith(`${productId}-`));

        productCards.forEach(card => {
            // FIX: The CTA button or out-of-stock badge is directly inside the .product-image container.
            const imageContainer = card.querySelector('.product-image');
            if (!imageContainer) return;
    
            let newControlHTML = '';
            const sanitizedName = product.name;

            if (product.variants && product.variants.length > 1) {
                newControlHTML = `<button class="add-btn variant-btn" data-id="${product.id}" aria-label="Choose options for ${sanitizedName}">OPTIONS</button>`;
            } else if (product.variants && product.variants.length === 1) {
                const variantId = `${product.id}-0`;
                const isInCartQty = state.cart[variantId] || 0;
                newControlHTML = isInCartQty > 0
                    ? `<div class="cart-controls" data-id="${variantId}"><button class="qty-btn dec" aria-label="Decrease quantity">&ndash;</button><span class="qty" aria-live="polite">${isInCartQty}</span><button class="qty-btn inc" aria-label="Increase quantity">+</button></div>`
                    : `<button class="add-btn add-pill" data-id="${variantId}" aria-label="Add ${sanitizedName} to cart"><i class="fas fa-plus"></i> ADD</button>`;
            }

            // FIX #7: Instead of replacing the whole container, just replace the control itself.
            const oldControls = imageContainer.querySelector('.add-btn, .cart-controls, .out-of-stock-badge');
            if (oldControls) oldControls.remove();

            // Add the new controls (or the out-of-stock badge).
            imageContainer.insertAdjacentHTML('beforeend', !product.available ? `<div class="out-of-stock-badge">Out of Stock</div>` : newControlHTML);
        });
    },

    showCart: () => {
        state.couponError = null;
        const cartItemsEl = document.getElementById('cartItems');
        const emptyCartEl = document.getElementById('emptyCart');
        const cartFooterEl = document.getElementById('cartFooter');
        const emptyCartFooterEl = document.getElementById('emptyCartFooter');
        const cartSummaryContainerEl = document.getElementById('cartSummaryContainer');
        const items = Object.entries(state.cart).map(([variantId, qty]) => {
            const [productId, variantIndex] = variantId.split('-').map(Number);
            const product = state.products.find(p => p.id === productId);
            if (!product || !product.variants[variantIndex]) return null;
            const variant = product.variants[variantIndex];
            return {
                ...product, // base product info
                ...variant, // variant specific info (price, name, etc.)
                variantId: variantId,
                qty: qty
            };
        }).filter(Boolean);

        if (items.length === 0) {
            emptyCartEl.style.display = 'flex';
            cartItemsEl.innerHTML = '';
            if (cartFooterEl) cartFooterEl.style.display = 'none';
            if (emptyCartFooterEl) emptyCartFooterEl.style.display = 'flex'; // NEW
            if (cartSummaryContainerEl) cartSummaryContainerEl.style.display = 'none';

            // NEW: Attach event listener to the new sticky button
            const emptyCartBtn = document.getElementById('emptyCartBrowseBtn');
            if (emptyCartBtn) {
                // Use a one-time listener to avoid duplicates
                emptyCartBtn.onclick = () => { UI.showPage('catalog'); UI.closeCart(); };
            }
        } else {
            emptyCartEl.style.display = 'none';
            if (cartFooterEl) cartFooterEl.style.display = 'flex';
            if (emptyCartFooterEl) emptyCartFooterEl.style.display = 'none'; // NEW
            if (cartSummaryContainerEl) cartSummaryContainerEl.style.display = 'block';

            cartItemsEl.innerHTML = items.map(item => {
                // FIX: Define hasOffer inside the map scope to prevent ReferenceError.
                const hasOffer = item.mrp > item.finalPrice; 
                const { baseUrl: optimizedCartImage } = UI.getOptimizedImageUrl(item.image, 128, 128) || {};

                return `
          <article class="cart-item-card" data-id="${item.variantId}">
            <img src="${optimizedCartImage}" alt="${item.name}" class="cart-item-thumb">
            <div class="cart-item-meta">
              <div class="cart-item-name">
                ${item.name}
                {/* FIX #4: Correctly check if variant name is different from product name. */}
                ${(item.variantName && item.variantName !== item.name) ? ` (${item.variantName})` : ''}
              </div>
              <div class="cart-item-sub">${item.net} net</div>
              <div class="cart-item-price">
                ₹${item.finalPrice}
                ${hasOffer ? `<span class="cart-item-mrp">₹${item.mrp}</span>` : ''}
              </div>
            </div>
            <div class="cart-item-qty qty-controls" data-id="${item.variantId}">
              <button class="qty-btn cart-qty-btn dec" aria-label="decrease quantity">−</button>
              <div class="count cart-qty" aria-live="polite">${item.qty}</div>
              <button class="qty-btn cart-qty-btn inc" aria-label="increase quantity">+</button>
            </div>
          </article>
        `;
            }).join('');

            UI.updateCartSummary();
            UI.renderCouponSection();
        }

        const cartModal = document.getElementById('cartModal');
        UI.openModal(cartModal, cartModal.querySelector('.back-btn'));

        const subtotal = items.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0); // This was a bug, now fixed
        window.Analytics.trackEvent('view_cart', {
            currency: 'INR',
            value: subtotal,
            items: items.map(item => ({
                item_id: item.variantId, // Use variantId for tracking
                item_name: item.name,
                item_category: item.category,
                price: item.finalPrice,
                quantity: item.qty
            }))
        });
    },

    renderCouponSection: () => {
        const container = document.getElementById('cartCouponSection');
        if (!container) return;

        if (state.appliedCoupon) {
            container.innerHTML = `
        <div class="cart-coupon-applied-card">
          <div class="cart-coupon-applied-info">
            <i class="fas fa-check-circle"></i>
            <div>
              <strong>'${state.appliedCoupon.code}' applied</strong>
              <small>${config.COUPONS[state.appliedCoupon.code].description}</small>
            </div>
          </div>
          <button id="removeCouponBtn" class="cart-coupon-remove-btn" aria-label="Remove Coupon">&times;</button>
        </div>
      `;
        } else {
            container.innerHTML = `
        <div class="cart-coupon-wrap">
          <div class="cart-coupon">
            <span style="margin-right:8px;opacity:0.7">🏷️</span>
            <input id="couponInput" placeholder="Enter coupon code" aria-label="coupon code">
          </div>
          <button class="cart-coupon-apply-btn" id="applyCouponBtn">Apply</button>
        </div>
        ${state.couponError ? `<p class="cart-coupon-error">${state.couponError}</p>` : ''}
      `;
        }
    },

    updateCartSummary: () => {
        // FIX: Define cartItems within this function's scope to prevent ReferenceError.
        // This was the root cause of the application failing to start.
        const cartItems = Object.entries(state.cart).map(([variantId, qty]) => {
            const [productId, variantIndex] = variantId.split('-').map(Number);
            const product = state.products.find(p => p.id === productId);
            if (!product || !product.variants[variantIndex]) return null;
            const variant = product.variants[variantIndex];
            return {
                ...product,
                ...variant,
                variantId: variantId,
                qty: qty
            };
        }).filter(Boolean); // This was a bug, now fixed
        const itemTotalEl = document.getElementById('cartItemTotal');
        const deliveryFeeEl = document.getElementById('cartDeliveryFee');
        const toPayEl = document.getElementById('cartToPay');
        const placeOrderBtn = document.getElementById('cartPlaceOrderBtn');
        const savedMsgEl = document.getElementById('cartSavedMsg');
        const discountRowEl = document.getElementById('cartDiscountRow');
        const discountEl = document.getElementById('cartDiscount');
        const progressTextEl = document.getElementById('cartProgressText');
        const progressBarEl = document.getElementById('cartProgressBar');
        const paymentOptionsEl = document.getElementById('paymentOptions');

        if (cartItems.length === 0) {
            const emptyCartEl = document.getElementById('emptyCart');
            const cartFooterEl = document.getElementById('cartFooter');
            const couponSectionEl = document.getElementById('cartCouponSection');
            const cartSummaryContainerEl = document.getElementById('cartSummaryContainer');

            if (emptyCartEl) emptyCartEl.style.display = 'flex';
            if (cartFooterEl) cartFooterEl.style.display = 'none';
            if (cartSummaryContainerEl) cartSummaryContainerEl.style.display = 'none';
            if (couponSectionEl) couponSectionEl.innerHTML = '';

            state.appliedCoupon = null;
            state.couponError = null;
            return;
        }

        const subtotal = cartItems.reduce((sum, item) => sum + (item.finalPrice * item.qty), 0);
        const originalTotal = cartItems.reduce((sum, item) => sum + ((item.mrp || item.finalPrice) * item.qty), 0);
        const productSavings = originalTotal - subtotal;

        let couponDiscount = 0;
        if (state.appliedCoupon) {
            if (state.appliedCoupon.type === 'percent') {
                couponDiscount = (subtotal * state.appliedCoupon.value) / 100;
            } else if (state.appliedCoupon.type === 'fixed') {
                couponDiscount = state.appliedCoupon.value;
            }
            couponDiscount = Math.min(couponDiscount, subtotal);
        }

        // Delivery is now always free.
        const deliveryFee = 0; 
        const total = subtotal - couponDiscount + deliveryFee;
        if (itemTotalEl) itemTotalEl.textContent = `₹${subtotal}`;
        // FIX: Update the delivery fee and total pay amount in the UI
        if (deliveryFeeEl) deliveryFeeEl.textContent = deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`;
        if (toPayEl) toPayEl.textContent = `₹${Math.round(total)}`;

        if (placeOrderBtn) placeOrderBtn.textContent = `Place Order – Pay ₹${Math.round(total)}`;

        if (discountRowEl && discountEl) {
            if (couponDiscount > 0) {
                discountRowEl.style.display = 'flex';
                discountEl.textContent = `- ₹${Math.round(couponDiscount)}`;
            } else {
                discountRowEl.style.display = 'none';
            }
        }

        if (savedMsgEl) {
            const totalSavings = productSavings + couponDiscount + (deliveryFee === 0 ? 100 : 0);
            if (totalSavings > 0) {
                savedMsgEl.style.display = 'block';
                savedMsgEl.textContent = `You saved ₹${Math.round(totalSavings)} on this order 🎉`;
            } else {
                savedMsgEl.style.display = 'none';
            }
        }

        const amountNeeded = config.FREE_DELIVERY_THRESHOLD - (subtotal - couponDiscount);
        if (progressTextEl && progressBarEl) {
            if (amountNeeded > 0) {
                const progressPercent = ((subtotal - couponDiscount) / config.FREE_DELIVERY_THRESHOLD) * 100;
                progressTextEl.innerHTML = `Add <strong>₹${Math.round(amountNeeded)}</strong> more for FREE Delivery!`;
                progressBarEl.style.width = `${Math.min(100, progressPercent)}%`;
            } else {
                progressTextEl.innerHTML = `🎉 Yay! You've unlocked FREE Delivery!`;
                progressBarEl.style.width = '100%';
            }
        }

        UI.renderCouponSection();
        UI.renderPaymentOptions();
    },

    renderPaymentOptions: () => {
        const container = document.getElementById('paymentOptions');
        if (!container) return;

        container.innerHTML = `
      <label class="cart-pay-item payment-btn ${state.selectedPaymentMethod === 'cod' ? 'active' : ''}" data-method="cod">
        <input type="radio" name="pay" value="cod" ${state.selectedPaymentMethod === 'cod' ? 'checked' : ''}>
        <div>
          <div class="cart-pay-label">💵 Cash on Delivery</div>
          <div class="cart-pay-sub">Pay with cash at delivery</div>
        </div>
      </label>
      <label class="cart-pay-item payment-btn ${state.selectedPaymentMethod === 'online' ? 'active' : ''}" data-method="online">
        <input type="radio" name="pay" value="online" ${state.selectedPaymentMethod === 'online' ? 'checked' : ''}>
        <div>
          <div class="cart-pay-label">💳 UPI / Card</div>
          <div class="cart-pay-sub">Fast, secure online payment (Coming Soon)</div>
        </div>
      </label>
    `;
    },

    closeCart: () => {
        const cartModal = document.getElementById('cartModal');
        UI.closeModal(cartModal);
    },

    showOrderSuccessModal: (orderId) => {
        const modal = document.getElementById('orderSuccessModal');
        const messageEl = document.getElementById('orderSuccessMessage');

        messageEl.innerHTML = `Your Order ID is <strong>${orderId}</strong>. You can track its status in "My Orders".`;

        UI.openModal(modal, document.getElementById('trackOrderBtn'));
    },

    closeOrderSuccessModal: () => {
        UI.closeModal(document.getElementById('orderSuccessModal'));
        UI.showPage('home');
    },

    showPage: (page, fromHistory = false) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(page).classList.add('active');

        if (!fromHistory && page !== 'cart' && page !== state.pageHistory[state.pageHistory.length - 1]) {
            state.pageHistory.push(page);
        }

        let pageTitle, pageDesc, pagePath;
        if (page === 'catalog') {
            if (state.afterAddressAction) {
                state.afterAddressAction = null;
                console.log('Cleared pending address action due to navigation.');
            }
            pageTitle = 'All Products - Fish, Prawns, Crabs & More | Coastal Fresh India';
            pageDesc = 'Browse our entire collection of fresh seafood, including Pomfret, Prawns, Crabs, and authentic Andhra pickles. Order online for next-day delivery in Hyderabad.';
            pagePath = '/catalog';
        } else if (page === 'faqPage') {
            pageTitle = 'Frequently Asked Questions | Coastal Fresh India';
            pageDesc = 'Find answers to common questions about our delivery, sourcing, freshness, and payment for fresh seafood in Hyderabad.';
            pagePath = '/faq';
        } else if (page === 'referPage') {
            pageTitle = 'Refer a Friend & Earn Rewards | Coastal Fresh India';
            pageDesc = 'Share Coastal Fresh with your friends! They get 10% off their first order, and you get a 10% discount on your next purchase. Start sharing and earning today.';
            pagePath = '/refer';
        } else if (page === 'ordersPage') {
            UI.renderOrdersPage(); // This was a bug, now fixed
        } else if (page === 'profilePage' || page === 'addressPage' || page === 'ordersPage') {
            pageTitle = 'Your Account | Coastal Fresh India';
            pageDesc = 'Manage your orders, addresses, and profile settings at Coastal Fresh India.';
            pagePath = '/profile';
        } else {
            pageTitle = null; pageDesc = null; pagePath = '/';
        }
        UI.updateSEOTags({ title: pageTitle, description: pageDesc, canonicalPath: pagePath });

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-page='${page}']`);
        if (navItem) navItem.classList.add('active');

        state.currentPage = page;
        window.scrollTo(0, 0);

        const ticker = document.querySelector('.ticker-container');
        const headers = document.querySelectorAll('.header');
        if (page === 'home' || page === 'catalog') {
            if (ticker) ticker.style.display = 'block';
            headers.forEach(h => h.style.top = '30px');
        } else {
            if (ticker) ticker.style.display = 'none';
            headers.forEach(h => h.style.top = '0px');
        }

        if (page === 'catalog') {
            UI.startTypewriter();
        } else {
            UI.stopTypewriter();
        }
    },

    startTypewriter: () => {
        if (state.typewriterTimer) clearTimeout(state.typewriterTimer);

        const base = 'Search — ';
        const names = ['Prawns', 'Rohu', 'Sea Bass', 'Crab', 'Pickle'];
        let i = 0, pos = 0, dir = 1, pause = 0;

        const inputs = [document.getElementById('catalogSearch')].filter(Boolean);

        function tick() {
            const shouldAnimate = inputs.every(input => document.activeElement !== input && !input.value);
            if (!shouldAnimate) return;

            if (pause > 0) {
                pause--;
            } else {
                const full = names[i];
                const text = full.slice(0, pos);
                inputs.forEach(input => input.setAttribute('placeholder', base + text));

                pos += dir;
                if (pos > full.length) {
                    pause = 15; dir = -1;
                }
                if (pos < 0) {
                    dir = 1; i = (i + 1) % names.length; pos = 0;
                }
            }
            state.typewriterTimer = setTimeout(tick, dir === 1 ? 120 : 80);
        }
        tick();
    },

    stopTypewriter: () => {
        if (state.typewriterTimer) clearTimeout(state.typewriterTimer);
        const input = document.getElementById('catalogSearch');
        if (input) input.setAttribute('placeholder', 'Search products...');
    },

    showInitialSkeletons: () => {
        const featuredContainer = document.getElementById('featuredProducts');
        if (featuredContainer) {
            let skeletonHTML = '';
            for (let i = 0; i < config.FEATURED_PRODUCT_IDS.length; i++) {
                skeletonHTML += UI.createSkeletonProductHTML();
            }
            featuredContainer.innerHTML = skeletonHTML;
        }

        const catalogContainer = document.getElementById('catalogProducts');
        if (catalogContainer) {
            let skeletonHTML = '';
            for (let i = 0; i < config.ITEMS_PER_PAGE; i++) {
                skeletonHTML += UI.createSkeletonProductHTML();
            }
            catalogContainer.innerHTML = skeletonHTML;
        }
    },

    showSimpleTooltip: (targetElement) => {
        const tooltip = document.getElementById('simpleTooltip');
        const text = targetElement.getAttribute('title');
        if (!tooltip || !text) return;

        UI.hideSimpleTooltip();

        tooltip.textContent = text;
        tooltip.classList.add('show');

        const targetRect = targetElement.getBoundingClientRect();

        const top = targetRect.top - 8;
        const left = targetRect.left + (targetRect.width / 2);

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        setTimeout(UI.hideSimpleTooltip, 3000);
    },

    hideSimpleTooltip: () => {
        const tooltip = document.getElementById('simpleTooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    },

    initCarousel: (selector) => {
        const carouselContainer = document.querySelector(selector);
        if (!carouselContainer) return;

        const slidesContainer = carouselContainer.querySelector('.slides');
        const slides = Array.from(slidesContainer.children);
        const dotsContainer = carouselContainer.querySelector('.carousel-dots');
        const total = slides.length;

        if (!slidesContainer || total <= 1) {
            if (dotsContainer) dotsContainer.style.display = 'none';
            return;
        }

        // Use a property on the element itself to store the timer, avoiding global state issues.
        if (carouselContainer.carouselTimer) clearInterval(carouselContainer.carouselTimer);
        if (carouselContainer.restartTimer) clearTimeout(carouselContainer.restartTimer);

        if (dotsContainer) {
            dotsContainer.innerHTML = Array.from(
                { length: total },
                (_, i) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`
            ).join('');
        }

        const dots = dotsContainer ? Array.from(dotsContainer.children) : [];

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = slides.indexOf(entry.target);
                    if (dotsContainer) {
                        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
                    }
                }
            });
        }, { root: carouselContainer, threshold: 0.5 });

        slides.forEach(slide => observer.observe(slide));

        function advanceSlide() {
            let currentScroll = carouselContainer.scrollLeft;
            let slideWidth = carouselContainer.clientWidth;
            let nextScroll = currentScroll + slideWidth;

            if (nextScroll >= carouselContainer.scrollWidth - 1) { // -1 for precision
                carouselContainer.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                carouselContainer.scrollBy({ left: slideWidth, behavior: 'smooth' });
            }
        }

        function startTimer() {
            if (carouselContainer.carouselTimer) clearInterval(carouselContainer.carouselTimer);
            carouselContainer.carouselTimer = setInterval(advanceSlide, 5000);
        }
        function stopTimer() {
            clearInterval(carouselContainer.carouselTimer);
            // If the user interacts, clear any pending restart and set a new one
            clearTimeout(carouselContainer.restartTimer);
            carouselContainer.restartTimer = setTimeout(startTimer, 8000); // Restart after 8 seconds of inactivity
        }

        carouselContainer.addEventListener('pointerdown', stopTimer);
        // Use a debounced scroll handler to avoid stopping the timer on every tiny scroll event
        let scrollTimeout;
        carouselContainer.addEventListener('scroll', () => { clearTimeout(scrollTimeout); scrollTimeout = setTimeout(stopTimer, 150); }, { passive: true });
        document.addEventListener('visibilitychange', () => {
            document.hidden ? stopTimer() : startTimer();
        });

        startTimer();
    },

    initFlashSaleTimer: () => {
        if (!config.ENABLE_FLASH_SALE) return;

        const timerContainer = document.getElementById('flashSaleTimer');
        if (!timerContainer) return;

        let endTime = localStorage.getItem('flashSaleEndTime');

        if (!endTime || new Date().getTime() > endTime) {
            endTime = new Date().getTime() + config.FLASH_SALE_DURATION_HOURS * 60 * 60 * 1000;
            localStorage.setItem('flashSaleEndTime', endTime);
        }

        const hoursEl = document.getElementById('timer-h');
        const minutesEl = document.getElementById('timer-m');
        const secondsEl = document.getElementById('timer-s');

        function updateTimer() {
            const now = new Date().getTime();
            const distance = endTime - now;

            if (distance < 0) {
                clearInterval(state.flashSaleTimerInterval);
                timerContainer.innerHTML = '<div class="timer-ended">Sale Ended!</div>';
                return;
            }

            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            hoursEl.textContent = String(hours).padStart(2, '0');
            minutesEl.textContent = String(minutes).padStart(2, '0');
            secondsEl.textContent = String(seconds).padStart(2, '0');
        }

        if (state.flashSaleTimerInterval) clearInterval(state.flashSaleTimerInterval);
        updateTimer();
        state.flashSaleTimerInterval = setInterval(updateTimer, 1000);
    },

    toggleFAQ: (button) => {
        const faq = button.closest('.faq');
        if (!faq) return;

        const isActive = faq.classList.contains('active');
        document.querySelectorAll('.faq.active').forEach(item => {
            if (item !== faq) item.classList.remove('active');
        });

        faq.classList.toggle('active', !isActive);

        const chevron = button.querySelector('.fa-chevron-down');
        if (chevron) {
            chevron.style.transform = faq.classList.contains('active') ? 'rotate(180deg)' : 'rotate(0)';
        }

        if (faq.classList.contains('active')) {
            const qTextEl = button.querySelector('.q-text');
            const qText = qTextEl ? qTextEl.textContent : '';
            window.Analytics.trackEvent('faq_click', { question: qText });
        }
    },

    showLoginModal: (e, view = 'signup') => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const loginModal = document.getElementById('loginModal');

        if (view === 'login') {
            document.getElementById('authTitle').textContent = 'Welcome Back';
            document.getElementById('authSubtitle').textContent = 'Login to access your account';
            document.getElementById('signupForm').classList.remove('active');
            document.getElementById('loginForm').classList.add('active');
            UI.openModal(loginModal, loginModal.querySelector('#loginEmail'));
        } else {
            document.getElementById('authTitle').textContent = 'Get Started';
            document.getElementById('authSubtitle').textContent = 'Sign up to order the freshest coastal seafood';
            document.getElementById('loginForm').classList.remove('active');
            document.getElementById('signupForm').classList.add('active');
            UI.openModal(loginModal, loginModal.querySelector('#signupEmail'));
        }
        document.getElementById('authError').textContent = '';
    },

    closeLoginModal: () => {
        const loginModal = document.getElementById('loginModal');
        UI.closeModal(loginModal);
    },

    showAddressForm: () => {
        state.editingAddressId = null;
        document.getElementById('addressForm').reset();
        document.getElementById('addressCity').value = 'Hyderabad';
        if (state.currentUser.displayName) {
            document.getElementById('addressFullName').value = state.currentUser.displayName;
        }
        document.getElementById('addressListContainer').style.display = 'none';
        document.getElementById('addressFormContainer').style.display = 'block';
        document.querySelector('#addressForm .cta').textContent = 'Save Address';
    },

    showAddressList: () => {
        document.getElementById('addressListContainer').style.display = 'block';
        document.getElementById('addressFormContainer').style.display = 'none';
    },

    renderAddressList: async () => {
        if (!state.currentUser) return;

        const listContainer = document.getElementById('addressListContainer');
        const addNewAddressBtnFixed = document.getElementById('addNewAddressBtnFixed');
        listContainer.innerHTML = '<div class="loading" style="margin: 40px auto;"></div>';
        addNewAddressBtnFixed.style.display = 'none';

        try {
            const addressesRef = state.db.collection('users').doc(state.currentUser.uid).collection('addresses');
            const snapshot = await addressesRef.orderBy('updatedAt', 'desc').get();

            if (snapshot.empty) {
                listContainer.innerHTML = `
          <div class="empty-state-address">
            <i class="fas fa-map-marker-alt"></i> 
            <h3>No Saved Addresses</h3>
            <p>Add an address for faster checkout.</p>
            <button class="empty-cart-btn" id="addFirstAddressBtn">+ Add New Address</button>
          </div> 
        `;
                const addBtn = listContainer.querySelector('#addFirstAddressBtn');
                if (addBtn) {
                    addBtn.addEventListener('click', UI.showAddressForm);
                }
            } else {
                let addressesHTML = snapshot.docs.map(doc => {
                    const address = doc.data();
                    return `
            <div class="address-item ${address.isDefault ? 'default' : ''}" data-id="${doc.id}" role="listitem">
              <div class="address-main-content">
                <i class="fas fa-map-marker-alt address-pin-icon"></i>
                <div class="address-text-content">
                  <div class="address-name-line"> 
                    <span class="address-name">${address.fullName}</span>
                    ${address.isDefault ? '<span class="default-badge" aria-label="Default Address">Default</span>' : ''}
                  </div>
                  <p class="address-full-text">${address.house}, ${address.street}<br>${address.city}, ${address.pincode}</p>
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
                addNewAddressBtnFixed.style.display = 'flex';
                UI.showAddressList();
            }
        } catch (error) {
            console.error("Error rendering addresses:", error);
            listContainer.innerHTML = '<p style="color: var(--error-color); text-align: center;">Could not load addresses.</p>';
        }
    },

    renderOrdersPage: async () => {
        const ordersPage = document.getElementById('ordersPage');
        const mainContent = ordersPage.querySelector('main');

        if (!state.currentUser) {
            mainContent.innerHTML = `
                <div class="logged-out-prompt">
                    <div class="illustration">
                        <svg width="140" height="140" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Illustration of a locked document">
                            <g fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M65 170H45c-8.284 0-15-6.716-15-15V45c0-8.284 6.716-15 15-15h80c8.284 0 15 6.716 15 15v40" stroke="var(--primary-color)" stroke-width="8"/>
                                <path d="M50 60h80M50 85h50" stroke="var(--primary-color)" stroke-width="6" opacity="0.5"/>
                                <rect x="110" y="110" width="80" height="60" rx="10" fill="var(--primary-light)" stroke="var(--primary-color)" stroke-width="8"/>
                                <circle cx="150" cy="145" r="8" fill="var(--primary-dark)"/>
                                <path d="M135 110v-10c0-8.284 6.716-15 15-15s15 6.716 15 15v10" stroke="var(--primary-color)" stroke-width="8"/>
                            </g>
                        </svg>
                    </div>
                    <h2 class="logged-out-title">Login to view orders</h2>
                    <p class="logged-out-lead">Sign in to see your order history, track deliveries and reorder favourites.</p>
                    <div class="logged-out-actions">
                        <button class="primary-cta" id="loginFromOrdersBtn">Login / Sign Up</button>
                        <button class="secondary-action" id="continueAsGuestBtn">Continue as guest</button>
                    </div>
                </div>
            `;
            mainContent.querySelector('#loginFromOrdersBtn').addEventListener('click', () => UI.showLoginModal(null, 'signup'));
            document.getElementById('continueAsGuestBtn').addEventListener('click', () => UI.showPage('catalog'));
            return;
        }

        mainContent.innerHTML = '<div class="loading" style="margin: 40px auto;"></div>';

        try {
            const ordersSnapshot = await state.db.collection('orders')
                .where('userId', '==', state.currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();

            if (ordersSnapshot.empty) {
                mainContent.innerHTML = `
          <div class="empty-cart" style="flex-grow: 1; min-height: 60vh;">
            <i class="fas fa-box-open" style="font-size: 64px; margin-bottom: 24px; color: var(--border-color);"></i>
            <h3>No Orders Yet</h3>
            <p>Your past and current orders will appear here.</p>
            <button class="empty-cart-btn" id="shopFromEmptyOrdersBtn">Start Shopping</button>
          </div>
        `;
                const shopBtn = mainContent.querySelector('#shopFromEmptyOrdersBtn');
                if (shopBtn) {
                    shopBtn.addEventListener('click', () => UI.showPage('home'));
                }
            } else {
                // Status mapping for better UX
                 const statusMap = {
                    'Pending': { text: 'Order Placed', class: 'inprogress', icon: 'fa-solid fa-check' },
                    'Accepted': { text: 'Preparing', class: 'inprogress', icon: 'fa-solid fa-utensils' },
                    'Out for Delivery': { text: 'In Transit', class: 'transit', icon: 'fa-solid fa-truck-fast' },
                    'Completed': { text: 'Delivered', class: 'completed', icon: 'fa-solid fa-house-chimney-user' },
                    'Cancelled': { text: 'Cancelled', class: 'cancelled', icon: 'fa-solid fa-xmark' }
                };

                const ordersHTML = ordersSnapshot.docs.map(doc => {
                    const order = doc.data();
                    const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date();
                    const datePart = orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const timePart = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
                    const formattedDateTime = `${datePart} • ${timePart}`;
                    const displayStatus = statusMap[order.status] || { text: order.status, class: 'inprogress', icon: 'fa-solid fa-question-circle' };

                    let firstItem = { name: 'Order', image: '' };
                    let moreItemsText = '';
                    if (order.items && order.items.length > 0) {
                        firstItem = order.items[0];
                        if (order.items.length > 1) {
                            moreItemsText = `+ ${order.items.length - 1} more item(s)`;
                        } else if (firstItem.net) {
                            moreItemsText = `${firstItem.net} Net Wt`;
                        }
                    }
                    const thumbImg = UI.getOptimizedImageUrl(firstItem.image, 80, 80);

                    return `
                        <div class="order-card" data-order-id="${doc.id}">
                            <div class="order-card-top">
                                <div class="order-id-block">
                                    <div class="order-id">ID: #${order.orderId.slice(-6)}</div>
                                    <div class="order-meta">${formattedDateTime}</div>
                                </div>
                                <div class="order-price">₹${order.total}</div>
                            </div>
                            <div class="order-item-summary">
                                <div class="order-thumb">
                                    <img src="${thumbImg}" alt="${firstItem.name}" loading="lazy">
                                </div>
                                <div class="order-item-meta">
                                    <div class="order-item-title">${firstItem.name}</div>
                                    ${moreItemsText ? `<div class="order-item-sub">${moreItemsText}</div>` : ''}
                                </div>
                            </div>
                            <div class="order-card-bottom">
                                <div class="order-status ${displayStatus.class}"><i class="${displayStatus.icon}"></i> ${displayStatus.text}</div>
                                <!-- The entire card is clickable to track, so a button is not needed here -->
                            </div>
                        </div>
                    `;
                }).join('');
                mainContent.innerHTML = `<div class="order-list">${ordersHTML}</div>`;
            }
        } catch (error) {
            console.error("Error fetching orders:", error);
            mainContent.innerHTML = '<p style="color: var(--error-color); text-align: center;">Could not load your orders.</p>';
        }
    },

    openOrderDetailsDrawer: (order) => {
        const drawerOverlay = document.getElementById('orderDetailsDrawerOverlay');
        const drawer = document.getElementById('orderDetailsDrawer');
        if (!drawerOverlay || !drawer) return;

        try {
            document.getElementById('drawerOrderId').textContent = `#${order.orderId}`; // This was a bug, now fixed
            document.getElementById('drawerOrderDate').textContent = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
            document.getElementById('drawerPaymentMethod').textContent = order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod.toUpperCase();

            UI.renderDrawerStatus(order.status);
            UI.renderDrawerItems(order.items);
            UI.renderDrawerBillSummary(order); 
            UI.renderDrawerAddress(order.address);

            document.getElementById('drawerFooter').innerHTML = `
      <button class="drawer-action-btn" id="drawerCopyIdBtn">Copy ID</button>
      <button class="drawer-action-btn" id="drawerSupportBtn">Contact Support</button>
      <button class="drawer-action-btn primary" id="drawerReorderBtn">Reorder</button>
    `;

            document.getElementById('drawerCopyIdBtn').onclick = () => {
                navigator.clipboard.writeText(order.orderId).then(() => UI.showToast('Order ID copied!'));
            };
            document.getElementById('drawerSupportBtn').onclick = () => Handlers.openWhatsApp('support', order.orderId);
            document.getElementById('drawerReorderBtn').onclick = () => Handlers.addMultipleToCart(order.items);

            drawerOverlay.style.display = 'flex';
            setTimeout(() => drawerOverlay.classList.add('active'), 10);

            const closeBtn = drawer.querySelector('.drawer-close-btn');
            state.previouslyFocusedElement = document.activeElement;
            setTimeout(() => closeBtn.focus(), 300);

            const closeDrawerHandler = () => UI.closeOrderDetailsDrawer();
            closeBtn.onclick = closeDrawerHandler;
            drawerOverlay.onclick = (e) => { if (e.target === drawerOverlay) closeDrawerHandler(); };
            const escHandler = (e) => { if (e.key === 'Escape') closeDrawerHandler(); };
            document.addEventListener('keydown', escHandler);

            drawer.cleanup = () => {
                document.removeEventListener('keydown', escHandler);
            };
        } catch (error) {
            console.error("Error opening order details drawer:", error);
            UI.showToast("Could not display order details.", true);
            // Ensure the drawer doesn't get stuck open if an error occurs
            if (drawerOverlay.classList.contains('active')) UI.closeOrderDetailsDrawer();
        }
    },

    renderDrawerStatus: (currentStatus) => {
        const timelineContainer = document.getElementById('drawerStatusTimeline');
        const statuses = ['Pending', 'Accepted', 'Out for Delivery', 'Completed'];
        const statusMap = {
            'Pending': { text: 'Order Placed', icon: 'fa-check' },
            'Accepted': { text: 'Preparing', icon: 'fa-utensils' },
            'Out for Delivery': { text: 'In Transit', icon: 'fa-truck-fast' },
            'Completed': { text: 'Delivered', icon: 'fa-house-chimney-user' },
            'Cancelled': { text: 'Cancelled', icon: 'fa-xmark' }
        };

        let currentStatusIndex = statuses.indexOf(currentStatus);
        if (currentStatus === 'Cancelled') {
            timelineContainer.innerHTML = `
                <div class="status-step cancelled">
                    <div class="status-icon"><i class="fas fa-xmark"></i></div>
                    <div class="status-label">Order Cancelled</div>
                </div>
            `;
            return;
        }

        timelineContainer.innerHTML = statuses.map((status, index) => {
            const isActive = index <= currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            const statusInfo = statusMap[status];
            return `
                <div class="status-step ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}">
                    <div class="status-icon"><i class="fas ${statusInfo.icon}"></i></div>
                    <div class="status-label">${statusInfo.text}</div>
                </div>
                ${index < statuses.length - 1 ? '<div class="status-line ' + (isActive ? 'active' : '') + '"></div>' : ''}
            `;
        }).join('');
    },

    renderDrawerItems: (items) => {
        const container = document.getElementById('drawerItemsList');
        if (!container || !items) {
            container.innerHTML = '<p>No items found in this order.</p>';
            return;
        }
        container.innerHTML = items.map(item => {
            const itemImage = UI.getOptimizedImageUrl(item.image, 96, 96);
            return `
            <div class="drawer-item">
                <img src="${itemImage}" alt="${item.name}" class="drawer-item-thumb" loading="lazy">
                <div class="drawer-item-info">
                    <div class="drawer-item-name">${item.name}</div>
                    <div class="drawer-item-qty">Qty: ${item.qty}</div>
                </div>
                <div class="drawer-item-price">₹${item.price * item.qty}</div>
            </div>
        `;
        }).join('');
    },

    renderDrawerBillSummary: (order) => {
        const container = document.getElementById('drawerBillDetails');
        if (!container || !order) return;

        let billHTML = `<div class="drawer-bill-row"><span>Item Total</span><span>₹${order.subtotal.toFixed(2)}</span></div>`;

        if (order.coupon && order.coupon.discount > 0) {
            billHTML += `
                <div class="drawer-bill-row discount">
                    <span>Coupon Discount (${order.coupon.code})</span>
                    <span>- ₹${order.coupon.discount.toFixed(2)}</span>
                </div>`;
        }

        billHTML += `<div class="drawer-bill-row"><span>Delivery Fee</span><span>${order.deliveryFee > 0 ? `₹${order.deliveryFee.toFixed(2)}` : 'FREE'}</span></div>`;

        billHTML += `
            <div class="drawer-bill-row grand-total">
                <span>Grand Total</span>
                <span>₹${order.total.toFixed(2)}</span>
            </div>`;

        container.innerHTML = billHTML;
    },

    renderDrawerAddress: (address) => {
        const nameEl = document.getElementById('drawerAddressName');
        const fullAddressEl = document.getElementById('drawerAddressFull');

        if (!address || !nameEl || !fullAddressEl) {
            if (nameEl) nameEl.textContent = 'Address not available.';
            if (fullAddressEl) fullAddressEl.textContent = '';
            return;
        }

        nameEl.textContent = address.fullName;
        fullAddressEl.innerHTML = `
            ${address.house}, ${address.street}<br>
            ${address.city}, ${address.pincode}<br>
            Phone: ${address.mobile}`;
    },

    closeOrderDetailsDrawer: () => {
        const drawerOverlay = document.getElementById('orderDetailsDrawerOverlay');
        const drawer = document.getElementById('orderDetailsDrawer');
        if (!drawerOverlay || !drawer) return;

        if (typeof drawer.cleanup === 'function') {
            drawer.cleanup();
        }

        drawerOverlay.classList.remove('active');
        setTimeout(() => {
            drawerOverlay.style.display = 'none';
            if (state.previouslyFocusedElement) state.previouslyFocusedElement.focus();
        }, 300);
    },

    renderProductSchema: () => {
        if (!state.products || state.products.length === 0) return;

        const schemaContainer = document.createDocumentFragment();

        state.products.forEach(product => {
            const script = document.createElement('script');
            script.type = 'application/ld+json';

            const schema = {
                "@context": "https://schema.org/",
                "@type": "Product",
                "name": product.name,
                "image": UI.getOptimizedImageUrl(product.image, 1200, 630), // This was a bug, now fixed
                "description": product.desc,
                "sku": `CF-${product.id}`,
                "brand": { "@type": "Brand", "name": "Coastal Fresh" },
                "offers": {
                    "@type": "Offer",
                    "url": `https://www.coastalfresh.in/product/${UI.generateProductSlug(product)}`,
                    "priceCurrency": "INR",
                    "price": product.variants?.[0]?.finalPrice || product.finalPrice || 0,
                    "priceValidUntil": new Date(new Date().getFullYear() + 1, 11, 31).toISOString().split('T')[0],
                    "itemCondition": "https://schema.org/NewCondition",
                    "availability": product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
                }
            };

            // Dynamically add review and rating data if available
            const relevantReviews = config.CUSTOMER_REVIEWS.filter(r => r.review.toLowerCase().includes(product.name.split(' ')[0].toLowerCase()));
            if (relevantReviews.length > 0) {
                schema.review = relevantReviews.map(r => ({
                    "@type": "Review",
                    "author": { "@type": "Person", "name": r.name },
                    "reviewRating": { "@type": "Rating", "ratingValue": r.rating, "bestRating": "5" },
                    "reviewBody": r.review
                }));

                const avgRating = relevantReviews.reduce((sum, r) => sum + r.rating, 0) / relevantReviews.length;
                schema.aggregateRating = { "@type": "AggregateRating", "ratingValue": avgRating.toFixed(1), "reviewCount": relevantReviews.length };
            }

            script.textContent = JSON.stringify(schema);
            schemaContainer.appendChild(script);
        });
        document.head.appendChild(schemaContainer);
    },

    /**
     * Displays a toast message.
     * @param {string} text - The message to display.
     * @param {boolean} isError - If true, shows an error style.
     */
    showToast: (text, isError = false) => {
        const toast = document.getElementById('toast');
        const toastText = document.getElementById('toastText');
        if (!toast || !toastText) return;

        toastText.textContent = text;
        toast.className = 'toast'; // Reset classes
        toast.classList.add('show');
        if (isError) {
            toast.classList.add('error');
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    },

    openModal: (modalElement, elementToFocus) => {
        state.previouslyFocusedElement = document.activeElement;
        const appContainer = document.querySelector('.app');

        Array.from(appContainer.children).forEach(child => {
            if (child !== modalElement && !child.classList.contains('toast')) {
                child.setAttribute('aria-hidden', 'true');
            }
        });

        modalElement.classList.add('active');
        document.body.classList.add('popup-open');

        const focusableElements = modalElement.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        const focusTarget = elementToFocus || firstFocusable;
        if (focusTarget) {
            setTimeout(() => focusTarget.focus(), 100);
        }

        modalElement.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || !lastFocusable) return;

            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    lastFocusable.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    firstFocusable.focus();
                    e.preventDefault();
                }
            }
        });
    },

    closeModal: (modalElement) => {
        Array.from(document.querySelector('.app').children).forEach(child => {
            child.removeAttribute('aria-hidden');
        });

        modalElement.classList.remove('active');
        document.body.classList.remove('popup-open');
        if (state.previouslyFocusedElement) state.previouslyFocusedElement.focus();
    },

    showInstallPrompt: () => {
        const installPrompt = document.getElementById('installPrompt');
        if (!installPrompt) return;

        state.previouslyFocusedElement = document.activeElement;
        installPrompt.classList.add('show');

        window.Analytics.trackEvent('pwa_prompt_shown');

        const installBtn = document.getElementById('installBtn');
        if (installBtn) {
            setTimeout(() => installBtn.focus(), 100);
        }

        installPrompt.addEventListener('keydown', Handlers.trapFocusInInstallPrompt);
    },

    hideInstallPrompt: () => {
        const installPrompt = document.getElementById('installPrompt');
        if (!installPrompt) return;

        installPrompt.classList.remove('show');
        installPrompt.removeEventListener('keydown', Handlers.trapFocusInInstallPrompt);

        if (state.previouslyFocusedElement) {
            state.previouslyFocusedElement.focus();
        }

        const profileInstallBtn = document.getElementById('profileInstallBtn');
        if (profileInstallBtn && state.installPromptUsed) {
            profileInstallBtn.style.display = 'none';
        }
    },

    // Moved from handlers.js for better separation of concerns
    updateUIForAuthState: () => {
        const { userName, userStatus, logoutBtn, guestCta, referBtn, avatar } = state.dom.profile;

        if (state.currentUser) {
            if (state.currentUser.photoURL) {
                avatar.innerHTML = `<img src="${state.currentUser.photoURL}" alt="Profile Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatar.innerHTML = `<i class="fas fa-user"></i>`;
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

            userName.textContent = displayName;
            userStatus.textContent = state.currentUser.email;
            logoutBtn.style.display = 'flex';
            if (guestCta) guestCta.style.display = 'none';
            if (referBtn) referBtn.style.display = 'flex'; // FIX: Ensure button is shown for logged-in users
        } else {
            avatar.innerHTML = `<i class="fas fa-user"></i>`;
            userName.textContent = 'Guest User';
            userStatus.textContent = 'You are browsing as a guest.';
            logoutBtn.style.display = 'none';
            if (guestCta) guestCta.style.display = 'flex';
            if (referBtn) referBtn.style.display = 'none';
        }
    }
};

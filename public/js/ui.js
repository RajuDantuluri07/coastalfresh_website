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
      <button class="category ${index === 0 ? 'active' : ''}" data-category="${cat.key}" aria-label="Filter by ${cat.label}">
        ${cat.icon ? `<img src="${cat.icon}" alt="" class="category-icon" loading="lazy" aria-hidden="true">` : ''}
        <span>${cat.label}</span>
      </button>
    `).join('');
    },

    /**
     * NEW: A generic and reusable function to render a grid of products into a specified container.
     * @param {string} containerId - The ID of the container element.
     * @param {Array<object>} productsToRender - An array of product objects to display.
     * @param {object} [options={}] - Rendering options, e.g., { isFlashSale: true }.
     * @param {string} [emptyMessage=''] - HTML string to show if productsToRender is empty.
     */
    renderProductGrid: (containerId, productsToRender, options = {}, emptyMessage = '') => {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (productsToRender.length > 0) {
            container.innerHTML = productsToRender.map(p => UI.createProductHTML(p, options)).join('');
        } else {
            container.innerHTML = emptyMessage;
        }
    },

    renderFlashSale: () => {
        const section = document.getElementById('flashSaleSection');
        if (!config.ENABLE_FLASH_SALE) {
            if (section) section.style.display = 'none';
            return;
        }
    
        let skeletonHTML = '';
        for (let i = 0; i < config.FLASH_SALE_PRODUCT_IDS.length; i++) {
            skeletonHTML += UI.createSkeletonProductHTML();
        }
        UI.renderProductGrid('flashSaleProducts', [], {}, skeletonHTML);
    
        const flashSaleProducts = state.products.filter(p => config.FLASH_SALE_PRODUCT_IDS.includes(p.id));
        if (flashSaleProducts.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }
        UI.renderProductGrid('flashSaleProducts', flashSaleProducts, { isFlashSale: true });
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

    updateSEOTags: ({ title, ogTitle, description, canonicalPath, imageUrl }) => {
        const defaultTitle = 'Coastal Fresh India: Buy Fresh Fish & Seafood Online in Hyderabad';
        const defaultDesc = 'The best place to buy fresh fish and seafood online in Hyderabad, India! Coastal Fresh offers a wide variety of hygienically cleaned fish, prawns, crabs, and authentic Andhra pickles with next-day delivery. Order now for the freshest catch.';
        const defaultImage = 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757311267/Coastal_Fresh_-_Home_page_banner_eg5mbv.png';
        const baseUrl = 'https://www.coastalfresh.in';

        const finalOgTitle = ogTitle || title || defaultTitle;
        const finalTitle = title || defaultTitle;
        const finalDesc = description || defaultDesc;
        const finalCanonical = baseUrl + (canonicalPath || '/');
        const finalImage = imageUrl || defaultImage;

        document.title = finalTitle;

        const descTag = document.querySelector('meta[name="description"]');
        if (descTag) descTag.setAttribute('content', finalDesc);

        const canonicalTag = document.querySelector('link[rel="canonical"]');
        if (canonicalTag) canonicalTag.setAttribute('href', finalCanonical);

        document.querySelector('meta[property="og:title"]').setAttribute('content', finalOgTitle);
        document.querySelector('meta[property="og:description"]').setAttribute('content', finalDesc);
        document.querySelector('meta[property="og:url"]').setAttribute('content', finalCanonical);
        document.querySelector('meta[property="og:image"]').setAttribute('content', finalImage);
        document.querySelector('meta[name="twitter:title"]').setAttribute('content', finalOgTitle);
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
        UI.renderProductGrid('featuredProducts', featured);
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

        const emptyMessage = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #8E8E93;">No products found</div>';
        UI.renderProductGrid('catalogProducts', filtered, {}, emptyMessage);
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
            const isFavorite = state.favorites.has(product.id);
            const optimizedImage = UI.getOptimizedImageUrl(product.image, 300, 300);
            const sanitizedName = DOMPurify.sanitize(product.name);

            let ctaButton = '';
            let stockOverlay = '';

            if (product.available) {
                const variants = product.variants || [];
                const variantCount = variants.length;
                const isSpecialCategory = product.category === 'Prawns' || product.category === 'Pickles';
                const useSizesCta = variantCount >= 3 || (variantCount > 1 && isSpecialCategory);

                // Check if any variant of this product is in the cart
                const qtyInCart = Object.keys(state.cart)
                    .filter(key => key.startsWith(`${product.id}-`))
                    .reduce((sum, key) => sum + state.cart[key], 0);

                if (qtyInCart > 0 && variantCount === 1) {
                    // For single-variant products, show quantity controls if in cart
                    const variantId = `${product.id}-0`;
                    ctaButton = `<div class="cart-controls" data-id="${variantId}"><button class="qty-btn dec" aria-label="Decrease quantity">-</button><span class="qty">${qtyInCart}</span><button class="qty-btn inc" aria-label="Increase quantity">+</button></div>`;
                } else if (useSizesCta) {
                    // Show "{n} Sizes" CTA which opens the product popup
                    // MODIFICATION: Change CTA text to "SELECT" for a cleaner look on multi-variant products.
                    const ctaText = 'SELECT';
                    ctaButton = `<button class="add-btn variant-btn select-btn" data-id="${product.id}" aria-label="Select variant for ${sanitizedName}" aria-haspopup="dialog">${ctaText}</button>`;
                } else {
                    // Default "ADD" button for single variant or simple multi-variant products
                    const variantId = `${product.id}-0`;
                    const buttonActionId = variantCount > 1 ? product.id : variantId;
                    const buttonClass = variantCount > 1 ? 'add-btn variant-btn' : 'add-btn';
                    ctaButton = `<button class="${buttonClass}" data-id="${buttonActionId}" aria-label="Add ${sanitizedName} to cart">ADD</button>`;
                }
            } else {
                // NEW: Add a notify me button for unavailable products
                ctaButton = `<button class="notify-btn" data-id="${product.id}" aria-label="Notify me when back in stock"><i class="fas fa-bell"></i></button>`;
                stockOverlay = `<div class="out-of-stock-overlay">Out of Stock</div>`;
            }

            const priceOrStockHTML = product.available ? `
                <div class="price-row">
                    <span class="final-price">₹${primaryVariant.finalPrice || 'N/A'}</span>
                    ${hasOffer ? `<span class="old-price">₹${primaryVariant.mrp}</span>` : ''}
                </div>
                ${hasOffer && savings > 0 ? `<div class="save">SAVE ₹${savings}</div>` : ''}
            ` : `<div class="out-of-stock-text">Out of Stock</div>`;

            return `
        <div class="card product ${!product.available ? 'unavailable' : ''} ${options.isFlashSale ? 'flash-sale-item' : ''}" data-id="${product.id}" role="article" aria-label="Product: ${sanitizedName}">
          <div class="product-image">
            <img src="${optimizedImage}" alt="${sanitizedName}" loading="lazy">
            <button class="wish" data-id="${product.id}" aria-label="Add to wishlist" aria-pressed="${isFavorite}">${isFavorite ? '♥' : '♡'}</button>
             ${ctaButton}
             ${stockOverlay}
          </div>
          <div class="info">
            <p class="name">${sanitizedName}</p>
            ${priceOrStockHTML}
          </div>
        </div>
      `;
        } catch (error) {
            console.error(`Error rendering product card for product ID ${product?.id}:`, error);
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

        // Update favorite button state in popup
        const favoriteBtn = popup.querySelector('.popup-action-btn.favorite');
        const isFavorite = state.favorites.has(product.id);
        favoriteBtn.setAttribute('aria-pressed', isFavorite);
        favoriteBtn.innerHTML = `<i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i>`;
        favoriteBtn.style.color = isFavorite ? 'var(--pink)' : 'var(--primary-color)';

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

            UI.updatePopupCta();
            if (contentWrapper) contentWrapper.scrollTop = 0;

            // Defer non-critical tasks to run after the popup is visible
            const runDeferredTasks = () => {
                const productSlug = UI.generateProductSlug(product);
                const productUrl = `/product/${productSlug}`;
                const productTitle = `Buy Fresh ${product.name} Online in Hyderabad | Coastal Fresh`;
                const ogProductTitle = `Get Fresh ${product.name} Delivered to Your Doorstep! | Coastal Fresh`;
                const productDesc = product.desc;
                const optimizedProductImage = UI.getOptimizedImageUrl(product.image, 1200, 630);

                UI.updateSEOTags({ title: productTitle, ogTitle: ogProductTitle, description: productDesc, canonicalPath: productUrl, imageUrl: optimizedProductImage });
                history.pushState({ page: 'product', productId: product.id }, productTitle, productUrl);

                // --- SEO ENHANCEMENT: Inject rich, dynamic JSON-LD schema for the product and breadcrumbs ---
                document.getElementById('dynamic-product-schema')?.remove();
                document.getElementById('dynamic-breadcrumb-schema')?.remove();

                const schemaScript = document.createElement('script');
                schemaScript.type = 'application/ld+json';
                schemaScript.id = 'dynamic-product-schema';

                const breadcrumbScript = document.createElement('script');
                breadcrumbScript.type = 'application/ld+json';
                breadcrumbScript.id = 'dynamic-breadcrumb-schema';

                const productSchema = {
                    "@context": "https://schema.org/",
                    "@type": "Product",
                    "name": product.name,
                    "image": optimizedProductImage,
                    "description": product.desc,
                    "sku": `CF-${product.id}`,
                    "brand": { "@type": "Brand", "name": "Coastal Fresh" },
                    // Create an offer for each variant
                    "offers": product.variants.map((variant, index) => ({
                        "@type": "Offer",
                        "url": `https://www.coastalfresh.in${productUrl}`,
                        "priceCurrency": "INR",
                        "price": variant.finalPrice,
                        "sku": `CF-${product.id}-${index}`,
                        "itemCondition": "https://schema.org/NewCondition",
                        "availability": variant.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
                    }))
                };

                // Dynamically add review and rating data if available
                const relevantReviews = config.CUSTOMER_REVIEWS.filter(r => r.review.toLowerCase().includes(product.name.split(' ')[0].toLowerCase()));
                if (relevantReviews.length > 0) {
                    productSchema.review = relevantReviews.map(r => ({
                        "@type": "Review",
                        "author": { "@type": "Person", "name": r.name },
                        "reviewRating": { "@type": "Rating", "ratingValue": r.rating, "bestRating": "5" },
                        "reviewBody": r.review
                    }));

                    const avgRating = relevantReviews.reduce((sum, r) => sum + r.rating, 0) / relevantReviews.length;
                    productSchema.aggregateRating = { "@type": "AggregateRating", "ratingValue": avgRating.toFixed(1), "reviewCount": relevantReviews.length };
                }

                const breadcrumbSchema = {
                    "@context": "https://schema.org",
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.coastalfresh.in/" },
                        { "@type": "ListItem", "position": 2, "name": "Catalog", "item": "https://www.coastalfresh.in/catalog" },
                        { "@type": "ListItem", "position": 3, "name": product.name }
                    ]
                };

                schemaScript.textContent = JSON.stringify(productSchema);
                breadcrumbScript.textContent = JSON.stringify(breadcrumbSchema);

                document.head.appendChild(schemaScript);
                document.head.appendChild(breadcrumbScript);
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

        const totalQtyInCart = Object.values(state.cart).reduce((sum, qty) => sum + Number(qty), 0);

        if (isInCart) {
            ctaContainer.innerHTML = `
            <div class="popup-sticky-cta-inner">
              <div class="popup-cta-left">
                <button class="popup-cta-view-cart" id="popupViewCartBtn">
                  <i class="fas fa-shopping-bag"></i>
                  <span>View Cart</span>
                  <span class="cart-badge">${totalQtyInCart}</span>
                </button>
              </div>
              <div class="popup-cta-right">
                <div class="popup-cta-qty-selector" data-id="${variantId}">
                  <button class="qty-btn dec" aria-label="Decrease quantity">-</button>
                  <span class="qty" aria-live="polite">${qtyInCart}</span>
                  <button class="qty-btn inc" aria-label="Increase quantity">+</button>
                </div>
              </div>
            </div>`;
            document.getElementById('popupViewCartBtn').addEventListener('click', () => UI.showCart());
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

        state.variantDrawerProduct = product;

        document.getElementById('variantDrawerTitle').textContent = `Select Size: ${product.name}`;
        const content = document.getElementById('variantDrawerContent');
        content.innerHTML = product.variants.map((variant, index) => {
            const variantId = `${product.id}-${index}`;
            const qtyInCart = state.cart[variantId] || 0;
            const hasOffer = variant.mrp > variant.finalPrice;
            const savings = hasOffer ? Math.round(variant.mrp - variant.finalPrice) : 0;

            return `
                <div class="variant-option" data-id="${variantId}">
                    <div class="variant-info">
                        <div class="variant-info-name">${variant.name} (${variant.net})</div>
                        <div class="variant-info-price">
                            <span class="final-price">₹${variant.finalPrice}</span>
                            ${hasOffer ? `<span class="old-price">₹${variant.mrp}</span>` : ''}
                            ${savings > 0 ? `<span class="discount-badge">SAVE ₹${savings}</span>` : ''}
                        </div>
                    </div>
                    <div class="variant-cta">
                        ${qtyInCart > 0 ?
                            `<div class="cart-controls" data-id="${variantId}">
                                <button class="qty-btn dec" aria-label="Decrease quantity">-</button>
                                <span class="qty">${qtyInCart}</span>
                                <button class="qty-btn inc" aria-label="Increase quantity">+</button>
                            </div>` :
                            `<button class="add-btn" data-id="${variantId}" aria-label="Add ${variant.name} to cart">ADD</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');

        // Open the drawer
        document.getElementById('variantDrawerOverlay').classList.add('active');
        document.getElementById('variantDrawer').classList.add('active');
    },

    closeVariantDrawer: () => {
        document.getElementById('variantDrawerOverlay').classList.remove('active');
        document.getElementById('variantDrawer').classList.remove('active');
        state.variantDrawerProduct = null;
    },

    updateVariantDrawer: () => {
        const drawer = document.getElementById('variantDrawer');
        if (!drawer || !drawer.classList.contains('active') || !state.variantDrawerProduct) return;

        const product = state.variantDrawerProduct;

        const content = document.getElementById('variantDrawerContent');
        content.innerHTML = product.variants.map((variant, index) => {
            const variantId = `${product.id}-${index}`;
            const qtyInCart = state.cart[variantId] || 0;
            const hasOffer = variant.mrp > variant.finalPrice;
            const savings = hasOffer ? Math.round(variant.mrp - variant.finalPrice) : 0;

            return `
                <div class="variant-option" data-id="${variantId}">
                    <div class="variant-info">
                        <div class="variant-info-name">${variant.name} (${variant.net})</div>
                        <div class="variant-info-price">
                            <span class="final-price">₹${variant.finalPrice}</span>
                            ${hasOffer ? `<span class="old-price">₹${variant.mrp}</span>` : ''}
                            ${savings > 0 ? `<span class="discount-badge">SAVE ₹${savings}</span>` : ''}
                        </div>
                    </div>
                    <div class="variant-cta">
                    ${qtyInCart > 0 ?
                        `<div class="cart-controls" data-id="${variantId}">
                                <button class="qty-btn dec" aria-label="Decrease quantity">-</button>
                                <span class="qty">${qtyInCart}</span>
                                <button class="qty-btn inc" aria-label="Increase quantity">+</button>
                            </div>` :
                        `<button class="add-btn" data-id="${variantId}" aria-label="Add ${variant.name} to cart">ADD</button>`
                    }
                    </div>
                </div>
            `;
        }).join('');
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
        UI.updateVariantDrawer(); // NEW: Refresh variant drawer if open
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

        productCards.forEach(card => {
            // FIX: The CTA button or out-of-stock badge is directly inside the .product-image container.
            const imageContainer = card.querySelector('.product-image');
            if (!imageContainer) return;
    
            // Find and remove the old control (add button, qty selector, or out of stock badge).
            // This is more robust than assuming the structure.
            const oldControls = imageContainer.querySelector('.add-btn, .cart-controls, .out-of-stock-overlay, .variant-btn');
            if (oldControls) {
                oldControls.remove();
            }

            let newControlHTML = '';
            const sanitizedName = product.name;

            if (product.available) {
                const variants = product.variants || [];
                const variantCount = variants.length;
                const isSpecialCategory = product.category === 'Prawns' || product.category === 'Pickles';
                const useSizesCta = variantCount >= 3 || (variantCount > 1 && isSpecialCategory);

                const qtyInCart = Object.keys(state.cart)
                    .filter(key => key.startsWith(`${product.id}-`))
                    .reduce((sum, key) => sum + state.cart[key], 0);

                if (qtyInCart > 0 && variantCount === 1) {
                    const variantId = `${product.id}-0`;
                    newControlHTML = `<div class="cart-controls" data-id="${variantId}"><button class="qty-btn dec" aria-label="Decrease quantity">-</button><span class="qty">${qtyInCart}</span><button class="qty-btn inc" aria-label="Increase quantity">+</button></div>`;
                } else if (useSizesCta) {
                    const ctaText = `${variantCount} Sizes`;
                    newControlHTML = `<button class="add-btn variant-btn" data-id="${product.id}" aria-label="${ctaText}" aria-haspopup="dialog">${ctaText}</button>`;
                } else {
                    const variantId = `${product.id}-0`;
                    const buttonActionId = variantCount > 1 ? product.id : variantId;
                    const buttonClass = variantCount > 1 ? 'add-btn variant-btn' : 'add-btn';
                    newControlHTML = `<button class="${buttonClass}" data-id="${buttonActionId}" aria-label="Add ${sanitizedName} to cart">ADD</button>`;
                }
            } else {
                newControlHTML = `<div class="out-of-stock-overlay">Out of Stock</div>`;
            }

            // Insert the new, correct control into the image container.
            if (newControlHTML) {
                imageContainer.insertAdjacentHTML('beforeend', newControlHTML);
            }
        });
    },

    /**
     * NEW: Helper to generate a clean, user-friendly display name for a variant.
     * @param {object} item - The merged product/variant item object.
     * @returns {string} A sanitized display name.
     */
    getVariantDisplayName: (item) => {
        // Use the variant's specific name if it's different from the product's name.
        const namePart = (item.variantName && item.variantName !== item.name) ? `${item.name} (${item.variantName})` : item.name;
        // Append the net weight if it exists, for clarity.
        return item.net ? `${namePart} - ${item.net}` : namePart;
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
                // FIX: Provide a fallback image and an onerror handler for robustness.
                const placeholderImg = 'https://res.cloudinary.com/dpyniai9l/image/upload/v1757005094/food_yircgb.png';
                const optimizedCartImage = UI.getOptimizedImageUrl(item.image, 128, 128) || placeholderImg;
                const displayName = UI.getVariantDisplayName(item);

                return `
          <article class="cart-item-card" data-id="${item.variantId}">
            <img src="${optimizedCartImage}" alt="${displayName}" class="cart-item-thumb" onerror="this.onerror=null;this.src='${placeholderImg}';">
            <div class="cart-item-meta">
              <div class="cart-item-name">${displayName}</div>
              <div class="cart-item-price">
                ₹${item.finalPrice}
                ${hasOffer ? `<span class="cart-item-mrp">₹${item.mrp}</span>` : ''}
              </div>
            </div>
            <div class="cart-item-qty" data-id="${item.variantId}">
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
            // FIX: The delivery fee is already accounted for. Do not add an arbitrary amount to savings.
            const totalSavings = productSavings + couponDiscount;
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

    renderFavoritesPage: () => {
        // NEW: Get containers for both the product grid and the empty state
        const favoritesContainer = document.getElementById('favoriteProducts');
        const emptyStateContainer = document.getElementById('favoritesEmptyState');
        if (!favoritesContainer || !emptyStateContainer) return;

        const favoritedProducts = state.products.filter(p => state.favorites.has(p.id));

        if (favoritedProducts.length > 0) {
            // If there are favorites, show the product grid and hide the empty state
            favoritesContainer.style.display = 'grid';
            emptyStateContainer.style.display = 'none';
            favoritesContainer.innerHTML = favoritedProducts.map(p => UI.createProductHTML(p)).join('');
        } else {
            // If there are no favorites, hide the product grid and show the empty state
            favoritesContainer.style.display = 'none';
            emptyStateContainer.style.display = 'flex'; // Use flex to center the content
            emptyStateContainer.innerHTML = `
                <div class="empty-cart">
                    <div class="illustration" aria-hidden="true">
                        <svg width="160" height="140" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Empty favorites illustration"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="var(--border-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <h2 class="empty-cart-title">No Favorites Yet</h2>
                    <p class="empty-cart-lead">Tap the heart on any product to save it here for later.</p>
                    <button class="cart-cta empty-cart-btn prominent" id="findProductsFromFavorites">Find Products</button>
                </div>`;
        }
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
        } else if (page === 'contactPage') {
            pageTitle = 'Contact Us | Coastal Fresh India';
            pageDesc = 'Get in touch with Coastal Fresh India for support, inquiries, or feedback. Contact us via email or WhatsApp for quick assistance with your fresh seafood orders in Hyderabad.';
            pagePath = '/contact';
        } else if (page === 'ordersPage') {
            UI.renderOrdersPage(); // This was a bug, now fixed
        } else if (page === 'favoritesPage') {
            pageTitle = 'My Favorites | Coastal Fresh India';
            pageDesc = 'View and manage your list of favorite fresh seafood products at Coastal Fresh India.';
            pagePath = '/favorites';
            UI.renderFavoritesPage();
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
                        <button class="about-cta-btn" id="loginFromOrdersBtn" style="width: 100%;">Login / Sign Up</button>
                        <button class="text-link-cta" id="continueAsGuestBtn">Continue as Guest</button>
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
        // NEW: Get elements for the refer page
        const referralShareContainer = document.getElementById('referralShareContainer');
        const referralLoginPrompt = document.getElementById('referralLoginPrompt');
        const referralLinkEl = document.getElementById('referralLink');


        if (state.currentUser) {
            if (state.currentUser.photoURL) {
                avatar.innerHTML = `<img src="${state.currentUser.photoURL}" alt="Profile Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatar.innerHTML = `<i class="fas fa-user"></i>`;
            }

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

            // NEW: Show referral controls for logged-in users
            if (referralShareContainer) referralShareContainer.style.display = 'flex';
            if (referralLoginPrompt) referralLoginPrompt.style.display = 'none';
        } else {
            avatar.innerHTML = `<i class="fas fa-user"></i>`;
            userName.textContent = 'Guest User';
            userStatus.textContent = 'You are browsing as a guest.';
            logoutBtn.style.display = 'none';
            if (guestCta) guestCta.style.display = 'flex';
            if (referBtn) referBtn.style.display = 'none';

            // NEW: Show login prompt for guest users on refer page
            if (referralLinkEl) referralLinkEl.textContent = 'Login to get your code';
            if (referralShareContainer) referralShareContainer.style.display = 'none';
            if (referralLoginPrompt) referralLoginPrompt.style.display = 'flex';
        }
    }
};

document.querySelectorAll('.wish').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const productId = parseInt(btn.dataset.id, 10);
        if (!isNaN(productId)) {
            Handlers.toggleFavorite(productId);
        }
    });
});
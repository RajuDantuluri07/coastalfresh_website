import { firebaseConfig } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // Get product ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));

    if (productId) {
        // Fetch product from Firestore
        db.collection('products').where('id', '==', productId).get()
            .then(snapshot => {
                if (snapshot.empty) {
                    console.log('No matching documents.');
                    document.querySelector('.container').innerHTML = '<h1>Product not found</h1>';
                    return;
                }

                snapshot.forEach(doc => {
                    const product = doc.data();
                    renderProduct(product);
                });
            })
            .catch(err => {
                console.log('Error getting documents', err);
                document.querySelector('.container').innerHTML = '<h1>Error loading product</h1>';
            });
    } else {
        document.querySelector('.container').innerHTML = '<h1>No product specified</h1>';
    }
});

function renderProduct(product) {
    let displayPrice = product.finalPrice;
    let displayMrp = product.mrp;
    let displayNet = product.net;
    let displayGross = product.gross;
    let displayOffer = product.offer;

    if (product.variants && product.variants.length > 0) {
        const firstVariant = product.variants[0];
        displayPrice = firstVariant.finalPrice;
        displayMrp = firstVariant.mrp;
        displayNet = firstVariant.net || product.net;
        displayGross = firstVariant.gross || product.gross;
    }

    document.title = `${product.name} — Coastal Fresh`;

    const productImage = document.querySelector('.product-image');
    if (productImage) {
        productImage.src = product.image;
        productImage.alt = product.name;
    }

    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = product.name;

    const subline = document.querySelector('.subline');
    if (subline) subline.textContent = product.desc;

    const infoRow = document.querySelector('.info-row');
    if (infoRow) {
        infoRow.innerHTML = `
            <div class="info-item" role="listitem">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 21h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                ${displayNet || ''}
            </div>
            <div class="info-item">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 6h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M7 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                Gross: ${displayGross || ''}
            </div>
        `;
    }

    const desc = document.querySelector('.desc');
    if (desc) desc.textContent = product.desc;

    const finalPriceEl = document.querySelector('.price .final');
    if (finalPriceEl) finalPriceEl.textContent = `₹${displayPrice}`;
    
    const mrpEl = document.querySelector('.price .mrp');
    const discountEl = document.querySelector('.discount');

    if (displayOffer > 0) {
        if (mrpEl) mrpEl.innerHTML = `MRP: <span style="text-decoration:line-through;color:var(--muted)">₹${displayMrp}</span>`;
        if (discountEl) discountEl.textContent = `${displayOffer}% off`;
    } else {
        if (mrpEl) mrpEl.style.display = 'none';
        if (discountEl) discountEl.style.display = 'none';
    }
    
    const stickyPriceEl = document.querySelector('.sticky-footer .cta-card > div:first-child div:last-child');
    if (stickyPriceEl) stickyPriceEl.textContent = `₹${displayPrice}`;
}
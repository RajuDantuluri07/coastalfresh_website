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
                    // Handle product not found
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
        // Handle no product ID
        document.querySelector('.container').innerHTML = '<h1>No product specified</h1>';
    }
});

function renderProduct(product) {
    document.title = `${product.name} — Coastal Fresh`;

    // Image
    const productImage = document.querySelector('.product-image');
    productImage.src = product.image;
    productImage.alt = product.name;

    // Title and subline
    document.querySelector('h1').textContent = product.name;
    document.querySelector('.subline').textContent = product.desc; // Using desc for subline

    // Info row
    const infoRow = document.querySelector('.info-row');
    infoRow.innerHTML = `
        <div class="info-item" role="listitem">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 7h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 21h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${product.net}
        </div>
        <div class="info-item">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 6h18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M7 12h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            Gross: ${product.gross}
        </div>
    `;

    // Description
    document.querySelector('.desc').textContent = product.desc;

    // Price
    document.querySelector('.price .final').textContent = `₹${product.finalPrice}`;
    if (product.offer > 0) {
        document.querySelector('.price .mrp').innerHTML = `MRP: <span style="text-decoration:line-through;color:var(--muted)">₹${product.mrp}</span>`;
        document.querySelector('.discount').textContent = `${product.offer}% off`;
    } else {
        document.querySelector('.price .mrp').style.display = 'none';
        document.querySelector('.discount').style.display = 'none';
    }
    
    // Sticky footer price
    document.querySelector('.sticky-footer .cta-card > div:first-child div:last-child').textContent = `₹${product.finalPrice}`;

    // Note: The add to cart logic is simple and doesn't connect to the main app's cart.
    // This would need to be integrated with the main cart logic from app.js/handlers.js for a full solution.
}

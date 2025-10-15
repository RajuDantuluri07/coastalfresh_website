import { firebaseConfig } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));

    const debugOutput = document.getElementById('debug-output');

    if (productId) {
        db.collection('products').where('id', '==', productId).get()
            .then(snapshot => {
                if (snapshot.empty) {
                    debugOutput.textContent = 'Product not found.';
                    return;
                }
                snapshot.forEach(doc => {
                    const product = doc.data();
                    debugOutput.textContent = JSON.stringify(product, null, 2);
                });
            })
            .catch(err => {
                debugOutput.textContent = 'Error: ' + err.message;
            });
    } else {
        debugOutput.textContent = 'No product ID in URL.';
    }
});

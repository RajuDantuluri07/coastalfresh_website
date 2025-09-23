// This script should be loaded as a module in admin.html
// <script src="/admin.js" type="module"></script>

// Use the same Firebase config as your main app
const firebaseConfig = {
    apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw",
    authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
    projectId: "coastal-fresh---sea-foods",
    storageBucket: "coastal-fresh---sea-foods.appspot.com",
    messagingSenderId: "782759620106",
    appId: "1:782759620106:web:960ec7c125faa30675f9f3",
    measurementId: "G-GSHMPRYPW1"
};

// IMPORTANT: Replace this with the actual UID of your admin user from the Firebase Authentication console.
const ADMIN_UID = "REPLACE_WITH_YOUR_ADMIN_UID";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const adminEmailEl = document.getElementById('admin-email');
const logoutBtn = document.getElementById('logout-btn');
const dailyRevenueEl = document.getElementById('daily-revenue');
const pendingOrdersEl = document.getElementById('pending-orders');
const orderListEl = document.getElementById('order-list');

/**
 * Handles the authentication state change.
 * Shows the dashboard for an admin user, otherwise shows the login page.
 */
auth.onAuthStateChanged(user => {
    if (user && user.uid === ADMIN_UID) {
        // User is an admin
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        adminEmailEl.textContent = user.email;
        initDashboard();
    } else {
        // User is not an admin or not logged in
        loginView.style.display = 'flex';
        dashboardView.style.display = 'none';
        if (user) {
            // If a non-admin user is logged in, sign them out.
            auth.signOut();
        }
    }
});

/**
 * Handles the admin login form submission.
 */
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            console.error("Admin login failed:", error);
            loginError.textContent = error.message;
        });
});

/**
 * Handles the logout button click.
 */
logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

/**
 * Initializes the dashboard by fetching and rendering data.
 */
function initDashboard() {
    fetchAndRenderOrders();
    fetchAndRenderSummary();
}

/**
 * Fetches orders from Firestore and renders them in real-time.
 */
function fetchAndRenderOrders() {
    db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        if (snapshot.empty) {
            orderListEl.innerHTML = '<p>No orders found.</p>';
            return;
        }

        let pendingCount = 0;
        const orderHTML = snapshot.docs.map(doc => {
            const order = { id: doc.id, ...doc.data() };
            if (order.status === 'Pending' || order.status === 'Accepted') {
                pendingCount++;
            }
            return createOrderCardHTML(order);
        }).join('');

        orderListEl.innerHTML = orderHTML;
        pendingOrdersEl.textContent = pendingCount;
    }, error => {
        console.error("Error fetching orders: ", error);
        orderListEl.innerHTML = '<p class="error-message">Could not load orders.</p>';
    });
}

/**
 * Fetches completed orders for the day and calculates revenue.
 */
function fetchAndRenderSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    db.collection('orders')
      .where('createdAt', '>=', today)
      .where('status', '==', 'Completed')
      .onSnapshot(snapshot => {
        let totalRevenue = 0;
        snapshot.forEach(doc => {
            totalRevenue += doc.data().total;
        });
        dailyRevenueEl.textContent = `₹${totalRevenue.toFixed(2)}`;
    }, error => {
        console.error("Error fetching summary data: ", error);
        dailyRevenueEl.textContent = 'Error';
    });
}

/**
 * Creates the HTML for a single order card.
 * @param {object} order - The order data.
 * @returns {string} The HTML string for the order card.
 */
function createOrderCardHTML(order) {
    const orderDate = order.createdAt?.toDate().toLocaleString('en-IN') || 'N/A';
    const statusOptions = ['Pending', 'Accepted', 'Out for Delivery', 'Completed', 'Cancelled'];

    return `
        <div class="order-card-admin" data-id="${order.id}" data-status="${order.status}">
            <header>
                <h3>Order ID: ${order.orderId}</h3>
                <span class="order-total">₹${order.total}</span>
            </header>
            <div class="order-body">
                <div class="customer-details">
                    <p><strong>Customer:</strong> ${order.address.fullName}</p>
                    <p><strong>Contact:</strong> ${order.address.mobile}</p>
                    <p><strong>Address:</strong> ${order.address.house}, ${order.address.street}, ${order.address.pincode}</p>
                    <p><strong>Date:</strong> ${orderDate}</p>
                </div>
                <div class="order-items">
                    <strong>Items:</strong>
                    <ul>
                        ${order.items.map(item => `<li>${item.name} (x${item.qty})</li>`).join('')}
                    </ul>
                </div>
                <div class="order-actions">
                    <label for="status-${order.id}"><strong>Status:</strong></label>
                    <select id="status-${order.id}" onchange="updateOrderStatus('${order.id}', this.value)">
                        ${statusOptions.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>
    `;
}

/**
 * Updates the status of an order in Firestore.
 * This function is exposed to the global scope to be used by the onchange attribute.
 * @param {string} orderId - The document ID of the order.
 * @param {string} newStatus - The new status to set.
 */
window.updateOrderStatus = (orderId, newStatus) => {
    if (!orderId || !newStatus) return;
    db.collection('orders').doc(orderId).update({ status: newStatus })
        .then(() => {
            console.log(`Order ${orderId} updated to ${newStatus}`);
        })
        .catch(error => {
            console.error("Error updating order status: ", error);
            alert('Failed to update status. See console for details.');
        });
};
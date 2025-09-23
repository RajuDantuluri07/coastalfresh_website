// This script should be loaded as a module in admin.html
// <script src="/admin.js" type="module"></script>
import { firebaseConfig } from './js/firebase-config.js';

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
const adminAvatarEl = document.getElementById('admin-avatar');
const logoutBtn = document.getElementById('logout-btn');
const dailyRevenueEl = document.getElementById('daily-revenue');
const pendingOrdersEl = document.getElementById('pending-orders');
const totalOrdersEl = document.getElementById('total-orders');
const totalCustomersEl = document.getElementById('total-customers');
const completedOrdersEl = document.getElementById('completed-orders');
const ordersContainerEl = document.getElementById('orders-container');
const statusFilterEl = document.getElementById('status-filter');

let allOrders = []; // Cache for all orders to allow client-side filtering

// List of authorized admin User IDs.
const ADMIN_UIDS = [
    "p4uS2H3JFXNvmhkQWftUH721a2n2",
    "pel0OXjpAva5fe9367PgIHsRaak1"
];

/**
 * Handles the authentication state change.
 * Shows the dashboard for an admin user, otherwise shows the login page.
 */
auth.onAuthStateChanged(user => {
    if (user && ADMIN_UIDS.includes(user.uid)) {
        // User is an admin
        loginView.style.display = 'none';
        dashboardView.style.display = 'flex';
        adminEmailEl.textContent = user.email;
        adminAvatarEl.textContent = user.email ? user.email.charAt(0).toUpperCase() : 'A';
        initDashboard();
    } else {
        // User is not an admin or not logged in
        loginView.style.display = 'flex';
        dashboardView.style.display = 'none';
        if (user) {
            // If a non-admin user is logged in, show an error and sign them out.
            loginError.textContent = 'You do not have permission to access this page.';
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
 * Event delegation for status changes.
 */
ordersContainerEl.addEventListener('change', (e) => {
    if (e.target.matches('.status-select')) {
        const orderId = e.target.dataset.orderId;
        const newStatus = e.target.value;
        if (orderId && newStatus) {
            updateOrderStatus(orderId, newStatus);
        }
    }
});

/**
 * Filter orders when the status dropdown changes.
 */
statusFilterEl.addEventListener('change', () => {
    renderFilteredOrders();
});

/**
 * Initializes the dashboard by fetching and rendering data.
 */
function initDashboard() {
    fetchAndRenderOrders();
    fetchAndRenderSummary();
    fetchCustomerCount();
}

/**
 * Fetches orders from Firestore and renders them in real-time.
 */
function fetchAndRenderOrders() {
    db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
        ordersContainerEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        if (snapshot.empty) {
            ordersContainerEl.innerHTML = '<p style="text-align: center; padding: 2rem;">No orders found.</p>';
            allOrders = [];
            return;
        }

        allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFilteredOrders();

        // Update summary stats that depend on all orders
        totalOrdersEl.textContent = allOrders.length;
        const pendingCount = allOrders.filter(o => o.status === 'Pending' || o.status === 'Accepted').length;
        pendingOrdersEl.textContent = pendingCount;
        const completedCount = allOrders.filter(o => o.status === 'Completed').length;
        completedOrdersEl.textContent = completedCount;

    }, error => {
        console.error("Error fetching orders: ", error);
        ordersContainerEl.innerHTML = '<p class="error-message" style="text-align: center; padding: 2rem; color: var(--danger);">Could not load orders.</p>';
    });
}

/**
 * Renders orders based on the current filter.
 */
function renderFilteredOrders() {
    const filter = statusFilterEl.value;
    const filteredOrders = filter === 'all' ? allOrders : allOrders.filter(order => order.status === filter);
    const orderHTML = filteredOrders.map(createOrderCardHTML).join('');
    ordersContainerEl.innerHTML = orderHTML || '<p style="text-align: center; padding: 2rem;">No orders match this filter.</p>';
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
 * Fetches the total number of customers (users).
 */
function fetchCustomerCount() {
    db.collection('users').onSnapshot(snapshot => {
        totalCustomersEl.textContent = snapshot.size;
    }, error => {
        console.error("Error fetching customer count: ", error);
        totalCustomersEl.textContent = 'N/A';
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
    const statusBadgeClass = order.status.replace(/\s+/g, '-');

    return `
        <div class="order-card" data-id="${order.id}" data-status="${order.status}">
            <div class="order-header">
                <span class="order-id">#${order.orderId}</span>
                <span class="status-badge ${statusBadgeClass}">${order.status}</span>
                <span class="order-total">₹${order.total.toFixed(2)}</span>
            </div>
            <div class="order-body">
                <div class="order-section">
                    <h4>Customer Details</h4>
                    <div class="customer-info">
                        <p><strong>Name:</strong> ${order.address.fullName}</p>
                        <p><strong>Phone:</strong> ${order.address.mobile}</p>
                        <p><strong>Address:</strong> ${order.address.house}, ${order.address.street}, ${order.address.pincode}</p>
                        <p class="order-date"><strong>Ordered:</strong> ${orderDate}</p>
                    </div>
                </div>
                <div class="order-section">
                    <h4>Order Items</h4>
                    <ul class="order-items">
                        ${order.items.map(item => `
                            <li>
                                <span class="item-name">${item.name}</span>
                                <span class="item-qty">×${item.qty}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <div class="order-section">
                    <h4>Order Management</h4>
                    <div class="status-selector">
                        <select class="status-select" data-order-id="${order.id}">
                            ${statusOptions.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Updates the status of an order in Firestore.
 * @param {string} orderId - The document ID of the order.
 * @param {string} newStatus - The new status to set.
 */
function updateOrderStatus(orderId, newStatus) {
    db.collection('orders').doc(orderId).update({ status: newStatus })
        .then(() => {
            console.log(`Order ${orderId} updated to ${newStatus}`);
            // The onSnapshot listener will automatically re-render the card with the new status.
        })
        .catch(error => {
            console.error("Error updating order status: ", error);
            alert('Failed to update status. See console for details.');
        });
}
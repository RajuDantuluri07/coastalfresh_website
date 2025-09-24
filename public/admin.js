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
const newSignupsTodayEl = document.getElementById('new-signups-today');
const activeUsersTodayEl = document.getElementById('active-users-today');
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
    fetchAndRenderDailySummary();
    fetchAndRenderAggregateStats();
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
 * Fetches real-time summary data for the current day, like revenue.
 * This is optimized to read from a pre-aggregated document.
 */
function fetchAndRenderDailySummary() {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const dailySummaryRef = db.collection('summaries').doc(dateString);

    dailySummaryRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            dailyRevenueEl.textContent = `₹${(data.revenue || 0).toFixed(2)}`;
        } else {
            // If the document doesn't exist, it means no revenue yet for today.
            dailyRevenueEl.textContent = `₹0.00`;
        }
    }, error => {
        console.error("Error fetching daily summary: ", error);
        dailyRevenueEl.textContent = 'Error';
    });
}

/**
 * Fetches aggregate counts for orders and users efficiently using count().
 * This runs once on load and is not real-time to save on reads.
 * For real-time, you could wrap this in an onSnapshot on a metadata doc.
 */
async function fetchAndRenderAggregateStats() {
    try {
        // Set loading state
        [totalOrdersEl, pendingOrdersEl, completedOrdersEl, newSignupsTodayEl, activeUsersTodayEl].forEach(el => el.textContent = '...');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Order Counts
        const totalOrdersQuery = db.collection('orders').count().get();
        const pendingOrdersQuery = db.collection('orders').where('status', 'in', ['Pending', 'Accepted']).count().get();
        const completedOrdersQuery = db.collection('orders').where('status', '==', 'Completed').count().get();

        // User Counts
        const newSignupsQuery = db.collection('users').where('createdAt', '>=', today).count().get();
        const activeUsersQuery = db.collection('users').where('lastSeen', '>=', today).count().get();

        // Fetch all counts in parallel
        const [
            totalOrdersSnap,
            pendingOrdersSnap,
            completedOrdersSnap,
            newSignupsSnap,
            activeUsersSnap
        ] = await Promise.all([
            totalOrdersQuery,
            pendingOrdersQuery,
            completedOrdersQuery,
            newSignupsQuery,
            activeUsersQuery
        ]);

        // Update UI with the counts
        totalOrdersEl.textContent = totalOrdersSnap.data().count;
        pendingOrdersEl.textContent = pendingOrdersSnap.data().count;
        completedOrdersEl.textContent = completedOrdersSnap.data().count;
        newSignupsTodayEl.textContent = newSignupsSnap.data().count;
        activeUsersTodayEl.textContent = activeUsersSnap.data().count;

    } catch (error) {
        console.error("Error fetching aggregate stats:", error);
        // Set error state
        [totalOrdersEl, pendingOrdersEl, completedOrdersEl, newSignupsTodayEl, activeUsersTodayEl].forEach(el => el.textContent = 'N/A');

        // Helpful console warnings for missing indexes
        if (error.code === 'failed-precondition') {
            console.warn(
                "A Firestore index is likely missing for one of the aggregate stat queries. " +
                "Please check the Firestore console for index creation links in the error logs."
            );
        }
    }
}

/**
 * Fetches the total number of customers (users).
 */
function fetchCustomerCount() {
    // This is a more efficient way to get the user count.
    // It reads a single document containing the count instead of the entire 'users' collection.
    //
    // IMPORTANT: You must create this document in your Firestore database:
    // 1. Go to your Firestore console.
    // 2. Create a new collection called 'metadata'.
    // 3. Inside 'metadata', create a new document with the ID 'userStats'.
    // 4. In that document, add a 'count' field (Number type) and set its value to your current number of users.
    db.collection('metadata').doc('userStats').onSnapshot((doc) => {
        if (doc.exists && doc.data().count !== undefined) {
            totalCustomersEl.textContent = doc.data().count;
        } else {
            // Fallback: If userStats doesn't exist, count the users directly.
            // This is less efficient but provides a good fallback.
            console.warn("metadata/userStats document not found. Falling back to counting users collection. This is less efficient.");
            db.collection('users').get().then(snapshot => {
                totalCustomersEl.textContent = snapshot.size;
            }).catch(err => {
                console.error("Error counting users collection:", err);
                totalCustomersEl.textContent = 'N/A';
            });
        }
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
    const statusBadgeClass = order.status.replace(/\s+/g, '-');
    const isTerminalState = order.status === 'Completed' || order.status === 'Cancelled';

    // Define the possible next states for each current state.
    const validTransitions = {
        'Pending': ['Pending', 'Accepted', 'Cancelled'],
        'Accepted': ['Accepted', 'Out for Delivery', 'Cancelled'],
        'Out for Delivery': ['Out for Delivery', 'Completed', 'Cancelled'],
    };

    // Determine which options to show in the dropdown.
    const availableOptions = validTransitions[order.status] || [];

    // Generate the HTML for the order management section.
    let managementHTML;
    if (isTerminalState) {
        // If the order is completed or cancelled, disable the dropdown.
        managementHTML = `
            <div class="status-selector-disabled">
                <span>Status is final</span>
            </div>
        `;
    } else {
        // Otherwise, show a dropdown with only the valid next states.
        managementHTML = `
            <select class="status-select" data-order-id="${order.id}">
                ${availableOptions.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
        `;
    }

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
                    ${managementHTML}
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
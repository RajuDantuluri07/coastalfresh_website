const firebaseConfig = {
    apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw",
    authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
    projectId: "coastal-fresh---sea-foods",
    storageBucket: "coastal-fresh---sea-foods.appspot.com",
    messagingSenderId: "782759620106",
    appId: "1:782759620106:web:960ec7c125faa30675f9f3",
    measurementId: "G-GSHMPRYPW1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const ORDERS_PER_PAGE = 15;
let lastVisibleOrder = null;
let isLoading = false;
// NEW: State variables for filtering and searching
let currentStatusFilter = 'all';
let currentSearchTerm = '';


document.addEventListener('DOMContentLoaded', () => {
    const authGate = document.getElementById('auth-gate');
    const adminApp = document.getElementById('admin-app');

    auth.onAuthStateChanged(async user => {
        if (user) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists && userDoc.data().role === 'admin') {
                    // User is an admin, show the app
                    authGate.style.display = 'none';
                    adminApp.style.display = 'block';
                    document.getElementById('adminUserName').textContent = user.displayName || user.email;
                    initializeAdminPanel();
                } else {
                    // User is not an admin
                    authGate.innerHTML = `
                        <h2>Access Denied</h2>
                        <p>You do not have permission to view this page.</p>
                        <a href="/">Go to Homepage</a>`;
                }
            } catch (error) {
                console.error("Error verifying admin role:", error);
                authGate.innerHTML = `<p style="color:red;">Error verifying your credentials.</p>`;
            }
        } else {
            // No user is signed in
            authGate.innerHTML = `
                <h2>Please Log In</h2>
                <p>You must be logged in as an admin to access this panel.</p>
                <a href="/#login">Go to Login Page</a>`;
        }
    });
});

function initializeAdminPanel() {
    // Initial load
    loadOrders(true);

    // Event Listeners
    document.getElementById('adminLogoutBtn').addEventListener('click', () => auth.signOut());
    document.getElementById('loadMoreBtn').addEventListener('click', () => loadOrders(false));

    // NEW: Filter and Search Event Listeners
    const searchInput = document.getElementById('orderSearch');
    const statusFilter = document.getElementById('statusFilter');

    // Use debounce to prevent firing a query on every keystroke
    searchInput.addEventListener('input', debounce(() => {
        currentSearchTerm = searchInput.value.trim();
        loadOrders(true); // Reload orders from the beginning
    }, 500));

    statusFilter.addEventListener('change', () => {
        currentStatusFilter = statusFilter.value;
        loadOrders(true); // Reload orders from the beginning
    });
    
    // Modal listeners
    const modal = document.getElementById('orderDetailModal');
    modal.querySelector('.modal-close-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

// NEW: Debounce utility to limit how often a function is called
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}





async function loadOrders(isInitialLoad = false) {
    if (isLoading) return;
    isLoading = true;

    const container = document.getElementById('orders-list-container');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (isInitialLoad) {
        container.innerHTML = createSkeletonLoader(5);
        lastVisibleOrder = null;
    } else {
        loadMoreBtn.textContent = 'Loading...';
        loadMoreBtn.disabled = true;
    }

    try {
        // MODIFIED: Build the query dynamically
        let query = db.collection('orders')
            .orderBy('createdAt', 'desc');

        // Apply status filter
        if (currentStatusFilter !== 'all') {
            query = query.where('status', '==', currentStatusFilter);
        }

        // Apply search term.
        // NOTE: Firestore doesn't support native text search. This simple implementation
        // searches for an exact match on the 'orderId' field, which is a common use case.
        // For a more advanced search (e.g., by name), a third-party service like Algolia is recommended.
        if (currentSearchTerm) {
            query = query.where('orderId', '==', currentSearchTerm);
        }
        query = query.limit(ORDERS_PER_PAGE);

        if (lastVisibleOrder && !isInitialLoad) {
            query = query.startAfter(lastVisibleOrder);
        }

        const snapshot = await query.get();

        if (isInitialLoad) {
            container.innerHTML = ''; // Clear skeletons
        }

        if (snapshot.empty && isInitialLoad) {
            container.innerHTML = '<p style="text-align: center; padding: 20px;">No orders match your criteria.</p>';
            loadMoreBtn.style.display = 'none';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            order.id = doc.id; // Add document ID to the order object
            container.innerHTML += createOrderCardHTML(order);
        });

        // After rendering cards, create the table for desktop view
        updateTableView(snapshot.docs.map(doc => ({...doc.data(), id: doc.id})), isInitialLoad);

        lastVisibleOrder = snapshot.docs[snapshot.docs.length - 1];

        if (snapshot.docs.length < ORDERS_PER_PAGE) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'block';
        }

    } catch (error) {
        console.error("Error loading orders:", error);
        container.innerHTML = `<p style="color:red;">Failed to load orders. Check console for details.</p>`;
    } finally {
        isLoading = false;
        loadMoreBtn.textContent = 'Load More';
        loadMoreBtn.disabled = false;
    }
}

function createOrderCardHTML(order) {
    const orderDate = order.createdAt?.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) || 'N/A';
    const statusClass = order.status.toLowerCase().replace(/\s+/g, '-');

    return `
        <div class="order-card status-${statusClass}" data-order-id="${order.id}">
            <div class="order-card-header">
                <div>
                    <div class="order-id">#${order.orderId}</div>
                    <div class="order-date">${orderDate}</div>
                </div>
                <div class="order-status status-${statusClass}">${order.status}</div>
            </div>
            <div class="order-card-body">
                <div class="info-row">
                    <i class="fas fa-user"></i>
                    <span>${order.customerName || 'N/A'} (${order.customerPhone || 'N/A'})</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-shopping-bag"></i>
                    <span>${order.items.length} item(s)</span>
                </div>
            </div>
            <div class="order-card-footer">
                <span class="order-total">₹${order.total}</span>
                <button class="view-details-btn" onclick="showOrderDetail('${order.id}')">View Details</button>
            </div>
        </div>
    `;
}

function updateTableView(orders, isInitialLoad) {
    const container = document.getElementById('orders-list-container');
    let table = container.querySelector('.orders-table');

    if (isInitialLoad) {
        container.classList.add('table-view');
        container.innerHTML += `
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `;
        table = container.querySelector('.orders-table');
    }

    const tbody = table.querySelector('tbody');
    orders.forEach(order => {
        tbody.innerHTML += createOrderRowHTML(order);
    });
}

function createOrderRowHTML(order) {
    const orderDate = order.createdAt?.toDate().toLocaleDateString('en-IN') || 'N/A';
    const statusClass = order.status.toLowerCase().replace(/\s+/g, '-');
    const itemsSummary = order.items.map(item => `${item.name} x${item.qty}`).join(', ');

    return `
        <tr data-order-id="${order.id}">
            <td>#${order.orderId}</td>
            <td class="customer-info">${order.customerName || 'N/A'}<span>${order.customerPhone || 'N/A'}</span></td>
            <td class="items-summary">${itemsSummary}</td>
            <td>₹${order.total}</td>
            <td><span class="order-status status-${statusClass}">${order.status}</span></td>
            <td>${orderDate}</td>
            <td><button class="view-details-btn" onclick="showOrderDetail('${order.id}')">Details</button></td>
        </tr>
    `;
}

async function showOrderDetail(orderId) {
    const modal = document.getElementById('orderDetailModal');
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = '<div class="loading-spinner" style="margin: 40px auto;"></div>';
    modal.classList.add('active');

    try {
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) {
            modalBody.innerHTML = '<p>Order not found.</p>';
            return;
        }

        const order = orderDoc.data();
        document.getElementById('modalOrderId').textContent = `Order #${order.orderId}`;

        const statuses = ['Pending', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered', 'Cancelled'];

        modalBody.innerHTML = `
            <div class="modal-section status-changer">
                <label for="statusSelector">Change Order Status</label>
                <select id="statusSelector" data-order-id="${orderId}">
                    ${statuses.map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>

            <div class="modal-section">
                <h4>Customer & Delivery</h4>
                <div class="modal-section-content">
                    <p><strong>Name:</strong> ${order.customerName}</p>
                    <p><strong>Phone:</strong> ${order.customerPhone}</p>
                    <p><strong>Address:</strong> ${order.address.house}, ${order.address.street}, ${order.address.city}, ${order.address.pincode}</p>
                </div>
            </div>

            <div class="modal-section">
                <h4>Items</h4>
                <div class="modal-section-content">
                    ${order.items.map(item => `
                        <div class="modal-item">
                            <span>${item.name} (x${item.qty})</span>
                            <span>₹${item.price * item.qty}</span>
                        </div>
                    `).join('')}
                    <div class="modal-price-summary">
                        <div class="modal-item"><strong>Subtotal</strong><span>₹${order.subtotal}</span></div>
                        <div class="modal-item"><strong>Delivery</strong><span>₹${order.deliveryFee}</span></div>
                        <div class="modal-item"><strong>Total</strong><strong>₹${order.total}</strong></div>
                    </div>
                </div>
            </div>
        `;

        // Add event listener for status change
        document.getElementById('statusSelector').addEventListener('change', handleStatusChange);

    } catch (error) {
        console.error("Error fetching order details:", error);
        modalBody.innerHTML = `<p style="color:red;">Could not load order details.</p>`;
    }
}

async function handleStatusChange(event) {
    const newStatus = event.target.value;
    const orderId = event.target.dataset.orderId;

    if (!orderId || !newStatus) return;

    const statusSelector = event.target;
    statusSelector.disabled = true;

    try {
        const orderRef = db.collection('orders').doc(orderId);
        
        // As per your spec, we should log who made the change and when.
        // This uses a nested map for status timestamps.
        const updateData = {
            status: newStatus,
            [`statusTimestamps.${newStatus.toLowerCase().replace(/\s+/g, '')}At`]: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await orderRef.update(updateData);

        // Update UI in real-time
        const statusClass = newStatus.toLowerCase().replace(/\s+/g, '-');
        
        // Update card view
        const card = document.querySelector(`.order-card[data-order-id="${orderId}"]`);
        if (card) {
            card.className = `order-card status-${statusClass}`; // Reset and add new class
            card.querySelector('.order-status').className = `order-status status-${statusClass}`;
            card.querySelector('.order-status').textContent = newStatus;
        }

        // Update table view
        const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
        if (row) {
            const statusCell = row.querySelector('.order-status');
            statusCell.className = `order-status status-${statusClass}`;
            statusCell.textContent = newStatus;
        }

        alert('Status updated successfully!'); // Simple confirmation

    } catch (error) {
        console.error("Error updating status:", error);
        alert('Failed to update status.');
        // Revert dropdown on failure
        const orderDoc = await db.collection('orders').doc(orderId).get();
        statusSelector.value = orderDoc.data().status;
    } finally {
        statusSelector.disabled = false;
    }
}

function createSkeletonLoader(count) {
    let skeletons = '';
    for (let i = 0; i < count; i++) {
        skeletons += `
            <div class="skeleton-card">
                <div class="skeleton-header">
                    <div class="skeleton-line w-50"></div>
                    <div class="skeleton-line w-25"></div>
                </div>
                <div class="skeleton-line w-75"></div>
                <div class="skeleton-line w-50"></div>
            </div>
        `;
    }
    return skeletons;
}
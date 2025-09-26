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
const adminAvatarEl = document.getElementById('admin-avatar');
const logoutBtn = document.getElementById('logout-btn');
const dailyRevenueEl = document.getElementById('daily-revenue');
const pendingOrdersEl = document.getElementById('pending-orders');
const totalOrdersEl = document.getElementById('total-orders');
const completedOrdersEl = document.getElementById('completed-orders');
const newSignupsTodayEl = document.getElementById('new-signups-today');
const activeUsersTodayEl = document.getElementById('active-users-today');
const ordersContainerEl = document.getElementById('orders-container');
const segmented = document.querySelector('.segmented');
const bottomNav = document.querySelector('.bottom-nav');
// List of authorized admin User IDs.
const ADMIN_UIDS = [
    "p4uS2H3JFXNvmhkQWftUH721a2n2",
    "pel0OXjpAva5fe9367PgIHsRaak1" // Add the new admin's UID here
];
// Local cache & helpers
let allOrders = [];
let unsubscribeOrders = null;
let pendingUpdate = {}; // debounced updates
// ---------- Auth state ----------
auth.onAuthStateChanged(user => {
    if (user && ADMIN_UIDS.includes(user.uid)) {
        // show dashboard
        loginView.style.display = 'none';
        dashboardView.style.display = 'flex';
        adminAvatarEl.textContent = (user.email || 'A').charAt(0).toUpperCase();
        startDashboard();
    } else {
        // show login
        loginView.style.display = 'flex';
        dashboardView.style.display = 'none';
        if (user) {
            loginError.textContent = 'You do not have permission to access this page.';
            auth.signOut();
        } else {
            loginError.textContent = '';
        }
        stopDashboard();
    }
});
// ---------- Login ----------
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    auth.signInWithEmailAndPassword(email, password).catch(err => {
        console.error('Login failed', err);
        loginError.textContent = err.message || 'Login failed';
    });
});
logoutBtn.addEventListener('click', () => auth.signOut());
// ---------- Dashboard lifecycle ----------
function startDashboard() {
    fetchAndListenOrders();
    fetchDailySummary();
    fetchAggregateCounts();
    fetchCustomerCount(); // metadata listener
}
function stopDashboard() {
    if (unsubscribeOrders) unsubscribeOrders();
    unsubscribeOrders = null;
}
// ---------- Orders (real-time) ----------
function fetchAndListenOrders() {
    // unsubscribe previous
    if (unsubscribeOrders) unsubscribeOrders();
    ordersContainerEl.innerHTML = '<div class="empty"><div class="spinner" aria-hidden="true"></div></div>';
    unsubscribeOrders = db.collection('orders').orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
        if (snapshot.empty) {
            allOrders = [];
            ordersContainerEl.innerHTML = '<div class="empty">No orders yet.</div>';
            return;
        }
        allOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderOrders(currentFilter());
          updateFilterCounts();
    }, err => {
        console.error('Orders listener error', err);
        ordersContainerEl.innerHTML = '<div class="empty">Unable to load orders.</div>';
    });
}
// ---------- Render & UI Helpers ----------
function currentFilter() {
    const active = document.querySelector('.segmented button.active');
    return active?.dataset?.filter || 'all';
}
// segmented filter taps
segmented.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-filter]');
    if (!btn) return;
    segmented.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // render
    renderOrders(btn.dataset.filter);
});

function updateFilterCounts() {
    const counts = {
        'all': allOrders.length,
        'Pending': 0,
        'Accepted': 0,
        'Out for Delivery': 0,
        'Completed': 0,
        'Cancelled': 0
    };

    for (const order of allOrders) {
        if (order.status && counts.hasOwnProperty(order.status)) {
            counts[order.status]++;
        }
    }

    document.querySelectorAll('.segmented button[data-filter]').forEach(btn => {
        const filter = btn.dataset.filter;
        const countEl = btn.querySelector('.count');
        const count = counts[filter];
        if (countEl) countEl.textContent = count > 0 ? count : '';
    });
}
// Render orders list (mobile-friendly, collapsible)
function renderOrders(filter = 'all') {
    const filtered = filter === 'all' ? allOrders : allOrders.filter(o => o.status === filter);
    if (!filtered.length) {
        ordersContainerEl.innerHTML = '<div class="empty">No orders match this filter.</div>';
        return;
    }
    ordersContainerEl.innerHTML = filtered.map(orderCardHTML).join('');
}
// Build order card HTML
function orderCardHTML(order) {
    const created = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-IN') : 'N/A';
    const total = (order.total || 0).toFixed(2);
    const status = order.status || 'Pending';
    const terminal = status === 'Completed' || status === 'Cancelled';
    // safe-guard items
    const items = (order.items || []).map(i => `<li><span>${escapeHtml(i.name)}</span><strong>×${i.qty}</strong></li>`).join('');
    const address = order.address || {};
    return `
        <div class="order-card" data-id="${order.id}" data-status="${status}">
          <div class="order-head" role="button" tabindex="0" aria-expanded="false" data-action="toggle">
            <div class="order-meta">
              <div class="id">#${escapeHtml(order.orderId || order.id)}</div>
              <div class="time">${escapeHtml(created)}</div>
              <div style="font-size:.85rem;color:var(--muted)"> ${escapeHtml(address.fullName || '—')} • ${escapeHtml(address.mobile || '—')}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.35rem">
              <div class="order-total">₹${total}</div>
              <div class="status-badge" style="font-size:.78rem;color:var(--muted)">${escapeHtml(status)}</div>
            </div>
          </div>
          <div class="order-body" aria-hidden="true">
            <div class="order-section">
              <strong style="font-size:.92rem">Delivery</strong>
              <div style="font-size:.9rem;color:var(--muted)">${escapeHtml(address.house || '')} ${escapeHtml(address.street || '')} ${escapeHtml(address.pincode || '')}</div>
            </div>
            <div class="order-section">
              <strong style="font-size:.92rem">Items</strong>
              <ul class="order-items">${items || '<li style="opacity:.7">No items</li>'}</ul>
            </div>
            <div class="order-section">
              <strong style="font-size:.92rem">Manage</strong>
              <div class="management">
                ${ terminal ? `<div style="font-weight:700;color:var(--muted)">Status final</div>` :
                  `<select class="select" data-order-id="${order.id}" aria-label="Change status">
                     ${statusOptionsFor(status).map(s => `<option value="${s}" ${s===status?'selected':''}>${s}</option>`).join('')}
                   </select>
                   <button class="btn-small btn-primary" data-confirm="${order.id}" aria-label="Confirm status change">Update</button>`
                }
                <button class="btn-small" style="background:#f3f4f6;border:1px solid #e6e9ee" data-copy="${escapeHtml(address.mobile || '')}" aria-label="Copy phone">Copy</button>
              </div>
            </div>
          </div>
        </div>
      `;
}
// delegated click handler for toggles + buttons
document.addEventListener('click', (ev) => {
    const toggle = ev.target.closest('[data-action="toggle"]');
    if (toggle) {
        const card = toggle.closest('.order-card');
        toggleOrderBody(card);
    }
    const updateBtn = ev.target.closest('[data-confirm]');
    if (updateBtn) {
        const orderId = updateBtn.dataset.confirm;
        const select = document.querySelector(`select[data-order-id="${orderId}"]`);
        if (!select) return;
        const newStatus = select.value;
        confirmAndUpdate(orderId, newStatus);
    }
    const copyBtn = ev.target.closest('[data-copy]');
    if (copyBtn) {
        const phone = copyBtn.dataset.copy;
        if (phone) navigator.clipboard?.writeText(phone).then(() => toast('Phone copied to clipboard'));
    }

    // NEW: Handle role update button
    const roleUpdateBtn = ev.target.closest('[data-update-role]');
    if (roleUpdateBtn) {
        const userId = roleUpdateBtn.dataset.updateRole;
        const input = document.querySelector(`input[data-role-input="${userId}"]`);
        if (!input) return;
        const newRole = input.value.trim();
        updateUserRole(userId, newRole);
    }
});
// keyboard toggle (accessibility)
document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
        const el = document.activeElement;
        if (el && el.matches('[data-action="toggle"]')) {
            const card = el.closest('.order-card');
            toggleOrderBody(card);
        }
    }
});
function toggleOrderBody(card) {
    if (!card) return;
    const body = card.querySelector('.order-body');
    const head = card.querySelector('[data-action="toggle"]');
    const isOpen = body.classList.contains('open');
    if (isOpen) {
        body.classList.remove('open');
        head.setAttribute('aria-expanded', 'false');
        body.setAttribute('aria-hidden', 'true');
    } else {
        body.classList.add('open');
        head.setAttribute('aria-expanded', 'true');
        body.setAttribute('aria-hidden', 'false');
    }
}
// ---------- Confirm + optimistic update with debounce revert ----------
function confirmAndUpdate(orderId, newStatus) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return toast('Order not found');
    if (order.status === newStatus) return toast('Status unchanged');
    // confirm via native confirm (mobile-friendly) — you can replace with custom modal
    const ok = confirm(`Change order #${order.orderId || orderId} status to "${newStatus}"?`);
    if (!ok) return;
    // optimistic update in UI
    const card = document.querySelector(`.order-card[data-id="${orderId}"]`);
    const statusBadge = card?.querySelector('.status-badge');
    const prevStatus = order.status;
    if (statusBadge) statusBadge.textContent = newStatus;
    // disable controls briefly
    const select = document.querySelector(`select[data-order-id="${orderId}"]`);
    if (select) select.disabled = true;
    // debounce writes (prevent double taps)
    if (pendingUpdate[orderId]) clearTimeout(pendingUpdate[orderId]);
    pendingUpdate[orderId] = setTimeout(async () => {
        try {
            await db.collection('orders').doc(orderId).update({ status: newStatus });
            toast('Status updated');

            // If the new status is 'Completed', update the daily revenue summary.
            if (newStatus === 'Completed') {
                const today = new Date();
                const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
                const summaryRef = db.collection('summaries').doc(dateString);
                // Atomically increment revenue. Creates the doc if it doesn't exist.
                await summaryRef.set({
                    revenue: firebase.firestore.FieldValue.increment(order.total || 0)
                }, { merge: true });
            }
            // Firestore snapshot will update local allOrders
        } catch (err) {
            console.error('Update failed', err);
            // revert UI
            if (statusBadge) statusBadge.textContent = prevStatus;
            if (select) {
                select.value = prevStatus;
                select.disabled = false;
            }
            toast('Failed to update — try again');
        } finally {
            delete pendingUpdate[orderId];
        }
    }, 350); // short debounce
}

// ---------- NEW: Customer/User Management ----------

bottomNav.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-page]');
    if (!btn || btn.id === 'refresh-btn') return;

    bottomNav.querySelectorAll('button[data-page]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const page = btn.dataset.page;
    showMainView(page);
});

function showMainView(page) {
    const dashboardContent = [document.querySelector('.stats-scroll'), document.querySelector('.segmented'), document.getElementById('orders-container')];
    const customersView = document.getElementById('customers-view');

    if (page === 'customers') {
        dashboardContent.forEach(el => el.style.display = 'none');
        customersView.style.display = 'flex';
        renderCustomersPage();
    } else { // Default to dashboard
        dashboardContent.forEach(el => el.style.display = 'flex');
        customersView.style.display = 'none';
    }
}

async function renderCustomersPage() {
    const container = document.getElementById('customers-container');
    container.innerHTML = '<div class="empty"><div class="spinner"></div></div>';

    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            container.innerHTML = '<div class="empty">No customers found.</div>';
            return;
        }

        const customersHTML = usersSnapshot.docs.map(doc => {
            const user = doc.data();
            const role = user.role || 'customer'; // Default role
            return `
                <div class="customer-card">
                    <div class="customer-info">
                        <div class="email">${escapeHtml(user.email)}</div>
                        <div class="uid">UID: ${doc.id}</div>
                        <div class="role">Current Role: <strong>${escapeHtml(role)}</strong></div>
                    </div>
                    <div class="management">
                        <input type="text" class="select" style="flex: 1;" value="${escapeHtml(role)}" data-role-input="${doc.id}" placeholder="Enter new role">
                        <button class="btn-small btn-primary" data-update-role="${doc.id}">Update Role</button>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = customersHTML;

    } catch (err) {
        console.error("Error fetching customers:", err);
        container.innerHTML = '<div class="empty">Could not load customers.</div>';
    }
}

async function updateUserRole(userId, newRole) {
    if (!userId || !newRole) return toast('User ID and role are required.');
    await db.collection('users').doc(userId).update({ role: newRole });
    toast(`User role updated to "${newRole}"`);
    renderCustomersPage(); // Re-render to show the change
}
// ---------- Fetch summaries & counts ----------
function fetchDailySummary() {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    db.collection('summaries').doc(dateString).onSnapshot(doc => {
        if (doc.exists) {
            dailyRevenueEl.textContent = `₹${(doc.data().revenue || 0).toFixed(2)}`;
        } else {
            dailyRevenueEl.textContent = `₹0.00`;
        }
    }, err => {
        console.error('Daily summary error', err);
        dailyRevenueEl.textContent = '—';
    });
}

async function fetchAggregateCounts() {
    try {
        [totalOrdersEl.textContent, pendingOrdersEl.textContent, completedOrdersEl.textContent] = ['...', '...', '...'];
        const totalOrdersQuery = db.collection('orders').get();
        const pendingOrdersQuery = db.collection('orders').where('status', 'in', ['Pending', 'Accepted']).get();
        const completedOrdersQuery = db.collection('orders').where('status', '==', 'Completed').get();

        const [totalOrdersSnap, pendingOrdersSnap, completedOrdersSnap] = await Promise.all([totalOrdersQuery, pendingOrdersQuery, completedOrdersQuery]);

        totalOrdersEl.textContent = totalOrdersSnap.size;
        pendingOrdersEl.textContent = pendingOrdersSnap.size;
        completedOrdersEl.textContent = completedOrdersSnap.size;

    } catch (err) {
        console.error('Order aggregate counts error', err);
        [totalOrdersEl.textContent, pendingOrdersEl.textContent, completedOrdersEl.textContent] = ['N/A', 'N/A', 'N/A'];
    }

    // Fetch user stats separately to prevent one failure from stopping the other.
    // This is often the part that fails if indexes are missing.
    try {
        [newSignupsTodayEl.textContent, activeUsersTodayEl.textContent] = ['...', '...'];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const newSignupsQuery = db.collection('users').where('createdAt', '>=', today).get();
        const activeUsersQuery = db.collection('users').where('lastSeen', '>=', today).get();

        const [newSignupsSnap, activeUsersSnap] = await Promise.all([newSignupsQuery, activeUsersQuery]);

        newSignupsTodayEl.textContent = newSignupsSnap.size;
        activeUsersTodayEl.textContent = activeUsersSnap.size;
    } catch (err) {
        console.error('User aggregate counts error:', err);
        [newSignupsTodayEl.textContent, activeUsersTodayEl.textContent] = ['N/A', 'N/A'];
        if (err.code === 'failed-precondition') {
            console.warn(
                "A Firestore index is required for user statistics. The error message below contains a link to create it automatically. Click the link, create the index, and then refresh the admin panel after a few minutes."
            );
            // Log the full error, which contains the creation link
            console.error(err);
        }
    }
}
// metadata user count listener
function fetchCustomerCount() {
    db.collection('metadata').doc('userStats').onSnapshot(doc => {
        // This function gets the *total* number of users.
        // The stat card is labeled "Active Users" but will function as "Total Customers".
        if (doc.exists && doc.data().count !== undefined) {
            activeUsersTodayEl.textContent = doc.data().count;
        } else {
            // Fallback if the metadata document doesn't exist.
            db.collection('users').get().then(s => {
                activeUsersTodayEl.textContent = s.size;
            }).catch(() => activeUsersTodayEl.textContent = 'N/A');
        }
    });
}
// refresh button in bottom nav
document.getElementById('refresh-btn').addEventListener('click', () => {
    toast('Refreshing...');
    fetchAndListenOrders();
    fetchAggregateCounts();
    fetchDailySummary();
});
// small toast implement
function toast(msg) {
    // tiny accessible toast using alert role
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '80px';
    el.style.transform = 'translateX(-50%)';
    el.style.background = 'rgba(15,23,42,0.95)';
    el.style.color = 'white';
    el.style.padding = '.6rem 1rem';
    el.style.borderRadius = '999px';
    el.style.zIndex = 9999;
    el.style.fontWeight = 700;
    el.style.boxShadow = '0 6px 20px rgba(2,6,23,0.2)';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.style.opacity = '0.0', 1600);
    setTimeout(() => el.remove(), 2000);
}
// simple html escape to avoid XSS in injected HTML (we're still injecting trusted data but be safe)
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
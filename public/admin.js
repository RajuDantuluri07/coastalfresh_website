import { firebaseConfig } from './js/firebase-config.js';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage(); // NEW: Initialize Firebase Storage
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

// List of authorized admin User IDs.
const ADMIN_UIDS = [
    "p4uS2H3JFXNvmhkQWftUH721a2n2",
    "pel0OXjpAva5fe9367PgIHsRaak1" // Add the new admin's UID here
];

// NEW: Define product categories to prevent typos.
const PRODUCT_CATEGORIES = [
    "Fish",
    "Prawns",
    "Crabs",
    "Pickles"
];

// Local cache & helpers
let allOrders = [];
let unsubscribeOrders = null;
let allProducts = []; // NEW: Cache for products
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

    // FIX: Move menu setup here to ensure elements exist.
    const menuBtn = document.getElementById('menu-btn');
    const drawerMenu = document.getElementById('drawer-menu');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const drawerNav = document.querySelector('.drawer-nav');

    function openDrawer() {
        drawerMenu.classList.add('active');
        drawerOverlay.classList.add('active');
    }

    function closeDrawer() {
        drawerMenu.classList.remove('active');
        drawerOverlay.classList.remove('active');
    }

    // Centralized navigation handler
    menuBtn.addEventListener('click', openDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    drawerNav.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-page]');
        if (btn) {
            const page = btn.dataset.page;
            showMainView(page);
            closeDrawer();
        } else if (ev.target.closest('#refresh-btn')) {
            // Handle refresh button click
            handleRefresh();
            closeDrawer();
        } else {
            closeDrawer(); // Close drawer on any other click inside
        }
    });
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

function statusOptionsFor(status) {
    const validTransitions = {
        'Pending': ['Pending', 'Accepted', 'Cancelled'],
        'Accepted': ['Accepted', 'Out for Delivery', 'Cancelled'],
        'Out for Delivery': ['Out for Delivery', 'Completed', 'Cancelled'],
        'Completed': ['Completed'],
        'Cancelled': ['Cancelled']
    };
    return validTransitions[status] || [status];
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


function showMainView(page) {
    const drawerNav = document.querySelector('.drawer-nav'); // FIX: Get reference to the drawer nav
    // Update active state in the drawer menu
    drawerNav.querySelectorAll('button[data-page]').forEach(b => b.classList.remove('active'));
    drawerNav.querySelector(`button[data-page="${page}"]`)?.classList.add('active');

    const dashboardContent = [document.querySelector('.stats-scroll'), document.querySelector('.segmented'), document.getElementById('orders-container')];
    const customersView = document.getElementById('customers-view');

    const productsView = document.getElementById('products-view');
    const productFormView = document.getElementById('product-form-view');

    // Hide all main views first
    dashboardContent.forEach(el => el.style.display = 'none');
    customersView.style.display = 'none';
    productsView.style.display = 'none';
    productFormView.style.display = 'none';

    if (page === 'customers') {
        customersView.style.display = 'flex';
        renderCustomersPage();
    } else if (page === 'products') {
        productsView.style.display = 'flex';
        renderProductsPage();
    } else if (page === 'reports') {
        // Placeholder for future reports page
        toast('Reports page is not yet implemented.');
    } else { // Default to dashboard
        dashboardContent.forEach(el => el.style.display = 'flex');
    }
}

function showProductForm(product = null) {
    document.getElementById('products-view').style.display = 'none';
    document.getElementById('product-form-view').style.display = 'flex';
    populateProductForm(product);
}

async function renderCustomersPage() { // This function is now async
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

// ---------- NEW: Product Management Functions ----------

document.getElementById('add-new-product-btn').addEventListener('click', () => showProductForm(null));
document.getElementById('back-to-products-btn').addEventListener('click', () => showMainView('products'));

async function renderProductsPage() {
    const container = document.getElementById('products-container');
    container.innerHTML = '<div class="empty"><div class="spinner"></div></div>';

    try {
        const productsSnapshot = await db.collection('products').orderBy('id').get();
        if (productsSnapshot.empty) {
            container.innerHTML = '<div class="empty">No products found. Click "Add Product" to start.</div>';
            allProducts = [];
            return;
        }

        allProducts = productsSnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        const productsHTML = allProducts.map(product => productCardHTML(product)).join('');
        container.innerHTML = productsHTML;

    } catch (err) {
        console.error("Error fetching products:", err);
        container.innerHTML = '<div class="empty">Could not load products.</div>';
    }
}

function productCardHTML(product) {
    const variants = product.variants || [];
    const primaryVariant = variants[0] || {};

    return `
    <div class="order-card product-card" data-product-id="${product.id}">
      <div class="order-head" role="button" tabindex="0" aria-expanded="false" data-action="toggle">
        <img src="${product.image}" alt="${escapeHtml(product.name)}" class="product-thumb-admin" loading="lazy">
        <div class="order-meta">
          <div class="id">ID: ${product.id}</div>
          <div class="time">${escapeHtml(product.name)}</div>
          <div style="font-size:.85rem;color:var(--muted)">${escapeHtml(product.category)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.35rem">
          <div class="order-total">₹${primaryVariant.finalPrice || 'N/A'}</div>
          <div class="status-badge" style="font-size:.78rem;color:var(--muted)">${product.available ? 'Available' : 'Unavailable'}</div>
        </div>
      </div>
      <div class="order-body" aria-hidden="true">
        <div class="order-section">
          <strong>Description</strong>
          <p style="font-size:.9rem;color:var(--muted);">${escapeHtml(product.desc)}</p>
        </div>
        <div class="order-section">
          <strong>Variants (${variants.length})</strong>
          <ul class="variant-list">
            ${variants.map(v => `
              <li>
                <span>${escapeHtml(v.name)} (${escapeHtml(v.net)})</span>
                <span>MRP: ₹${v.mrp} / Price: ₹${v.finalPrice}</span>
                <span class="status-badge ${v.available ? 'available' : 'unavailable'}">${v.available ? 'Yes' : 'No'}</span>
              </li>`).join('') || '<li>No variants defined.</li>'}
          </ul>
        </div>
        <div class="order-section"><button class="btn-small btn-primary" data-action="edit-product" data-product-id="${product.id}">Edit Product</button></div>
      </div>
    </div>`;
}

document.getElementById('products-container').addEventListener('click', (e) => {
    const card = e.target.closest('[data-action="edit-product"]');
    if (card) {
        const productId = parseInt(card.dataset.productId, 10);
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            showProductForm(product);
        }
    }
});

function toggleVariantSection() {
    const categorySelect = document.getElementById('product-category');
    const variantSection = document.getElementById('variant-management-section');
    const addVariantBtn = document.getElementById('add-variant-btn');
    const selectedCategory = categorySelect.value;

    if (selectedCategory === 'Prawns' || selectedCategory === 'Pickles') {
        variantSection.style.display = 'block';
    } else {
        // FIX: Ensure the "Add Variant" button is also hidden for single-variant categories.
        variantSection.style.display = 'none';
    }
}

function populateProductForm(product) {
    const form = document.getElementById('product-form');
    form.reset();
    document.getElementById('product-form-title').textContent = product ? `Edit Product (ID: ${product.id})` : 'Add New Product';
    document.getElementById('product-id-input').value = product ? product.id : '';
    document.getElementById('product-name').value = product ? product.name : '';
    document.getElementById('product-desc').value = product ? product.desc : '';

    // NEW: Populate category dropdown
    const categorySelect = document.getElementById('product-category');
    categorySelect.innerHTML = PRODUCT_CATEGORIES.map(cat =>
        `<option value="${cat}" ${product && product.category === cat ? 'selected' : ''}>${cat}</option>`
    ).join('');
    // Set a default if it's a new product
    if (!product) categorySelect.value = PRODUCT_CATEGORIES[0];

    // Show/hide variant section based on the initial category
    toggleVariantSection();
    
    // NEW: Handle image preview
    const imagePreview = document.getElementById('product-image-preview');
    imagePreview.src = product ? product.image : '';
    imagePreview.style.display = (product && product.image) ? 'block' : 'none';
    document.getElementById('product-image-url').value = product ? product.image : '';

    // FIX: Provide a sensible default for new products.
    // For single-variant categories, the name is optional and will default to the product name.
    const defaultVariant = { name: '', gross: '1kg', net: '500g', mrp: 0, finalPrice: 0, available: true };
    renderVariantForms(product ? product.variants : [defaultVariant]);

    const deleteBtn = document.getElementById('delete-product-btn');
    if (product) {
        deleteBtn.style.display = 'block';
        deleteBtn.dataset.docId = product.docId;
    } else {
        deleteBtn.style.display = 'none';
    }
}

// Listen for category changes to toggle the variant section
document.getElementById('product-category').addEventListener('change', toggleVariantSection);

// NEW: Render variant forms
function renderVariantForms(variants = []) {
    const container = document.getElementById('variants-container');
    container.innerHTML = '';
    if (variants.length === 0) {
        // Add a default empty variant if none exist
        variants.push({ name: '', gross: '', net: '', mrp: 0, finalPrice: 0, available: true });
    }
    variants.forEach((variant, index) => {
        container.appendChild(createVariantForm(variant, index));
    });
}

// NEW: Create a single variant form group
function createVariantForm(variant, index) {
    const div = document.createElement('div');
    div.className = 'variant-card';
    div.innerHTML = `
        <div class="variant-header">
            <strong>Variant ${index + 1}</strong>
            <button type="button" class="remove-variant-btn" data-index="${index}">&times;</button>
        </div>
        <div class="field-row">
            <div class="field"><label>Name</label><input type="text" class="variant-name" value="${escapeHtml(variant.name || '')}" placeholder="Optional for single variant"></div>
            <div class="field"><label>Gross Wt.</label><input type="text" class="variant-gross" value="${escapeHtml(variant.gross || '')}" placeholder="e.g., 1kg"></div>
            <div class="field"><label>Net Wt.</label><input type="text" class="variant-net" value="${escapeHtml(variant.net || '')}" placeholder="e.g., 500g"></div>
        </div>
        <div class="field-row">
            <div class="field"><label>MRP (₹)</label><input type="number" step="0.01" class="variant-mrp" value="${variant.mrp || 0}" required></div>
            <div class="field"><label>Final Price (₹)</label><input type="number" step="0.01" class="variant-finalPrice" value="${variant.finalPrice || 0}" required></div>
            <div class="field"><label>Available</label><select class="variant-available"><option value="true" ${variant.available ? 'selected' : ''}>Yes</option><option value="false" ${!variant.available ? 'selected' : ''}>No</option></select></div>
        </div>
    `;
    return div;
}


// NEW: Handle file input change for image preview
document.getElementById('product-image-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const preview = document.getElementById('product-image-preview');
            preview.src = event.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// NEW: Add/Remove Variant Buttons
document.getElementById('add-variant-btn').addEventListener('click', () => {
    const container = document.getElementById('variants-container');
    container.appendChild(createVariantForm({}, container.children.length));
});

document.getElementById('variants-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-variant-btn')) {
        e.target.closest('.variant-card').remove();
    }
});

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
        // Prioritize URL field, but it will be overwritten by file upload if a file is selected.
        let imageUrl = document.getElementById('product-image-url').value;
        const imageFile = document.getElementById('product-image-upload').files[0];

        // If a new image file is selected, upload it
        if (imageFile) {
            const progressEl = document.getElementById('upload-progress');
            progressEl.style.display = 'block';
            progressEl.value = 0;

            const filePath = `products/${Date.now()}-${imageFile.name}`;
            const storageRef = storage.ref(filePath);
            const uploadTask = storageRef.put(imageFile);

            // Wait for the upload to complete
            imageUrl = await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        progressEl.value = progress;
                    },
                    (error) => {
                        reject(error);
                    },
                    async () => {
                        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                        resolve(downloadURL);
                    }
                );
            });
            progressEl.style.display = 'none';
        }

        if (!imageUrl) {
            throw new Error("Product image is required. Please upload an image or provide a URL.");
        }

        // FIX: For single-variant categories, ensure there is exactly one variant.
        const selectedCategory = document.getElementById('product-category').value;
        if (selectedCategory === 'Fish' || selectedCategory === 'Crabs') {
            if (document.querySelectorAll('.variant-card').length > 1) {
                throw new Error(`${selectedCategory} can only have one variant. Please remove extra variants.`);
            }
        }

        const productName = document.getElementById('product-name').value;

        // NEW: Collect variant data
        const variants = [];
        const variantCards = document.querySelectorAll('.variant-card');
        variantCards.forEach(card => {
            const mrp = parseFloat(card.querySelector('.variant-mrp').value);
            const finalPrice = parseFloat(card.querySelector('.variant-finalPrice').value);
            let variantName = card.querySelector('.variant-name').value;

            variants.push({
                name: variantName || productName, // Default to product name if variant name is empty
                gross: card.querySelector('.variant-gross').value,
                net: card.querySelector('.variant-net').value,
                mrp: mrp,
                finalPrice: finalPrice,
                offer: mrp > finalPrice ? Math.round(((mrp - finalPrice) / mrp) * 100) : 0,
                available: card.querySelector('.variant-available').value === 'true',
            });
        });

        // Validate variant names only if there are multiple variants
        if (variantCards.length > 1) {
            if (variants.some(v => !v.name)) {
                throw new Error("Variant names are required when you have more than one variant.");
            }
        }

        if (variants.length === 0) {
            throw new Error("At least one product variant is required.");
        }

        const productData = {
            name: productName,
            desc: document.getElementById('product-desc').value,
            category: document.getElementById('product-category').value,
            image: imageUrl, // Use the new or existing URL
            variants: variants,
            // Aggregate fields for filtering/display. Use the first variant as the primary.
            finalPrice: variants[0].finalPrice,
            mrp: variants[0].mrp,
            available: variants.some(v => v.available) // Product is available if at least one variant is.
        };
        const productId = document.getElementById('product-id-input').value;
        const docId = document.getElementById('delete-product-btn').dataset.docId; // Use the stored docId

        if (productId) { // Editing existing product
            productData.id = parseInt(productId, 10);
            const docRef = db.collection('products').doc(docId); // FIX: Use the actual document ID for updates.
            await docRef.set(productData, { merge: true });
            toast('Product updated successfully!');
        } else { // Creating new product
            const productsRef = db.collection('products');
            const lastProductQuery = await productsRef.orderBy('id', 'desc').limit(1).get();
            const newId = lastProductQuery.empty ? 1 : lastProductQuery.docs[0].data().id + 1;
            productData.id = newId;
            const docRef = db.collection('products').doc(String(newId));
            await docRef.set(productData);
            toast('Product created successfully!');
        }
        showMainView('products');
    } catch (err) {
        console.error("Error saving product:", err);
        toast(err.message || 'Failed to save product. Check console.');
    } finally {
        submitBtn.disabled = false;
    }
});

document.getElementById('delete-product-btn').addEventListener('click', async (e) => {
    const docId = e.target.dataset.docId; // This is the Firestore document ID
    const productToDelete = allProducts.find(p => p.docId === docId);
    if (!productToDelete) return toast('Error: Product ID not found.');

    if (confirm(`Are you sure you want to delete product ID ${productToDelete.id}? This cannot be undone.`)) {
        try {
            await db.collection('products').doc(String(productToDelete.id)).delete();
            toast('Product deleted.');
            showMainView('products');
        } catch (err) {
            console.error("Error deleting product:", err);
            toast('Failed to delete product.');
        }
    }
});

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
// refresh button in bottom nav
function handleRefresh() {
    toast('Refreshing...');
    fetchAndListenOrders();
    fetchAggregateCounts();
    fetchDailySummary();
}

document.getElementById('refresh-btn').addEventListener('click', handleRefresh);
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
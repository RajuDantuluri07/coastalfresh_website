// ===== AQUABOOK PRO - MVP ENHANCED =====

// Global Error Handler to prevent white screens
window.onerror = function(msg, url, line, col, error) {
    console.error("App Error:", msg, error);
    // Try to notify the user if the app object exists
    if (window.app && window.app.showToast) {
        window.app.showToast("An unexpected error occurred. Please restart.", "error");
    }
    return false;
};

class AquaBookPro {
    constructor() {
        this.state = this.getInitialState();

        // Observation Configuration
        this.OBSERVATION_CONFIG = {
            shrimpHealth: {
                title: "A. Shrimp Health",
                options: [
                    { id: 'red_legs', label: "Red legs", score: 3 },
                    { id: 'white_gut', label: "White gut", score: 2 },
                    { id: 'black_gill', label: "Black gill", score: 3 },
                    { id: 'soft_shell', label: "Soft / loose shell", score: 0 },
                    { id: 'weak_movement', label: "Weak / slow movement", score: 0 }
                ]
            },
            moulting: {
                title: "B. Moulting & Growth",
                options: [
                    { id: 'moulting_observed', label: "Moulting observed", score: 0 },
                    { id: 'frequent_moulting', label: "Frequent moulting", score: 0 },
                    { id: 'uneven_size', label: "Uneven size shrimp", score: 0 }
                ]
            },
            mortality: {
                title: "C. Mortality",
                options: [
                    { id: 'dead_1_2', label: "Dead shrimp (1–2)", score: 2 },
                    { id: 'dead_more_2', label: "Dead shrimp (> 2)", score: 4 }
                ]
            },
            environment: {
                title: "E. Waste / Environment",
                options: [
                    { id: 'white_fecal', label: "White fecal strings", score: 0 },
                    { id: 'feed_powder', label: "Feed powder accum.", score: 0 },
                    { id: 'bad_smell', label: "Bad smell near tray", score: 0 },
                    { id: 'excess_sludge', label: "Excess sludge", score: 0 }
                ]
            }
        };
        
        this.currentDate = this.getFormattedDate();
        this.initialized = false;
        this.currentWeatherCode = null;
        this.editingEntryId = null;
        this.editingFarmId = null;
        this.editingTankId = null;
        this.viewMode = 'today'; // today, yesterday, 7days, 30days, all
        this.taskFilter = 'all'; // all, pending, completed
        this.logViewType = 'matrix'; // 'matrix' or 'list'
        this.tempTrayResult = null; // Temporary storage for single tray update
        this.listenersAttached = false; // Prevent duplicate listeners
        
        this.pendingInviteId = new URLSearchParams(window.location.search).get('invite');
        this.currentUser = null; // Will hold user info after login
        this.firestoreListeners = []; // To hold unsubscribe functions for cleanup
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    getInitialState() {
        this.state = {
            farms: [],           // Array of farm objects
            tanks: [],           // Array of tank objects (belonging to farms)
            feedEntries: [],     // All feed entries
            harvests: [],        // Harvest records
            waterEntries: [],    // Water test history
            samplingEntries: [], // Growth sampling records
            prices: [],          // Market prices
            inventory: { totalKg: 0 }, // Inventory
            medicineInventory: [], // Medicine inventory array
            medicineApplications: [], // Medicine application records
            settings: {
                currentFarmId: null,
                currency: 'INR',
                logView: 'detailed', // or 'summary'
                supplements: ['Gut Probiotic', 'Gill Health', 'Growth Booster', 'Vitamin C', 'Mineral Mix', 'Binder'],
                feedsPerDay: 4,
                feedTypes: ['Pellet 1.0mm', 'Pellet 1.2mm', 'Pellet 1.4mm', 'Pellet 1.6mm', 'Pellet 2.0mm']
            },
            oldestLoadedDate: null, // Track pagination cursor
        };
        return this.state;
    }
    
    init() {
        this.initFirebase();
    }

    initFirebase() {
        // --- ACTION REQUIRED ---
        // For Firebase JS SDK v7.20.0 and later, measurementId is optional
        const firebaseConfig = {
          apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw",
          authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
          projectId: "coastal-fresh---sea-foods",
          storageBucket: "coastal-fresh---sea-foods.appspot.com",
          messagingSenderId: "782759620106",
          appId: "1:782759620106:web:960ec7c125faa30675f9f3",
          measurementId: "G-468VYWGBHM"
        };

        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        this.auth = firebase.auth();
        // Ensure user stays logged in indefinitely until explicit logout
        // 'LOCAL' persistence persists state even when the browser window is closed
        this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        this.db = firebase.firestore();
        this.functions = firebase.functions();

        // Initialize Messaging for Push Notifications
        try {
            this.messaging = firebase.messaging();
            this.messaging.onMessage((payload) => {
                console.log('Message received. ', payload);
                this.showToast(`${payload.notification.title}: ${payload.notification.body}`, 'info');
            });
        } catch (e) {
            console.log('Firebase Messaging not supported in this environment.');
        }

        // --- ENABLE OFFLINE PERSISTENCE (NEW) ---
        this.db.enablePersistence()
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    // This happens if multiple tabs are open. Persistence can only be enabled in one tab at a time.
                    console.warn('Firestore persistence failed: multiple tabs open.');
                } else if (err.code == 'unimplemented') {
                    // The browser is likely too old to support persistence.
                    console.warn('Firestore persistence not available in this browser.');
                }
            });

        // Listen for authentication state changes
        this.auth.onAuthStateChanged(user => {
            if (user) {
                // User is signed in.
                this.handleSignIn(user);
            } else {
                // User is signed out.
                this.handleSignOut();
            }
        });
    }

    async handleSignIn(user) {
        document.getElementById('authContainer').style.display = 'none';
        this.showLoading(true);

        // Check for session timeout (30 days)
        const lastActivity = localStorage.getItem('aquabook_last_activity');
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        if (lastActivity && (Date.now() - parseInt(lastActivity) > thirtyDays)) {
            this.auth.signOut();
            this.showToast("Session expired due to inactivity.", "warning");
            return;
        }

        const userProfile = await this.getUserProfile(user);

        if (!userProfile) {
            // This is a new user, show the role selection modal.
            this.showLoading(false);
            document.getElementById('roleModal').classList.add('active');
            return;
        }

        // Check for pending invitations for this new user.
        const hasInvite = await this.checkForInvitations(user);
        if (hasInvite) {
            // The invitation flow will take over. Don't initialize the main app yet.
            this.showLoading(false);
            this.handleInvitations(user);
            return;
        }

        this.currentUser = userProfile;
        await this.completeAppInitialization();
    }

    async completeAppInitialization() {
        try {
            await this.loadAllData(); // Load data from Firestore
            
            // Check for pending link invitation
            if (this.pendingInviteId && this.currentUser) {
                await this.processLinkInvitation(this.pendingInviteId, this.currentUser);
                this.pendingInviteId = null;
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            this.setupUI();
            this.renderAll();
            
            if (!this.listenersAttached) {
                this.setupEventListeners();
                this.setupSessionTracking();
                this.listenersAttached = true;
                window.addEventListener('online', () => this.showToast('You are back online!', 'success'));
                window.addEventListener('offline', () => this.showToast('You are offline. Maps may not work.', 'warning'));
            }
            
            this.initWeather();

            setTimeout(() => {
                this.showLoading(false);
                this.initialized = true;
                this.showToast('AquaBook Pro is ready!', 'success');
            }, 800);
        } catch (error) {
            console.error("App initialization failed:", error);
            this.showLoading(false);
            this.showToast("Something went wrong. Please refresh.", "error");
        }
    }

    handleSignOut() {
        this.detachFirestoreListeners();
        this.currentUser = null;
        this.state = this.getInitialState(); // Reset state
        this.closeAllModals();
        document.getElementById('authContainer').style.display = 'flex';
        this.showLoading(false);

        // Initialize reCAPTCHA here, as the container is now visible.
        // This prevents errors from trying to render into a hidden element.
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                'size': 'invisible',
                'callback': (response) => {
                    // This callback is often used for auto-sending the OTP after reCAPTCHA is solved.
                    // Since we have a manual button click, we can just log it.
                    console.log("reCAPTCHA solved.");
                }
            });
            // Render the verifier and store the widget ID for later resets if needed.
            window.recaptchaVerifier.render().then((widgetId) => {
                window.recaptchaWidgetId = widgetId;
            });
        }
    }

    signOut() {
        if (confirm('Are you sure you want to sign out?')) {
            this.auth.signOut();
        }
    }

    detachFirestoreListeners() {
        console.log("Detaching all Firestore listeners...");
        this.firestoreListeners.forEach(unsubscribe => unsubscribe());
        this.firestoreListeners = [];
    }
    
    // ===== DATA MANAGEMENT =====
    // Helper to fetch data in chunks (Reusable for pagination)
    async fetchCollectionData(collectionName, field, ids, startDate = null, endDate = null) {
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        
        const results = await Promise.all(chunks.map(chunk => {
            let query = this.db.collection(collectionName).where(field, 'in', chunk);
            if (startDate) query = query.where('date', '>=', startDate);
            if (endDate) query = query.where('date', '<', endDate);
            return query.get();
        }));
        
        return results.flatMap(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }

    async loadAllData() {
        if (!this.currentUser) return;
        console.log("Fetching all user data from Firestore...");

        const userId = this.currentUser.uid;
        
        // Initialize arrays to prevent undefined errors if no farms exist
        this.state.tanks = [];
        this.state.feedEntries = [];
        this.state.waterEntries = [];
        this.state.harvests = [];
        this.state.samplingEntries = [];
        this.state.medicineInventory = [];
        this.state.medicineApplications = [];

        // FACT 1: DATA TIME BOMB FIX
        // Only load data from the last 30 days to prevent browser crash.
        const thirtyDaysAgo = this.getFormattedDate(new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)));
        this.state.oldestLoadedDate = thirtyDaysAgo;

        // Fetch farms owned by the user
        const farmsQueryOwner = await this.db.collection('farms').where('ownerId', '==', userId).get();
        
        // Merge results
        const farmMap = new Map();
        farmsQueryOwner.docs.forEach(doc => farmMap.set(doc.id, { id: doc.id, ...doc.data() }));

        // Fetch farms where user is a member (using Collection Group query for new structure)
        // This is required after running the `migrate_members.js` script.
        try {
            const memberQuery = await this.db.collectionGroup('members').where(firebase.firestore.FieldPath.documentId(), '==', userId).get();
            const memberFarmIds = memberQuery.docs.map(doc => doc.ref.parent.parent.id);
            
            if (memberFarmIds.length > 0) {
                // Use the existing fetchCollectionData helper for document IDs
                const memberFarms = await this.fetchCollectionData('farms', firebase.firestore.FieldPath.documentId(), memberFarmIds);
                memberFarms.forEach(farm => farmMap.set(farm.id, farm));
            }
        } catch (e) {
            console.error("Failed to query member farms (Collection Group query might need an index):", e);
            // Fallback to old method in case index is not created yet.
            const farmsQueryMember = await this.db.collection('farms').where('memberIds', 'array-contains', userId).get();
            farmsQueryMember.docs.forEach(doc => {
                if (!farmMap.has(doc.id)) farmMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
        }
        
        this.state.farms = Array.from(farmMap.values());

        if (this.state.farms.length > 0) {
            const farmIds = this.state.farms.map(f => f.id);

            // Fetch data using chunk helper to avoid 10-item limit crash
            this.state.tanks = await this.fetchCollectionData('tanks', 'farmId', farmIds);

            // --- REAL-TIME LISTENER FOR FEED ENTRIES ---
            if (farmIds.length > 0) {
                // For MVP stability, listen to first 10 farms only to avoid 'in' query limit in onSnapshot
                const listenerFarmIds = farmIds.slice(0, 10);
                // Optimization: Only listen to recent entries
                const feedEntriesQuery = this.db.collection('feedEntries')
                    .where('farmId', 'in', listenerFarmIds)
                    .where('date', '>=', thirtyDaysAgo);

                const feedListener = feedEntriesQuery.onSnapshot(querySnapshot => {
                    console.log("Real-time: Received feed entries update.");
                    this.state.feedEntries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    // Re-render parts of the UI that depend on feed entries
                    if (this.initialized) {
                        this.renderLogBook();
                        this.checkPendingTrays();
                        this.renderOverallStats();
                        this.renderFeedTrendChart();
                    }
                }, error => {
                    console.error("Error with feed entries listener: ", error);
                    // Suppress toast on init to avoid confusion, just log
                });
                this.firestoreListeners.push(feedListener); // Store the unsubscribe function for cleanup
            }

            // Fetch other collections safely
            this.state.waterEntries = await this.fetchCollectionData('waterEntries', 'farmId', farmIds, thirtyDaysAgo);
            this.state.harvests = await this.fetchCollectionData('harvests', 'farmId', farmIds);
            this.state.samplingEntries = await this.fetchCollectionData('sampling', 'farmId', farmIds);
            this.state.medicineInventory = await this.fetchCollectionData('medicineInventory', 'farmId', farmIds);
            this.state.medicineApplications = await this.fetchCollectionData('medicineApplications', 'farmId', farmIds);
        }

        // Load settings from user profile or use defaults
        this.state.settings.currentFarmId = this.currentUser.settings?.currentFarmId || (this.state.farms[0]?.id || null);
        if (this.currentUser.settings) {
            this.state.settings = { ...this.state.settings, ...this.currentUser.settings };
        }

        // Fetch Market Prices from Firestore
        try {
            const pricesDoc = await this.db.collection('marketPrices').doc('current').get();
            if (pricesDoc.exists && pricesDoc.data().items) {
                this.state.prices = pricesDoc.data().items;
            }
        } catch (e) {
            console.error("Error fetching market prices:", e);
        }

        // Fetch Inventory AFTER settings are loaded (Fixes null ID crash)
        if (this.state.settings.currentFarmId) {
            try {
                // Real-time listener for Inventory (Since backend updates it now)
                this.db.collection('inventory').doc(this.state.settings.currentFarmId)
                    .onSnapshot(doc => {
                        if (doc.exists) {
                            this.state.inventory = doc.data();
                            this.renderInventorySummary();
                        }
                    });
            } catch (e) {
                console.warn("Inventory fetch failed, using default", e);
            }
        }

        // Initialize default prices if empty
        if (this.state.prices.length === 0) {
            this.state.prices = [
                { count: 30, price: 480, change: '+10', trend: 'up' },
                { count: 40, price: 380, change: '+5', trend: 'up' },
                { count: 50, price: 310, change: '0', trend: 'stable' },
                { count: 60, price: 260, change: '-5', trend: 'down' },
                { count: 70, price: 230, change: '-10', trend: 'down' },
                { count: 80, price: 200, change: '0', trend: 'stable' }
            ];
        }

        console.log("Data loaded from Firestore.");
    }

    async loadOlderData() {
        if (!this.state.oldestLoadedDate) return;
        
        this.showLoading(true);
        try {
            const currentOldest = new Date(this.state.oldestLoadedDate);
            const newStartDateObj = new Date(currentOldest);
            newStartDateObj.setDate(currentOldest.getDate() - 30);
            
            const newStartDate = this.getFormattedDate(newStartDateObj);
            const endDate = this.state.oldestLoadedDate;
            
            const farmIds = this.state.farms.map(f => f.id);
            if (farmIds.length === 0) { this.showLoading(false); return; }

            // Fetch older data
            const newFeeds = await this.fetchCollectionData('feedEntries', 'farmId', farmIds, newStartDate, endDate);
            const newWater = await this.fetchCollectionData('waterEntries', 'farmId', farmIds, newStartDate, endDate);
            
            // Append to state
            this.state.feedEntries = [...this.state.feedEntries, ...newFeeds];
            this.state.waterEntries = [...this.state.waterEntries, ...newWater];
            this.state.oldestLoadedDate = newStartDate;
            
            // Switch to 'all' view to ensure data is visible
            this.setViewMode('all'); 
            this.showToast(`Loaded data back to ${newStartDate}`);
        } catch (e) {
            console.error("Error loading older data:", e);
            this.showToast("Failed to load older data", "error");
        }
        this.showLoading(false);
    }

    saveAllData() {
        localStorage.setItem('aquabook_farms', JSON.stringify(this.state.farms));
        localStorage.setItem('aquabook_tanks', JSON.stringify(this.state.tanks));
        localStorage.setItem('aquabook_entries', JSON.stringify(this.state.feedEntries));
        localStorage.setItem('aquabook_harvests', JSON.stringify(this.state.harvests));
        localStorage.setItem('aquabook_water', JSON.stringify(this.state.waterEntries));
        localStorage.setItem('aquabook_sampling', JSON.stringify(this.state.samplingEntries));
        localStorage.setItem('aquabook_inventory', JSON.stringify(this.state.inventory));
        localStorage.setItem('aquabook_medicine', JSON.stringify(this.state.medicineInventory));
        localStorage.setItem('aquabook_med_apps', JSON.stringify(this.state.medicineApplications));
        localStorage.setItem('aquabook_settings', JSON.stringify(this.state.settings));
    }
    
    async saveSettings() {
        localStorage.setItem('aquabook_settings', JSON.stringify(this.state.settings));
        if (this.currentUser) {
            await this.db.collection('users').doc(this.currentUser.uid).update({
                settings: this.state.settings
            });
        }
    }
    
    // ===== NOTIFICATIONS =====
    async enableNotifications() {
        if (!this.messaging) {
            this.showToast('Notifications not supported on this device.', 'error');
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                // IMPORTANT: Get your VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
                const vapidKey = "YOUR_VAPID_KEY_FROM_FIREBASE_CONSOLE"; 
                
                if (vapidKey.includes("YOUR_VAPID_KEY")) {
                    this.showToast("Dev Error: VAPID Key not configured!", "error");
                    console.error("MISSING VAPID KEY: Go to Firebase Console > Project Settings > Cloud Messaging > Web Push certificates");
                    return;
                }

                const token = await this.messaging.getToken({ vapidKey: vapidKey });
                
                if (token) {
                    this.state.fcmToken = token;
                    await this.saveDeviceToken(token);
                    this.showToast('Notifications enabled!', 'success');
                    this.updateNotificationUI(true);
                } else {
                    this.showToast('Failed to get token.', 'error');
                }
            } else {
                this.showToast('Permission denied.', 'warning');
            }
        } catch (error) {
            console.error('Notification error:', error);
            this.showToast('Error enabling notifications.', 'error');
        }
    }

    async saveDeviceToken(token) {
        if (!this.currentUser) return;
        await this.db.collection('users').doc(this.currentUser.uid).collection('fcmTokens').doc(token).set({
            token: token,
            createdAt: new Date().toISOString(),
            userAgent: navigator.userAgent
        });
    }

    updateNotificationUI(enabled) {
        const btn = document.getElementById('enableNotifBtn');
        const label = document.getElementById('notifEnabledBtn');
        if (btn && label) {
            btn.style.display = enabled ? 'none' : 'inline-block';
            label.style.display = enabled ? 'inline-block' : 'none';
        }
    }

    // ===== FEED RECOMMENDATION LOGIC =====
    calculateFeedRecommendation() {
        const today = this.currentDate;
        const yesterday = this.getFormattedDate(new Date(Date.now() - 86400000));
        
        // 1. Weather Check (High Priority)
        if (this.currentWeatherCode !== null && this.currentWeatherCode >= 50) {
            return {
                text: "🌧️ Weather Alert: Rain or overcast conditions detected. Dissolved Oxygen may drop.",
                action: "Reduce feed by 10-20% to prevent waste."
            };
        }

        // Get today's feed entries
        const todayEntries = this.state.feedEntries.filter(entry => entry.date === today);
        
        if (todayEntries.length === 0) {
            // No entries today, check yesterday
            const yesterdayEntries = this.state.feedEntries.filter(entry => entry.date === yesterday);
            
            if (yesterdayEntries.length === 0) {
                return null; // No data to base recommendation on
            }
            
            // Count empty trays from yesterday
            const emptyCount = yesterdayEntries.filter(entry => entry.trayResult === 'empty').length;
            
            if (emptyCount >= 2) {
                return {
                    text: "Yesterday, 2 or more feed trays were empty. Consider increasing feed by 5-10%.",
                    action: "Increase feed by 5-10% today"
                };
            }
        } else {
            // Analyze today's entries
            const emptyCount = todayEntries.filter(entry => entry.trayResult === 'empty').length;
            const tooMuchCount = todayEntries.filter(entry => entry.trayResult === 'too-much').length;
            
            if (emptyCount >= 2) {
                return {
                    text: `Today, ${emptyCount} feed trays were empty. Consider increasing feed.`, 
                    action: "Increase next feed by 5-10%"
                };
            }
            
            if (tooMuchCount >= 1) {
                return {
                    text: `Today, ${tooMuchCount} feed tray had too much feed. Consider decreasing feed.`, 
                    action: "Decrease next feed by 5-10%"
                };
            }
        }
        
        return null;
    }

    showFeedRecommendation() {
        const recommendation = this.calculateFeedRecommendation();
        const container = document.getElementById('feedRecommendation');
        
        if (recommendation) {
            document.getElementById('recommendationText').textContent = recommendation.text;
            document.getElementById('recommendationAction').textContent = recommendation.action;
            container.classList.add('show');
        } else {
            container.classList.remove('show');
        }
    }

    // ===== RENDERING =====
    renderAll() {
        this.updateFarmSelector();
        this.renderFarmsList();
        this.renderOverallStats();
        this.renderLogBook();
        this.renderPrices();
        this.checkPendingTrays();
        this.renderFeedTrendChart();
        this.renderInventorySummary();
    }
    
    // ===== WEATHER WIDGET =====
    initWeather() {
        const weatherWidget = document.getElementById('weatherWidget');
        if (!weatherWidget) return;

        // Optimization: Check Cache (1 hour validity)
        const cached = localStorage.getItem('aquabook_weather');
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < 3600000) { // 1 hour
                    this.renderWeatherWidget(data, weatherWidget);
                    return;
                }
            } catch(e) { localStorage.removeItem('aquabook_weather'); }
        }

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                try {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    // Using Open-Meteo (Free, no API key required)
                    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                    const data = await response.json();
                    localStorage.setItem('aquabook_weather', JSON.stringify({ data, timestamp: Date.now() }));
                    this.renderWeatherWidget(data, weatherWidget);
                } catch (e) {
                    console.error("Weather fetch failed", e);
                }
            }, (err) => {
                console.log("Geolocation denied or error", err);
            });
        }
    }

    renderWeatherWidget(data, widget) {
        if (data.current_weather) {
            this.currentWeatherCode = data.current_weather.weathercode;
            document.getElementById('weatherTemp').textContent = `${Math.round(data.current_weather.temperature)}°`;
            document.getElementById('weatherCondition').textContent = this.getWeatherCondition(data.current_weather.weathercode);
            document.getElementById('weatherLoc').textContent = "Local Farm";
            document.getElementById('weatherAdvice').innerHTML = `<i class="fas fa-info-circle"></i> ${this.getWeatherAdvice(data.current_weather.weathercode)}`;
            widget.style.display = 'flex';
        }
    }

    getWeatherCondition(code) {
        if (code === 0) return "Clear Sky";
        if (code < 3) return "Partly Cloudy";
        if (code < 50) return "Foggy";
        if (code < 80) return "Rainy";
        return "Stormy";
    }

    getWeatherAdvice(code) {
        if (code > 60) return "Rain expected. Monitor O2.";
        if (code === 0) return "Sunny. Check plankton.";
        return "Conditions stable.";
    }

    setupUI() {
        document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Check notification permission status on load
        if (Notification.permission === 'granted') {
            this.updateNotificationUI(true);
        } else {
            this.updateNotificationUI(false);
        }
    }
    
    renderOverallStats() {
        // Remove skeleton loading state
        document.querySelectorAll('.overall-stats .stat-card').forEach(el => el.classList.remove('loading'));

        const currentFarmId = this.state.settings.currentFarmId;

        // Filter tanks and entries by the current farm
        const farmTanks = currentFarmId ? this.state.tanks.filter(t => t.farmId === currentFarmId) : [];
        const farmTankIds = farmTanks.map(t => t.id);
        const farmFeedEntries = currentFarmId ? this.state.feedEntries.filter(e => farmTankIds.some(id => id == e.tankId)) : [];

        document.getElementById('totalTanks').textContent = farmTanks.length;

        const totalFeed = farmFeedEntries.reduce((sum, entry) => sum + entry.amount, 0);
        document.getElementById('totalFeed').innerHTML = `${totalFeed.toFixed(1)} <span class="unit">kg</span>`;

        const todayFeed = farmFeedEntries
            .filter(e => e.date === this.currentDate)
            .reduce((sum, e) => sum + e.amount, 0);
        document.getElementById('feedToday').innerHTML = `${todayFeed.toFixed(1)} <span class="unit">kg</span>`;

        const totalBiomass = farmTanks.reduce((sum, tank) => sum + (tank.biomass || 0), 0);
        document.getElementById('totalBiomass').innerHTML = `${totalBiomass.toFixed(1)} <span class="unit">kg</span>`;

        const farmHarvests = currentFarmId ? this.state.harvests.filter(h => h.farmId === currentFarmId) : [];
        const totalHarvested = farmHarvests.reduce((sum, h) => sum + h.weight, 0);
        const totalProduction = totalBiomass + totalHarvested;
        const avgFCR = totalProduction > 0 ? (totalFeed / totalProduction).toFixed(2) : '0.00';
        document.getElementById('avgFCR').textContent = avgFCR;

        // Feed Waste % (based on tray results)
        // Considering 'half' and 'too-much' as waste events
        const validChecks = farmFeedEntries.filter(e => ['empty', 'little', 'half', 'too-much'].includes(e.trayResult));
        const wasteChecks = validChecks.filter(e => ['half', 'too-much'].includes(e.trayResult));
        const wastePctVal = validChecks.length > 0 ? ((wasteChecks.length / validChecks.length) * 100) : 0;
        const wastePct = wastePctVal.toFixed(1);
        const feedWasteEl = document.getElementById('feedWaste');
        feedWasteEl.innerHTML = `${wastePct}<span class="unit">%</span>`;

        if (wastePctVal <= 10) feedWasteEl.style.color = 'var(--success)';
        else if (wastePctVal <= 20) feedWasteEl.style.color = 'var(--warning)';
        else feedWasteEl.style.color = 'var(--danger)';
    }
    
    renderInventorySummary() {
        const feedStock = this.state.inventory.totalKg || 0;
        document.getElementById('displayFeedStock').innerHTML = `${feedStock.toFixed(1)} <span class="unit">kg</span>`;
        document.getElementById('displayMedStock').innerHTML = `${this.state.medicineInventory.length} <span class="unit">Items</span>`;
    }

    renderFeedTrendChart() {
        const ctx = document.getElementById('feedTrendChart');
        if (!ctx) return;

        // Check if Chart.js is loaded (prevents crash if offline)
        if (typeof Chart === 'undefined') {
            ctx.parentElement.innerHTML = '<div class="text-center text-muted" style="padding: 40px;">Chart unavailable (Offline)</div>';
            return;
        }

        const currentFarmId = this.state.settings.currentFarmId;
        const farmTankIds = currentFarmId ? this.state.tanks.filter(t => t.farmId === currentFarmId).map(t => t.id) : [];

        // Prepare data: Last 30 days
        const labels = [];
        const dataPoints = [];
        const today = new Date();
        
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateStr = this.getFormattedDate(d);
            labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
            
            // Sum feed for this date
            let entriesToSum = this.state.feedEntries.filter(e => e.date === dateStr);
            if (currentFarmId) {
                entriesToSum = entriesToSum.filter(e => farmTankIds.some(id => id == e.tankId));
            }

            const dayFeed = entriesToSum.reduce((sum, e) => sum + e.amount, 0);
            dataPoints.push(dayFeed);
        }

        // Destroy existing chart if it exists
        if (this.feedChart) this.feedChart.destroy();

        this.feedChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Feed (kg)',
                    data: dataPoints,
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: '30-Day Feed Consumption Trend',
                        align: 'start',
                        font: { size: 16, weight: 'bold' },
                        padding: { bottom: 15 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { borderDash: [2, 4] }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 10 }
                    }
                }
            }
        });
    }

    renderFarmsList() {
        const container = document.getElementById('farmsList');
        const headerContainer = document.getElementById('farmHeaderContainer');
        container.innerHTML = '';
        if (headerContainer) headerContainer.innerHTML = '';
        
        if (this.state.farms.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-water"></i>
                <h3>No Farms Found</h3>
                <p>Add your first farm to start tracking.</p>
                <button class="btn btn-primary mt-20" onclick="app.openFarmModal()">
                    <i class="fas fa-plus"></i> Add Farm
                </button>
            </div>`;
            return;
        }

        const currentFarmId = this.state.settings.currentFarmId;
        let farmToRender = this.state.farms.find(f => f.id === currentFarmId);

        if (!farmToRender && this.state.farms.length > 0) {
            // If selected farm doesn't exist (e.g. deleted), default to first one
            farmToRender = this.state.farms[0];
            this.state.settings.currentFarmId = farmToRender.id;
            this.saveSettings();
            this.updateFarmSelector();
        }

        if (!farmToRender) {
            // Still no farm, something is wrong, or there are no farms.
            return;
        }

        // Render only the selected farm
        const farm = farmToRender;
        const farmTanks = this.state.tanks.filter(tank => tank.farmId === farm.id);
        
        // Render Header at the top
        if (headerContainer) {
            headerContainer.innerHTML = `
                <div class="farm-header" style="border: 2px solid var(--border); border-radius: var(--radius);">
                    <div class="farm-name">
                        <i class="fas fa-tractor"></i>
                        ${farm.name}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="farm-stats">
                            <div class="farm-stat">
                                <span class="farm-stat-value">${farmTanks.length}</span>
                                Tanks
                            </div>
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="app.editFarm('${farm.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="app.openTankModal('${farm.id}')">
                            <i class="fas fa-plus"></i> Add Tank
                        </button>
                    </div>
                </div>
            `;
        }

        // Render Tanks Grid at the bottom
        container.innerHTML = `
            <div class="tanks-grid" style="padding: 0;">
                ${farmTanks.map(tank => this.getTankCardHTML(tank)).join('')}
            </div>
        `;
    }

    getTankCardHTML(tank) {
        const doc = Math.floor((new Date() - new Date(tank.stockingDate)) / (1000 * 60 * 60 * 24));
        const isInactive = tank.status === 'inactive';
        const status = doc > 75 ? 'danger' : doc > 50 ? 'warning' : 'good';
        
        // Feed calculations
        const allTankEntries = this.state.feedEntries.filter(e => e.tankId === tank.id);
        const totalFeed = allTankEntries.reduce((sum, e) => sum + e.amount, 0);
        
        const todayEntries = allTankEntries.filter(e => e.date === this.currentDate);
        const todayFeed = todayEntries.reduce((sum, e) => sum + e.amount, 0);

        // FCR Calculation
        const currentBiomass = tank.biomass || 1; // Avoid div by zero
        const estimatedFCR = (totalFeed / currentBiomass).toFixed(2);

        // Tray Analysis for Remarks
        const totalFeedsToday = todayEntries.length;
        const notCompleted = todayEntries.filter(e => e.trayResult !== 'empty').length;
        
        let remarks = "No feeds recorded today";
        let remarksColor = "var(--gray)";
        
        if (totalFeedsToday > 0) {
            if (notCompleted > 0) {
                remarks = `Out of ${totalFeedsToday} feeds, ${notCompleted} trays not completed: <b>Reduce Feed</b>`;
                remarksColor = "var(--danger)";
            } else {
                remarks = `All ${totalFeedsToday} feeds completed: <b>Good Appetite</b>`;
                remarksColor = "var(--success)";
            }
        }

        // Last tray status
        const lastEntry = todayEntries.length > 0 ? todayEntries[todayEntries.length - 1] : null;
        const lastTrayStatus = lastEntry ? lastEntry.trayResult : 'N/A';

        const currentStock = tank.currentSeed || tank.initialSeed || 0;

        // Get last feed status for visual indicator
        const tankEntries = this.state.feedEntries
            .filter(e => e.tankId === tank.id)
            .sort((a, b) => b.id - a.id);
        
        let statusDot = '';
        if (tankEntries.length > 0) {
            const last = tankEntries[0];
            let statusClass = 'status-good';
            if (last.trayResult === 'too-much') statusClass = 'status-bad';
            else if (last.trayResult === 'half' || last.trayResult === 'little') statusClass = 'status-warn';
            statusDot = `<div class="tank-feed-status ${statusClass}" title="Last Feed: ${last.trayResult}"></div>`;
        }

        // GAP 3: Reason Badge Logic
        let reasonBadge = '';
        if (tank.feedAdjustmentReason) {
            reasonBadge = `<div style="font-size: 10px; background: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 2px; border: 1px solid #ffcdd2;">
                <i class="fas fa-exclamation-circle"></i> ${tank.feedAdjustmentReason} (${tank.feedAdjustmentPct}%)
            </div>`;
        }

        return `
            <div class="tank-summary-card ${status} ${isInactive ? 'inactive' : ''}" onclick="app.openTankDetail('${tank.id}')">
                ${statusDot}
                <div class="tank-summary-header">
                    <div class="tank-summary-name">
                        ${tank.name}
                        ${reasonBadge ? '<br>' + reasonBadge : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="tank-summary-doc">DOC: ${doc}</div>
                        <div class="tank-action-menu">
                            <button class="tank-menu-btn" onclick="app.toggleTankMenu('${tank.id}'); event.stopPropagation();">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <div class="tank-menu-dropdown" id="tank-menu-${tank.id}">
                                <button class="tank-menu-item" onclick="app.editTank('${tank.id}'); event.stopPropagation();">
                                    <i class="fas fa-edit"></i> Edit Tank
                                </button>
                                <button class="tank-menu-item delete" onclick="app.openDeleteTankConfirmation('${tank.id}'); event.stopPropagation();">
                                    <i class="fas fa-trash"></i> Delete Tank
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 12px; color: var(--gray);">
                    <div>Size: <span style="color: var(--dark); font-weight: 600;">${tank.size || '-'} ac</span></div>
                    <div>Est. Stock: <span style="color: var(--dark); font-weight: 600;">${currentStock.toLocaleString()}</span></div>
                    <div>Trays: <span style="color: var(--dark); font-weight: 600;">${tank.checkTrays || 2}</span></div>
                </div>
                <div class="tank-summary-stats">
                    <div class="tank-summary-stat">
                        <span class="tank-summary-label">Feed Today</span>
                        <span class="tank-summary-value">${todayFeed.toFixed(1)} kg</span>
                    </div>
                    <div class="tank-summary-stat">
                        <span class="tank-summary-label">Total Feed</span>
                        <span class="tank-summary-value">${totalFeed.toFixed(1)} kg</span>
                    </div>
                </div>

                <div style="margin-top: 12px; font-size: 12px; color: var(--gray); border-top: 1px solid #eee; padding-top: 8px;">
                    Biomass: <span style="color: var(--dark); font-weight: 600;">${(tank.biomass || 0).toFixed(0)} kg</span> • FCR: <span style="color: var(--primary); font-weight: 600;">${estimatedFCR}</span>
                </div>
            </div>
        `;
    }

    getFeedSlotIndex(timestamp, feedsPerDay) {
        const hour = new Date(parseInt(timestamp)).getHours();
        if (feedsPerDay === 1) return 0;
        if (feedsPerDay === 2) return hour < 14 ? 0 : 1;
        if (feedsPerDay === 3) {
            if (hour < 11) return 0;
            return hour < 16 ? 1 : 2;
        }
        // Default 4 (Standard: 6-10, 10-14, 14-18, 18-22)
        if (hour < 10) return 0;
        if (hour < 14) return 1;
        if (hour < 18) return 2;
        return 3;
    }

    renderLogBook() {
        const tableHead = document.querySelector('#logTable thead');
        const tableBody = document.getElementById('logTableBody');
        const tableFoot = document.getElementById('logTableFoot');
        const emptyState = document.getElementById('emptyLog');
        const tableContainer = document.querySelector('.log-table-container') || document.getElementById('logTable').parentElement;
        const feedsCount = this.state.settings.feedsPerDay || 4;
        const toggleBtn = document.getElementById('toggleViewBtn');

        // Update Toggle Button Text
        if (toggleBtn) toggleBtn.innerHTML = this.logViewType === 'matrix' ? '<i class="fas fa-list"></i>' : '<i class="fas fa-th"></i>';

        // Generate Feed Labels
        let feedLabels = [];
        if (feedsCount === 1) feedLabels = ['Daily'];
        else if (feedsCount === 2) feedLabels = ['Morning', 'Evening'];
        else if (feedsCount === 3) feedLabels = ['Morning', 'Afternoon', 'Evening'];
        else if (feedsCount === 4) feedLabels = ['Morning', 'Afternoon', 'Evening', 'Night'];
        else feedLabels = Array.from({length: feedsCount}, (_, i) => `Feed ${i+1}`);

        // Generate Table Header
        let headerHTML = `<tr>`;
        headerHTML += `<th>${(this.viewMode === 'today' || this.viewMode === 'yesterday') ? 'Pond' : 'Date'}</th>`;
        for(let i=0; i<6; i++) {
            if (i < feedsCount) {
                headerHTML += `<th>${feedLabels[i] || 'Feed '+(i+1)}</th>`;
            }
        }
        headerHTML += `</tr>`;
        tableHead.innerHTML = headerHTML;
        
        // Filter tanks based on current farm
        let tanksToShow = this.state.tanks.filter(t => t.status !== 'inactive');
        if (this.state.settings.currentFarmId) {
            tanksToShow = tanksToShow.filter(t => t.farmId === this.state.settings.currentFarmId);
        }

        if (tanksToShow.length === 0) {
            tableBody.innerHTML = '';
            emptyState.style.display = 'block';
            // Update empty state for No Tanks
            emptyState.querySelector('h3').textContent = 'No Tanks Found';
            emptyState.querySelector('p').textContent = 'Add a tank to start logging feed.';
            const btn = document.getElementById('addFirstEntry');
            btn.innerHTML = '<i class="fas fa-plus"></i> Add Tank';
            return;
        }
        emptyState.style.display = 'none';
        tableBody.innerHTML = '';

        // Determine Date Range
        const today = new Date();
        let startDate, endDate;
        
        if (this.viewMode === 'today') {
            startDate = this.getFormattedDate(today);
            endDate = startDate;
        } else if (this.viewMode === 'yesterday') {
            const y = new Date(today); y.setDate(y.getDate() - 1);
            startDate = this.getFormattedDate(y);
            endDate = startDate;
        } else if (this.viewMode === '7days') {
            const d = new Date(today); d.setDate(d.getDate() - 6);
            startDate = this.getFormattedDate(d);
            endDate = this.getFormattedDate(today);
        } else if (this.viewMode === '30days') {
            const d = new Date(today); d.setDate(d.getDate() - 29);
            startDate = this.getFormattedDate(d);
            endDate = this.getFormattedDate(today);
        } else { // 'all'
            startDate = '2000-01-01';
            endDate = this.getFormattedDate(today);
        }

        // Helper to check if date is in range
        const isDateInRange = (d) => d >= startDate && d <= endDate;

        // Branch to List View if selected
        if (this.logViewType === 'list') {
            this.renderLogTimeline(tableContainer, tanksToShow, isDateInRange); // Pass container
            return;
        }

        // Render Logic
        if (this.viewMode === 'today' || this.viewMode === 'yesterday') {
            // COMPACT VIEW (Rows = Tanks)
            const dateStr = startDate;
            const colTotals = [0, 0, 0, 0, 0, 0];
            let grandTotal = 0;

            tanksToShow.forEach(tank => {
                const farm = this.getFarmById(tank.farmId);
                const entries = this.state.feedEntries
                    .filter(e => e.tankId == tank.id && e.date === dateStr);
                
                const slots = new Array(feedsCount).fill(null);
                entries.forEach(e => {
                    const slotIdx = this.getFeedSlotIndex(e.id, feedsCount);
                    if (slotIdx < feedsCount) slots[slotIdx] = e;
                });

            const total = entries.reduce((sum, e) => sum + e.amount, 0);
            grandTotal += total;

            // Helper to generate cell HTML
            const getCell = (index) => {
                if (slots[index]) {
                    const e = slots[index];
                    colTotals[index] += e.amount;
                    
                    let badgeClass = 'unknown';
                    let badgeText = e.trayResult.charAt(0).toUpperCase() + e.trayResult.slice(1);
                    if (e.trayResult === 'too-much') badgeText = 'Too Much';

                    if (e.trayResult === 'empty') { badgeClass = 'empty'; } 
                    else if (e.trayResult === 'little') { badgeClass = 'little'; } 
                    else if (e.trayResult === 'half') { badgeClass = 'half'; } 
                    else if (e.trayResult === 'too-much') { badgeClass = 'too-much'; } 
                    else if (e.trayResult === 'pending') { badgeClass = 'pending'; }

                    // Supplements in tooltip
                    const suppTitle = (e.supplements && e.supplements.length > 0) ? `Supplements: ${e.supplements.join(', ')}` : '';

                    let trayHTML;
                    if (e.trayResults && e.trayResults.length > 1) {
                        trayHTML = e.trayResults.map(res => {
                            let badgeClass = 'unknown';
                            let badgeText = res.charAt(0).toUpperCase();
                            if (res === 'empty') badgeClass = 'empty';
                            else if (res === 'little') badgeClass = 'little';
                            else if (res === 'half') badgeClass = 'half';
                            else if (res === 'too-much') { badgeClass = 'too-much'; badgeText = 'W'; } // Waste indicator
                            else if (res === 'pending') badgeClass = 'pending';
                            return `<span class="log-status ${badgeClass}" style="padding: 2px 6px; font-size: 10px;" title="${res}">${badgeText}</span>`;
                        }).join('');
                        trayHTML = `<div style="display:flex; gap:3px; justify-content:center; margin-top:4px;">${trayHTML}</div>`;
                    } else {
                        // Fallback to old trayResult
                        let badgeClass = 'unknown';
                        let badgeText = e.trayResult.charAt(0).toUpperCase() + e.trayResult.slice(1);
                        if (e.trayResult === 'too-much') badgeText = 'Too Much';
                        if (e.trayResult === 'empty') badgeClass = 'empty';
                        else if (e.trayResult === 'little') badgeClass = 'little';
                        else if (e.trayResult === 'half') badgeClass = 'half';
                        else if (e.trayResult === 'too-much') badgeClass = 'too-much';
                        else if (e.trayResult === 'pending') badgeClass = 'pending';
                        trayHTML = `<span class="log-status ${badgeClass}">${badgeText}</span>`;
                    }

                    return `
                        <div onclick="app.editFeedEntry(${e.id})" title="${suppTitle}" style="cursor:pointer; width:100%;">
                            <div class="log-feed-value">${e.amount} kg</div>
                            ${trayHTML}
                        </div> 
                    `;
                }
                return ``;
            };

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div class="log-pond-name">${tank.name}</div>
                            <div class="log-farm-name">${farm ? farm.name : ''}</div>
                        </div>
                    </div>
                </td>
                ${Array.from({length: feedsCount}, (_, i) => `<td data-label="${feedLabels[i]}">${getCell(i)}</td>`).join('')}
            `;
            tableBody.appendChild(row);
        });

        // Add Footer Row
        const totalRow = document.createElement('tr');
        totalRow.innerHTML = `
            <td>TOTAL</td>
            ${Array.from({length: feedsCount}, (_, i) => `<td>${colTotals[i] > 0 ? colTotals[i].toFixed(1) : ''}</td>`).join('')}
        `;
        tableFoot.innerHTML = '';
        tableFoot.appendChild(totalRow);

        } else { // DETAILED VIEW (Grouped by Tank, Rows = Dates)
            tanksToShow.forEach(tank => {
                // Filter entries for this tank in range
                const tankEntries = this.state.feedEntries
                    .filter(e => e.tankId == tank.id && isDateInRange(e.date));
                
                if (tankEntries.length === 0) return;

                // Section Header
                const headerRow = document.createElement('tr');
                headerRow.innerHTML = `<td colspan="${feedsCount + 1}" style="background:#e3f2fd; font-weight:700; color:var(--primary-dark);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${tank.name}</span>
                    </div>
                </td>`;
                tableBody.appendChild(headerRow);

                // Group by Date
                const entriesByDate = {};
                tankEntries.forEach(e => {
                    if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
                    entriesByDate[e.date].push(e);
                });

                // Sort dates descending
                const sortedDates = Object.keys(entriesByDate).sort().reverse();

                sortedDates.forEach(date => {
                    const entries = entriesByDate[date];
                    
                    const slots = new Array(feedsCount).fill(null);
                    entries.forEach(e => {
                        const slotIdx = this.getFeedSlotIndex(e.id, feedsCount);
                        if (slotIdx < feedsCount) slots[slotIdx] = e;
                    });

                    const total = entries.reduce((sum, e) => sum + e.amount, 0);
                    
                    // Helper to get cell (similar to above but simplified)
                    const getCell = (index) => {
                        if (slots[index]) {
                            const e = slots[index];
                            let badgeClass = 'unknown';
                            let badgeText = e.trayResult;
                            if (e.trayResult === 'too-much') badgeText = 'Too Much';

                            // Supplements in tooltip for consistency
                            const suppTitle = (e.supplements && e.supplements.length > 0) ? `Supplements: ${e.supplements.join(', ')}` : '';

                            if (e.trayResult === 'empty') badgeClass = 'empty';
                            else if (e.trayResult === 'little') badgeClass = 'little';
                            else if (e.trayResult === 'half') badgeClass = 'half';
                            else if (e.trayResult === 'too-much') badgeClass = 'too-much';
                            else if (e.trayResult === 'pending') badgeClass = 'pending';
                            
                            // Supplements display
                            let suppHTML = '';
                            if (e.supplements && e.supplements.length > 0) {
                                suppHTML = `<div style="margin-top:4px; display:flex; flex-wrap:wrap; justify-content:center; gap:2px;">${e.supplements.map(s => `<span style="font-size:9px; color:#1565c0; background:#e3f2fd; padding:1px 4px; border-radius:4px; white-space:nowrap;">${s}</span>`).join('')}</div>`;
                            }

                            return `
                                <div onclick="app.editFeedEntry(${e.id})" title="${suppTitle}" style="cursor:pointer; width:100%;">
                                    <div class="log-feed-value">${e.amount} kg</div>
                                    <span class="log-status ${badgeClass}">${badgeText}</span>
                                    ${suppHTML}
                                </div>
                            `;
                        }
                        return ``;
                    };

                    const row = document.createElement('tr');
                    // Format date nicely
                    const dateObj = new Date(date);
                    const dateDisplay = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

                    row.innerHTML = `
                        <td>
                            <div class="log-pond-name" style="font-weight:500;">${dateDisplay}</div>
                        </td>
                        ${Array.from({length: feedsCount}, (_, i) => `<td data-label="${feedLabels[i]}">${getCell(i)}</td>`).join('')}
                    `;
                    tableBody.appendChild(row);
                });
            });
            tableFoot.innerHTML = ''; // No footer for detailed view
        }
        
        this.renderLogbookFooter(tableContainer);
    }

    renderLogTimeline(container, tanks, dateFilterFn) {
        // When switching to list view, we need to clear the table container and append the timeline
        // The container passed here is the parent of the table
        const parent = document.querySelector('.log-table-container');
        parent.innerHTML = '';
        
        // 1. Gather all relevant entries
        let allEntries = [];
        tanks.forEach(tank => {
            const entries = this.state.feedEntries.filter(e => e.tankId == tank.id && dateFilterFn(e.date));
            entries.forEach(e => e._tankName = tank.name);
            allEntries = allEntries.concat(entries);
        });

        if (allEntries.length === 0) {
            document.getElementById('emptyLog').style.display = 'block';
            return;
        }
        document.getElementById('emptyLog').style.display = 'none';

        // 2. Sort by ID desc (newest first)
        allEntries.sort((a, b) => b.id - a.id);

        // 3. Render Individual Cards
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'timeline-container';

        allEntries.forEach(entry => {
            const dateDisplay = new Date(entry.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
            
            // Tray Badge Logic
            let badgeColor = 'var(--gray)';
            let badgeBg = '#f5f5f5';
            let label = entry.trayResult ? entry.trayResult.charAt(0).toUpperCase() + entry.trayResult.slice(1) : 'Unknown';
            
            if (entry.trayResult === 'empty') { badgeColor = 'var(--success)'; badgeBg = '#e8f5e8'; } 
            else if (entry.trayResult === 'little') { badgeColor = 'var(--warning)'; badgeBg = '#fff3e0'; } 
            else if (entry.trayResult === 'half') { badgeColor = '#ff9800'; badgeBg = '#fff3e0'; } 
            else if (entry.trayResult === 'too-much') { badgeColor = 'var(--danger)'; badgeBg = '#ffebee'; label = 'Waste'; } 
            else if (entry.trayResult === 'pending') { badgeColor = 'var(--gray)'; badgeBg = '#f5f5f5'; label = 'Pending'; }

            const trayBadge = `<span style="padding:4px 8px; border-radius:12px; font-size:11px; font-weight:600; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeColor}; white-space:nowrap;">${label}</span>`;

            // Risk Badge
            let riskBadge = '';
            if (entry.riskLevel) {
                const riskClass = entry.riskLevel === 'Action Required' ? 'risk-action' : entry.riskLevel === 'Watch' ? 'risk-watch' : 'risk-normal';
                riskBadge = `<span class="risk-badge ${riskClass}">${entry.riskLevel}</span>`;
            }

            // Observations Summary
            let obsSummary = '';
            if (entry.observations && entry.observations.length > 0) {
                // Map IDs back to labels if possible, or just use ID
                const obsLabels = entry.observations.map(obsId => this.getObservationLabel(obsId)).join(', ');
                obsSummary = `<div style="font-size:11px; color:var(--dark); margin-top:6px; line-height:1.4;"><i class="fas fa-clipboard-check" style="color:var(--gray); margin-right:4px;"></i> ${obsLabels}</div>`;
            }

            const card = document.createElement('div');
            card.className = 'timeline-card';
            card.style.padding = '12px';
            
            // Status border
            if (entry.trayResult === 'too-much' || entry.trayResult === 'half') card.classList.add('warning');
            if (entry.trayResult === 'too-much') card.classList.add('danger');

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div style="font-weight:700; font-size:15px; color:var(--dark);">${entry._tankName}</div>
                        <div style="font-size:12px; color:var(--gray); margin-top:2px;">${dateDisplay} • ${entry.time}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:800; font-size:18px; color:var(--primary);">${entry.amount} kg</div>
                    </div>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                    <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                        ${entry.supplements && entry.supplements.length > 0 ? 
                            entry.supplements.map(s => `<span style="background:#e3f2fd; color:var(--primary-dark); font-size:10px; padding:3px 8px; border-radius:10px; font-weight:600;"><i class="fas fa-flask"></i> ${s}</span>`).join('') 
                            : '<span style="font-size:11px; color:var(--gray); font-style:italic;">No supplements</span>'}
                        ${riskBadge}
                    </div>
                    ${trayBadge}
                </div>
                ${obsSummary}
            `;
            
            card.onclick = () => app.editFeedEntry(entry.id);
            card.style.cursor = 'pointer';
            
            timelineContainer.appendChild(card);
        });
        
        parent.appendChild(timelineContainer);
        this.renderLogbookFooter(parent);
    }

    renderLogbookFooter(container) {
        // Remove existing button if any
        const existingFooter = document.getElementById('logbookFooter');
        if (existingFooter) existingFooter.remove();
        // Legacy cleanup
        const oldBtn = document.getElementById('loadMoreLogBtn');
        if (oldBtn) oldBtn.remove();

        const footer = document.createElement('div');
        footer.id = 'logbookFooter';
        footer.style.marginTop = '15px';
        footer.style.marginBottom = '20px';
        footer.style.display = 'flex';
        footer.style.flexDirection = 'column';
        footer.style.gap = '10px';

        // Only show if we have data and view is appropriate
        if (this.state.feedEntries.length > 0 && (this.viewMode === 'all' || this.viewMode === '30days')) {
            const loadBtn = document.createElement('button');
            loadBtn.id = 'loadMoreLogBtn';
            loadBtn.className = 'btn btn-secondary';
            loadBtn.style.width = '100%';
            loadBtn.innerHTML = '<i class="fas fa-history"></i> Load Older Data (30 Days)';
            loadBtn.onclick = () => this.loadOlderData();
            footer.appendChild(loadBtn);
        }

        // Export CSV Button
        if (this.state.feedEntries.length > 0) {
            const exportBtn = document.createElement('button');
            exportBtn.className = 'btn btn-secondary';
            exportBtn.style.width = '100%';
            exportBtn.style.background = '#fff';
            exportBtn.style.color = 'var(--primary)';
            exportBtn.style.border = '1px solid var(--primary)';
            exportBtn.innerHTML = '<i class="fas fa-file-csv"></i> Export to CSV';
            exportBtn.onclick = () => this.exportLogbookToCSV();
            footer.appendChild(exportBtn);
        }

        if (footer.children.length > 0) {
            container.appendChild(footer);
        }
    }
    
    getObservationLabel(id) {
        for (const cat in this.OBSERVATION_CONFIG) {
            const found = this.OBSERVATION_CONFIG[cat].options.find(opt => opt.id === id);
            if (found) return found.label;
        }
        // Fallback for legacy or direct strings
        return id.replace(/_/g, ' ');
    }

    checkPendingTrays() {
        const currentFarmId = this.state.settings.currentFarmId;
        if (!currentFarmId) return;
        
        const farmTanks = this.state.tanks.filter(t => t.farmId === currentFarmId).map(t => t.id);
        const pending = this.state.feedEntries.filter(e => farmTanks.includes(String(e.tankId)) && e.trayResult === 'pending');
        
        const banner = document.getElementById('pendingChecksBanner');
        if (banner) banner.style.display = pending.length > 0 ? 'flex' : 'none';
    }

    setViewMode(mode) {
        this.viewMode = mode;
        document.querySelectorAll('.range-tab').forEach(t => {
            if (t.dataset.range === mode) t.classList.add('active');
            else t.classList.remove('active');
        });
        this.renderLogBook();
    }

    toggleLogView() {
        this.logViewType = this.logViewType === 'matrix' ? 'list' : 'matrix';
        this.renderLogBook();
    }

    setupEventListeners() {
        // Screen navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchScreen(btn.dataset.screen));
        });

        // Farm Selector
        document.getElementById('farmSelector').addEventListener('click', () => {
            this.openFarmSelector();
        });

        document.getElementById('addFarmFromSelector').addEventListener('click', () => {
            this.openFarmModal();
        });
        
        // Close Modals
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        // Save Farm
        document.getElementById('saveFarmBtn').addEventListener('click', () => this.saveFarm());

        // Save Tank
        document.getElementById('saveTankBtn').addEventListener('click', () => this.saveTank());
        
        // Add Log Entry
        const startFeedRoundBtn = document.getElementById('startFeedRoundBtn');
        if (startFeedRoundBtn) startFeedRoundBtn.addEventListener('click', () => this.openFeedRoundModal());
        
        document.getElementById('addFirstEntry').addEventListener('click', () => {
            const currentFarmId = this.state.settings.currentFarmId;
            const tanks = this.state.tanks.filter(t => t.farmId === currentFarmId);
            if (tanks.length === 0) {
                this.openTankModal(currentFarmId);
            } else {
                this.openFeedRoundModal();
            }
        });
        
        // Log Range Tabs
        document.querySelectorAll('.range-tab').forEach(tab => {
            tab.addEventListener('click', () => this.setViewMode(tab.dataset.range));
        });
        
        // Inventory
        document.getElementById('saveStockBtn').addEventListener('click', () => this.saveStock());

        // Edit Feed Modal Buttons
        document.getElementById('updateFeedBtn').addEventListener('click', () => this.updateFeedEntry());
        document.getElementById('deleteFeedBtn').addEventListener('click', () => this.deleteCurrentFeedEntry());

        // Price Calculator
        document.getElementById('calculateHarvest').addEventListener('click', () => this.calculateHarvestValue());

        // Close menus on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tank-action-menu')) {
                document.querySelectorAll('.tank-menu-dropdown').forEach(el => el.classList.remove('show'));
            }
        });

        // These are inside a modal that gets re-rendered, so direct listeners are tricky.
        // Using event delegation or inline onclick is better. I've used inline onclick.
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            const closeBtn = modal.querySelector('.close-modal');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeAllModals());
            }
        });
    }

    // ===== SESSION TRACKING =====
    setupSessionTracking() {
        const update = () => {
            const now = Date.now();
            const last = localStorage.getItem('aquabook_last_activity');
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;

            // Check if session expired while app was open
            if (last && (now - parseInt(last) > thirtyDays)) {
                if (this.currentUser) {
                    this.auth.signOut();
                    this.showToast("Session expired due to inactivity.", "warning");
                }
                return;
            }

            // Throttle updates to once per minute
            if (!this.lastActivityUpdate || (now - this.lastActivityUpdate > 60000)) {
                localStorage.setItem('aquabook_last_activity', now.toString());
                this.lastActivityUpdate = now;
            }
        };
        
        ['click', 'touchstart', 'keydown', 'scroll'].forEach(evt => 
            document.addEventListener(evt, update, { passive: true })
        );
        
        // Initialize if missing
        if (!localStorage.getItem('aquabook_last_activity')) {
            localStorage.setItem('aquabook_last_activity', Date.now().toString());
        }
    }

    // ===== UTILITY FUNCTIONS =====
    getFormattedDate(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ===== MISSING METHODS IMPLEMENTATION =====
    
    showLoading(show) {
        const loader = document.getElementById('loading');
        if (show) loader.classList.add('active');
        else loader.classList.remove('active');
    }

    showToast(message, type = 'success') {
        const toast = type === 'error' ? document.getElementById('errorToast') : document.getElementById('successToast');
        const msgSpan = toast.querySelector('span');
        msgSpan.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    switchScreen(screenName) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${screenName}Screen`).classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.screen === screenName) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (screenName === 'water') {
            this.renderWaterScreen();
        }
    }

    updateFarmSelector() {
        const selector = document.getElementById('currentFarmName');
        if (this.state.farms.length > 0) {
            const currentFarm = this.state.settings.currentFarmId 
                ? this.state.farms.find(f => f.id === this.state.settings.currentFarmId) 
                : this.state.farms[0];
            
            if (currentFarm) {
                selector.textContent = currentFarm.name;
                this.state.settings.currentFarmId = currentFarm.id;
                this.saveSettings();
            }
        } else {
            selector.textContent = "Select Farm";
        }
    }

    getTankById(id) {
        return this.state.tanks.find(t => t.id == id);
    }

    getFarmById(id) {
        return this.state.farms.find(f => f.id == id);
    }

    // Modals
    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }

    openFarmModal() {
        this.editingFarmId = null;
        document.getElementById('farmNameInput').value = '';
        document.getElementById('farmLocation').value = '';
        document.getElementById('farmContact').value = '';
        document.getElementById('farmPhone').value = '';
        document.getElementById('farmLat').value = '';
        document.getElementById('farmLng').value = '';
        document.getElementById('deleteFarmBtn').style.display = 'none';
        document.getElementById('farmDeleteConfirm').style.display = 'none';
        document.getElementById('farmModalActions').style.display = 'flex';
        document.querySelector('#farmModal h3').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Farm';
        document.getElementById('saveFarmBtn').innerHTML = '<i class="fas fa-save"></i> Save Farm';
        document.getElementById('farmModal').classList.add('active');
    }

    // ===== AUTHENTICATION FLOW (NEW) =====
    async getUserProfile(user) {
        const userRef = this.db.collection('users').doc(user.uid);
        const doc = await userRef.get();
        if (doc.exists) {
            return { uid: user.uid, ...doc.data() };
        }
        return null;
    }

    async handleInvitations(user) {
        try {
            const q = await this.db.collection('invitations').where('invitedPhone', '==', user.phoneNumber).where('status', '==', 'pending').get();
            if (q.empty) {
                this.completeAppInitialization();
                return;
            }

            const inviteDoc = q.docs[0];
            const invite = inviteDoc.data();

            if (confirm(`You have been invited to join "${invite.farmName}" as a ${invite.role}. Accept invitation?`)) {
                this.showLoading(true);
                
                // 1. Update Invitation Status
                await this.db.collection('invitations').doc(inviteDoc.id).update({ status: 'accepted' });

                // 2. Add user to Farm members
                const updateData = {};
                updateData[`members.${user.uid}`] = invite.role;
                updateData['memberIds'] = firebase.firestore.FieldValue.arrayUnion(user.uid);
                await this.db.collection('farms').doc(invite.farmId).update(updateData);

                this.showToast('Invitation accepted!');
            } else {
                await this.db.collection('invitations').doc(inviteDoc.id).update({ status: 'rejected' });
                this.showToast('Invitation declined.');
            }
            this.completeAppInitialization();
        } catch (e) {
            console.error("Invite Error", e);
            this.completeAppInitialization();
        }
    }

    async checkForInvitations(user) {
        try {
            const q = await this.db.collection('invitations').where('invitedPhone', '==', user.phoneNumber).where('status', '==', 'pending').get();
            return !q.empty;
        } catch (e) {
            console.error("Error checking invitations", e);
            return false;
        }
    }

    showPhoneStep() {
        if (this.resendTimerInterval) clearInterval(this.resendTimerInterval);
        document.getElementById('otp-step').style.display = 'none';
        document.getElementById('phone-step').style.display = 'block';
    }

    sendOTP() {
        let phone = document.getElementById('phoneInput').value.trim();
        // Remove any non-digit characters
        phone = phone.replace(/\D/g, '');

        if (phone.length !== 10) {
            this.showToast('Please enter a valid 10-digit mobile number.', 'error');
            return;
        }
        
        const formattedPhone = '+91' + phone;
        this.showLoading(true);
        
        const appVerifier = window.recaptchaVerifier;

        this.auth.signInWithPhoneNumber(formattedPhone, appVerifier)
            .then((confirmationResult) => {
                window.confirmationResult = confirmationResult;
                this.showLoading(false);
                this.showToast(`OTP sent to ${formattedPhone}`, 'info');
                document.getElementById('otp-phone-display').textContent = formattedPhone;
                document.getElementById('phone-step').style.display = 'none';
                document.getElementById('otp-step').style.display = 'block';
                this.startResendTimer();

                // --- AUTO-FILL & AUTO-SUBMIT LOGIC ---
                const otpInput = document.getElementById('otpInput');
                otpInput.value = '';
                otpInput.focus();

                // 1. Auto-submit when 6 digits are entered
                otpInput.oninput = () => {
                    if (otpInput.value.length === 6) {
                        this.verifyOTP();
                    }
                };

                // 2. WebOTP API: Attempt to auto-read SMS (Android)
                if ('OTPCredential' in window) {
                    const ac = new AbortController();
                    navigator.credentials.get({ otp: { transport:['sms'] }, signal: ac.signal })
                        .then(otp => {
                            otpInput.value = otp.code;
                            this.verifyOTP(); // Auto-submit
                        }).catch(err => console.log('WebOTP not available or timed out', err));
                }
            }).catch((error) => {
                this.showLoading(false);
                console.error("OTP Error:", error);
                this.showToast(`Failed to send OTP: ${error.message}`, 'error');
                // If an error occurs (e.g. network error), reset the reCAPTCHA
                // so the user can try again without reloading the page.
                if (window.grecaptcha && window.recaptchaWidgetId) {
                    grecaptcha.reset(window.recaptchaWidgetId);
                }
            });
    }

    startResendTimer() {
        const btn = document.getElementById('resendOtpBtn');
        if (!btn) return;

        let timeLeft = 30;
        btn.disabled = true;
        btn.style.color = 'var(--gray)';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = `Resend in <span id="resendTimer">${timeLeft}</span>s`;

        if (this.resendTimerInterval) clearInterval(this.resendTimerInterval);

        this.resendTimerInterval = setInterval(() => {
            timeLeft--;
            const span = document.getElementById('resendTimer');
            if (span) span.textContent = timeLeft;

            if (timeLeft <= 0) {
                clearInterval(this.resendTimerInterval);
                btn.disabled = false;
                btn.style.color = 'var(--primary)';
                btn.style.cursor = 'pointer';
                btn.innerHTML = `<i class="fas fa-redo"></i> Resend OTP`;
            }
        }, 1000);
    }

    resendOTP() {
        // Reset reCAPTCHA if needed before resending
        if (window.grecaptcha && window.recaptchaWidgetId) {
            grecaptcha.reset(window.recaptchaWidgetId);
        }
        this.sendOTP();
    }

    verifyOTP() {
        const otp = document.getElementById('otpInput').value;
        if (otp.length < 6) { this.showToast('Please enter a valid 6-digit OTP.', 'error'); return; }

        this.showLoading(true);
        window.confirmationResult.confirm(otp).catch((error) => {
            this.showLoading(false);
            this.showToast('Invalid OTP. Please try again.', 'error');
        });
        // onAuthStateChanged will handle the successful login
    }

    async saveUserRole() {
        const name = document.getElementById('userNameInput').value;
        const role = document.getElementById('userRoleSelect').value;
        if (!name) { this.showToast('Please enter your name.', 'error'); return; }

        const user = this.auth.currentUser;
        if (!user) return;

        const userProfile = { name, role, phone: user.phoneNumber, createdAt: new Date(), isPro: false };
        this.showLoading(true);
        await this.db.collection('users').doc(user.uid).set(userProfile);
        
        // Set current user and close modal
        this.currentUser = { uid: user.uid, ...userProfile };
        this.closeAllModals();
        
        await this.completeAppInitialization();
        // Guide the new user to add their first farm directly.
        this.openFarmModal();
    }

    editFarm(id) {
        const farm = this.getFarmById(id);
        if (!farm) return;

        this.editingFarmId = id;
        document.getElementById('farmNameInput').value = farm.name;
        document.getElementById('farmLocation').value = farm.location;
        document.getElementById('farmContact').value = farm.contact || '';
        document.getElementById('farmPhone').value = farm.phone || '';
        document.getElementById('farmLat').value = farm.lat || '';
        document.getElementById('farmLng').value = farm.lng || '';
        
        const deleteBtn = document.getElementById('deleteFarmBtn');
        deleteBtn.style.display = 'inline-flex';
        deleteBtn.onclick = () => this.showDeleteConfirmation(id);
        document.getElementById('farmDeleteConfirm').style.display = 'none';
        document.getElementById('farmModalActions').style.display = 'flex';

        document.querySelector('#farmModal h3').innerHTML = '<i class="fas fa-edit"></i> Edit Farm';
        document.getElementById('saveFarmBtn').innerHTML = '<i class="fas fa-save"></i> Update Farm';
        document.getElementById('farmModal').classList.add('active');
    }

    async initiatePayment() {
        // MVP: Payments disabled. Offer is active.
        this.showToast("Early Bird Offer Active: Pro features are FREE!", "success");
        this.closeAllModals();
    }

    async removeMember(uid) {
        if (!confirm('Remove this member?')) return;
        const farmId = this.state.settings.currentFarmId;
        try {
            // Assuming 'members' is a map field on the farm document
            await this.db.collection('farms').doc(farmId).update({
                [`members.${uid}`]: firebase.firestore.FieldValue.delete()
            });
            this.showToast('Member removed.');
            this.openTeamManagement(); // Refresh list
        } catch (e) {
            console.error(e);
            this.showToast('Failed to remove member', 'error');
        }
    }

    openFarmSelector() {
        const list = document.getElementById('farmsListModal');
        list.innerHTML = '';
        this.state.farms.forEach(farm => {
            const div = document.createElement('div');
            div.className = 'feed-schedule-item';
            if (farm.id === this.state.settings.currentFarmId) div.classList.add('completed');
            div.innerHTML = `
                <div class="feed-time">${farm.name}</div>
                <div class="feed-label">${farm.location}</div>
            `;
            div.onclick = async () => {
                this.state.settings.currentFarmId = farm.id;
                await this.saveSettings();
                
                // Fetch inventory for the selected farm
                try {
                    const doc = await this.db.collection('inventory').doc(farm.id).get();
                    if (doc.exists) this.state.inventory = doc.data();
                    else this.state.inventory = { totalKg: 0 };
                } catch (e) {
                    console.error("Inventory fetch failed", e);
                    this.state.inventory = { totalKg: 0 };
                }
                this.renderAll();
                this.closeAllModals();
            };
            list.appendChild(div);
        });
        document.getElementById('farmSelectorModal').classList.add('active');
    }

    openTankModal(farmId) {
        this.editingTankId = null;
        document.getElementById('tankNameInput').value = '';
        document.getElementById('tankSize').value = '';
        document.getElementById('stockingDate').value = '';
        document.getElementById('initialSeed').value = '';
        document.getElementById('tankCheckTrays').value = 2; // Default
        document.querySelector('#tankModal h3').innerHTML = '<i class="fas fa-water"></i> Add New Tank';

        const select = document.getElementById('tankFarmSelect');
        select.innerHTML = '';
        this.state.farms.forEach(farm => {
            const option = document.createElement('option');
            option.value = farm.id;
            option.textContent = farm.name;
            if (farm.id === farmId) option.selected = true;
            select.appendChild(option);
        });
        document.getElementById('tankModal').classList.add('active');
    }

    openInventoryModal() {
        document.getElementById('modalCurrentStock').innerHTML = `${(this.state.inventory.totalKg || 0).toFixed(1)} <span class="unit">kg</span>`;
        document.getElementById('stockBags').value = '';
        document.getElementById('bagWeight').value = '25'; // Default bag weight
        document.getElementById('inventoryModal').classList.add('active');
    }

    async saveStock() {
        const bags = parseFloat(document.getElementById('stockBags').value) || 0;
        const weight = parseFloat(document.getElementById('bagWeight').value) || 25;
        const currentFarmId = this.state.settings.currentFarmId;
        
        if (bags > 0 && currentFarmId) {
            const addedKg = bags * weight;
            
            // FACT 3: OFFLINE FIX
            // Use simple update/set instead of transaction. 
            // Use increment to be safe against race conditions without transaction.
            const invRef = this.db.collection('inventory').doc(currentFarmId);
            await invRef.set({ 
                totalKg: firebase.firestore.FieldValue.increment(addedKg) 
            }, { merge: true });
            
            // Optimistic UI Update
            this.state.inventory.totalKg = (this.state.inventory.totalKg || 0) + addedKg;
            this.renderOverallStats();
            this.closeAllModals();
            this.showToast(`Added ${addedKg} kg to stock`);
        } else {
            this.showToast('Please enter valid quantity', 'error');
        }
    }

    // ===== MEDICINE INVENTORY =====
    openMedicineInventoryModal() {
        // Populate datalist
        const datalist = document.getElementById('supplementList');
        datalist.innerHTML = this.state.settings.supplements.map(s => `<option value="${s}">`).join('');
        
        this.renderMedicineInventoryList();
        document.getElementById('medicineInventoryModal').classList.add('active');
    }

    renderMedicineInventoryList() {
        const list = document.getElementById('medicineList');
        if (this.state.medicineInventory.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No medicines in stock</p></div>';
            return;
        }
        list.innerHTML = this.state.medicineInventory.map(item => `
            <div class="settings-item">
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:600;">${item.name}</span>
                    <span style="font-size:12px; color:var(--gray);">${item.quantity} ${item.unit}</span>
                </div>
                <button class="btn-icon" style="color: var(--danger);" onclick="app.deleteMedicineItem('${item.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    async saveMedicineStock() {
        const name = document.getElementById('medName').value.trim();
        const qty = parseFloat(document.getElementById('medQty').value);
        const unit = document.getElementById('medUnit').value;

        if (!name || isNaN(qty)) {
            this.showToast('Please enter valid name and quantity', 'error');
            return;
        }

        const currentFarmId = this.state.settings.currentFarmId;
        let itemToSave = null;

        const existing = this.state.medicineInventory.find(i => i.name.toLowerCase() === name.toLowerCase() && i.unit === unit);
        if (existing) {
            existing.quantity += qty;
            itemToSave = existing;
        } else {
            itemToSave = { id: Date.now().toString(), farmId: currentFarmId, name, quantity: qty, unit };
            this.state.medicineInventory.push(itemToSave);
        }
        
        // Save to Firestore
        await this.db.collection('medicineInventory').doc(itemToSave.id).set(itemToSave);

        this.renderMedicineInventoryList();
        this.renderInventorySummary();
        this.showToast('Medicine stock updated');
        
        // Clear inputs
        document.getElementById('medName').value = '';
        document.getElementById('medQty').value = '';
    }

    async deleteMedicineItem(id) {
        // Fix: Check usage before delete
        const used = this.state.medicineApplications.some(a => a.medId === id);
        if (used) {
            this.showToast('Cannot delete: Item has been used in applications.', 'error');
            return;
        }
        if (confirm('Remove this item from inventory?')) {
            await this.db.collection('medicineInventory').doc(id).delete();
            this.state.medicineInventory = this.state.medicineInventory.filter(i => i.id !== id);
            this.renderMedicineInventoryList();
            this.renderInventorySummary();
        }
    }

    // ===== MEDICINE APPLICATION =====
    openApplyMedicineModal(tankId) {
        if (tankId) this.editingTankId = tankId;
        
        const select = document.getElementById('applyMedSelect');
        select.innerHTML = '<option value="">Select Product...</option>';
        
        if (this.state.medicineInventory.length === 0) {
            this.showToast('No medicines in inventory. Add stock first.', 'warning');
            return;
        }

        this.state.medicineInventory.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (${item.unit})`;
            select.appendChild(option);
        });

        document.getElementById('applyMedAmount').value = '';
        document.getElementById('applyMedDate').value = this.currentDate;
        document.getElementById('applyMedRemarks').value = '';
        document.getElementById('applyMedStockDisplay').textContent = '--';
        
        document.getElementById('applyMedicineModal').classList.add('active');
    }

    updateMedStockDisplay() {
        const medId = document.getElementById('applyMedSelect').value;
        const display = document.getElementById('applyMedStockDisplay');
        const item = this.state.medicineInventory.find(i => i.id === medId);
        
        if (item) {
            display.textContent = `${item.quantity} ${item.unit}`;
        } else {
            display.textContent = '--';
        }
    }

    async saveMedicineApplication() {
        const tankId = this.editingTankId;
        const tank = this.getTankById(tankId);
        const medId = document.getElementById('applyMedSelect').value;
        const amount = parseFloat(document.getElementById('applyMedAmount').value);
        const date = document.getElementById('applyMedDate').value;
        const remarks = document.getElementById('applyMedRemarks').value;

        if (!medId || !amount || amount <= 0) {
            this.showToast('Invalid input', 'error');
            return;
        }

        const inventoryItem = this.state.medicineInventory.find(i => i.id === medId);
        if (!inventoryItem) {
            this.showToast('Medicine not found in inventory', 'error');
            return;
        }

        if (inventoryItem.quantity < amount) {
            this.showToast(`Insufficient stock. Available: ${inventoryItem.quantity} ${inventoryItem.unit}`, 'error');
            return;
        }

        // Deduct
        inventoryItem.quantity -= amount;
        
        // Record
        const medApp = {
            id: Date.now(),
            tankId,
            farmId: tank.farmId,
            medId,
            medName: inventoryItem.name,
            amount,
            unit: inventoryItem.unit,
            date,
            remarks
        };
        
        this.state.medicineApplications.push(medApp);
        
        // Firestore updates
        await this.db.collection('medicineInventory').doc(inventoryItem.id).update({ quantity: inventoryItem.quantity });
        await this.db.collection('medicineApplications').doc(medApp.id.toString()).set(medApp);

        this.renderInventorySummary(); // Update home screen stats
        this.closeAllModals();
        this.showToast('Medicine applied and stock deducted');
    }

    // ===== FEED ROUND (BULK) =====
    openFeedRoundModal() { 
        const currentFarmId = this.state.settings.currentFarmId;
        if (!currentFarmId) {
            this.showToast('Please select a farm first', 'error');
            return;
        }

        const tanks = this.state.tanks.filter(t => t.farmId === currentFarmId);
        if (tanks.length === 0) {
            this.showToast('No tanks found in this farm', 'error');
            return;
        }

        const activeTanks = tanks.filter(t => t.status !== 'inactive');
        if (activeTanks.length === 0) {
            this.showToast('All tanks in this farm are inactive. Start a new crop cycle to log feed.', 'info');
            return;
        }

        // Check for pending tray results
        const pending = this.state.feedEntries.filter(e => 
            tanks.some(t => t.id == e.tankId) && e.trayResult === 'pending'
        );

        if (pending.length > 0) {
            this.showToast('⚠️ Please update tray results from the last feed first!', 'warning');
            this.openTrayCheckModal();
            return;
        }

        // Calculate Feed Round Number
        let maxEntries = 0;
        tanks.forEach(t => {
            const count = this.state.feedEntries.filter(e => e.tankId == t.id && e.date === this.currentDate).length;
            if (count > maxEntries) maxEntries = count;
        });
        const roundNumber = maxEntries + 1;
        
        document.querySelector('#feedRoundModal .modal-header h3').innerHTML = `<i class="fas fa-utensils"></i> Log Feed (Round ${roundNumber})`;

        // Populate Supplements for Bulk Entry
        const suppContainer = document.getElementById('roundSupplements');
        if (suppContainer) {
            suppContainer.innerHTML = this.state.settings.supplements.map(s => `
                <div class="supplement-option" onclick="this.classList.toggle('selected')">
                    <i class="fas fa-plus"></i> ${s}
                </div>
            `).join('');
        }

        const list = document.getElementById('feedRoundList');
        list.innerHTML = '';

        // Fix: Suggestion Baseline (Find same slot yesterday)
        // This ensures Morning feed is compared to yesterday's Morning feed, not yesterday's Evening feed.
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        activeTanks.forEach(tank => {
            // Get last feed info
            const entries = this.state.feedEntries.filter(e => e.tankId == tank.id).sort((a, b) => b.id - a.id);
            const lastEntry = entries[0];
            
            let lastAmount = lastEntry ? lastEntry.amount : 0;
            let lastTimeStr = "";
            if (lastEntry && lastEntry.time) {
                // Extract HH:MM roughly or use existing string
                lastTimeStr = ` <span style="font-size:10px; color:var(--gray);">(${lastEntry.time})</span>`;
            }

            let suggestion = lastAmount;
            let reason = "Same as last";

            // Suggestion Logic
            if (lastEntry) {
                if (lastEntry.trayResult === 'empty') { suggestion = (lastAmount * 1.05).toFixed(1); reason = "Inc 5% (Empty)"; }
                else if (last.trayResult === 'half') { suggestion = (lastAmount * 0.9).toFixed(1); reason = "Dec 10% (Half)"; }
                else if (lastEntry.trayResult === 'too-much') { suggestion = (lastAmount * 0.8).toFixed(1); reason = "Dec 20% (Waste)"; }
            } else {
                suggestion = 2.0; // Default start
                reason = "Initial";
            }

            // Check Tray Grams Suggestion (e.g. 10g per kg) 
            const checkTrayGrams = Math.ceil(suggestion * 10); 

            const row = document.createElement('div');
            row.className = 'feed-round-row';
            row.innerHTML = `
                <div>
                    <div style="font-weight:600;">${tank.name}</div>
                    <div class="suggestion-text">Tray: ${checkTrayGrams}g</div>
                </div>
                <div style="font-size:12px; color:var(--dark); font-weight:500;">${lastAmount}kg${lastTimeStr}</div>
                <div>
                    <div style="font-weight:600; color:var(--primary); font-size:13px;">${suggestion}</div>
                    <div class="suggestion-text">${reason}</div>
                </div>
                <input type="number" class="form-control feed-round-input" data-tank-id="${tank.id}" value="${suggestion}" step="0.1" style="padding: 8px;">
            `;
            list.appendChild(row);
        });

        document.getElementById('feedRoundModal').classList.add('active');
    }

    async saveFeedRound() { 
        // Fix: Disable button to prevent double submission
        const btn = document.querySelector('#feedRoundModal .btn-primary');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const inputs = document.querySelectorAll('.feed-round-input');
        let totalAmount = 0;
        
        // Get selected supplements for this round
        const supplements = Array.from(document.querySelectorAll('#roundSupplements .supplement-option.selected'))
            .map(el => el.textContent.trim());
        
        const batch = this.db.batch();
        let entriesToAdd = [];

        inputs.forEach(input => {
            const amount = parseFloat(input.value);
            if (amount > 0) {
                const tankId = input.dataset.tankId;
                const tank = this.getTankById(tankId);
                // Fix: Ensure unique IDs even in fast loops
                const entryId = Date.now().toString() + '_' + entriesToAdd.length;
                const newEntry = {
                    id: entryId,
                    tankId,
                    farmId: tank.farmId,
                    date: this.currentDate,
                    time: new Date().toLocaleTimeString(),
                    amount,
                    trayResult: 'pending', // Mark as pending check
                    supplements: supplements
                };
                
                const docRef = this.db.collection('feedEntries').doc(entryId);
                batch.set(docRef, newEntry);
                entriesToAdd.push(newEntry);
                totalAmount += amount;
            }
        });

        // Inventory Check
        const currentStock = this.state.inventory.totalKg || 0;
        if (totalAmount > currentStock) {
            if (!confirm(`⚠️ Low Inventory Warning\n\nYou are about to feed ${totalAmount.toFixed(1)}kg, but you only have ${currentStock.toFixed(1)}kg in stock.\n\nProceed anyway?`)) {
                btn.disabled = false;
                btn.innerHTML = 'Save All Entries';
                return;
            }
        }

        if (entriesToAdd.length > 0) {
            this.showLoading(true);
            await batch.commit();

            // FACT 2: DOUBLE DIP FIX
            // Removed frontend inventory deduction. 
            // The Cloud Function 'onFeedEntryCreate' will handle the deduction safely.
            
            // Optimistic UI Update (Visual only)
            this.state.inventory.totalKg = (this.state.inventory.totalKg || 0) - totalAmount;
            this.renderInventorySummary();
            this.closeAllModals();
            // No need to call renderAll() here, the onSnapshot listener will handle UI updates.
            this.showLoading(false);
            this.showToast(`Saved ${entriesToAdd.length} feed entries. Check trays in 2 hours!`);
        } else {
            btn.disabled = false;
            btn.innerHTML = 'Save All Entries';
            this.showToast('No feed amounts entered', 'error');
        }
    }

    openTrayCheckModal() {
        const currentFarmId = this.state.settings.currentFarmId;
        const farmTanks = this.state.tanks.filter(t => t.farmId === currentFarmId).map(t => t.id);
        
        // Find pending entries for today (or recent)
        const pending = this.state.feedEntries
            .filter(e => farmTanks.includes(String(e.tankId)) && e.trayResult === 'pending')
            .sort((a, b) => b.id - a.id);

        if (pending.length === 0) {
            this.showToast('No pending tray checks found', 'info');
            this.closeAllModals();
            return;
        }

        const modal = document.getElementById('trayCheckModal');
        const list = document.getElementById('trayCheckList');
        const footer = modal.querySelector('.modal-footer');
        const header = modal.querySelector('.modal-header h3');

        header.innerHTML = '<i class="fas fa-tasks"></i> Pending Tray Checks';
        list.innerHTML = '<div style="padding: 16px;"></div>'; // Container for list
        const listContainer = list.querySelector('div');
        
        pending.forEach(entry => {
            const tank = this.getTankById(entry.tankId);
            const div = document.createElement('div');
            div.className = 'feed-schedule-item';
            div.style.marginBottom = '12px';
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="status-icon" style="background:var(--warning); color: white;"><i class="fas fa-clock"></i></div>
                    <div>
                        <div class="feed-time" style="font-size:16px;">${tank.name}</div>
                        <div class="feed-label">Fed ${entry.amount}kg @ ${entry.time}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px; color:var(--primary); font-weight:600;">Update</span>
                    <i class="fas fa-chevron-right" style="color:var(--gray); font-size:12px;"></i>
                </div>
            `;
            div.onclick = () => this.openSingleTrayCheckForm(entry.id);
            listContainer.appendChild(div);
        });
        
        // Clear footer for list view
        footer.innerHTML = `
            <button class="btn btn-secondary" style="width: 100%; border: none; background: transparent; color: var(--gray);" onclick="app.skipTrayChecks()">
                Skip Remaining & Log Feed
            </button>
        `;
        
        modal.classList.add('active');
    }

    openSingleTrayCheckForm(entryId) {
        const entry = this.state.feedEntries.find(e => e.id === entryId);
        if (!entry) return;
        const tank = this.getTankById(entry.tankId);

        const modal = document.getElementById('trayCheckModal');
        const list = document.getElementById('trayCheckList');
        const footer = modal.querySelector('.modal-footer');
        const header = modal.querySelector('.modal-header h3');

        header.innerHTML = `<i class="fas fa-search"></i> Check: ${tank.name}`;
        
        list.innerHTML = `
            <div style="padding: 16px;" id="singleTrayForm" data-entry-id="${entry.id}">
                <div style="background: #e3f2fd; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: var(--primary-dark);">
                    <strong>Last Feed:</strong> ${entry.amount} kg @ ${entry.time}
                </div>

                <label style="font-size:13px; font-weight:600; display:block; margin-bottom:8px;">Mandatory Tray Status <span style="color:red">*</span></label>
                <div class="tray-status-radios" id="tray-radios-${entry.id}">
                    <div class="tray-radio status-empty" onclick="app.selectTrayRadio('${entry.id}', this, 'empty')" data-score="0">
                        <i class="fas fa-check-circle" style="font-size: 24px; margin-bottom: 8px; color: var(--success);"></i><br>
                        Empty<br><span style="font-size:10px; font-weight:400; color: var(--gray);">Fully Consumed</span>
                    </div>
                    <div class="tray-radio status-little" onclick="app.selectTrayRadio('${entry.id}', this, 'little')" data-score="1">
                        <i class="fas fa-thumbs-up" style="font-size: 24px; margin-bottom: 8px; color: var(--warning);"></i><br>
                        Little Left<br><span style="font-size:10px; font-weight:400; color: var(--gray);">Ideal Feeding</span>
                    </div>
                    <div class="tray-radio status-half" onclick="app.selectTrayRadio('${entry.id}', this, 'half')" data-score="2">
                        <i class="fas fa-adjust" style="font-size: 24px; margin-bottom: 8px; color: #ff9800;"></i><br>
                        Half Left<br><span style="font-size:10px; font-weight:400; color: var(--gray);">Overfeeding</span>
                    </div>
                    <div class="tray-radio status-full" onclick="app.selectTrayRadio('${entry.id}', this, 'too-much')" data-score="3">
                        <i class="fas fa-times-circle" style="font-size: 24px; margin-bottom: 8px; color: var(--danger);"></i><br>
                        Too Much<br><span style="font-size:10px; font-weight:400; color: var(--gray);">Serious Waste</span>
                    </div>
                </div>
                
                <div class="form-group" style="margin-top:15px;">
                    <label style="font-size:13px;">Mortality (Dead Shrimp)</label>
                    <input type="number" id="mortalityInput" class="form-control" placeholder="0" min="0">
                </div>

                <input type="text" class="form-control" placeholder="Quick note (e.g. Rain, Aerator off...)" maxlength="50" style="font-size:13px; margin-top:20px;">
            </div>
        `;

        footer.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 2fr; gap: 10px; width: 100%;">
                <button class="btn btn-secondary" onclick="app.openTrayCheckModal()">Back</button>
                <button class="btn btn-primary" onclick="app.processSingleTrayResult('${entry.id}')">Save Result</button>
            </div>
        `;
    }

    skipTrayChecks() {
        if (!confirm("Are you sure? Pending tray checks will be marked as 'Unknown'.")) return;

        const currentFarmId = this.state.settings.currentFarmId;
        const tanks = this.state.tanks.filter(t => t.farmId === currentFarmId);
        
        let updatedCount = 0;
        this.state.feedEntries.forEach(e => {
            if (tanks.some(t => t.id == e.tankId) && e.trayResult === 'pending') {
                e.trayResult = 'unknown';
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            this.saveFeedEntries();
            this.showToast('Tray checks skipped.');
        }
        
        this.closeAllModals();
        this.openFeedRoundModal();
    }

    selectTrayRadio(entryId, el, value) {
        const container = document.getElementById(`tray-radios-${entryId}`);
        container.querySelectorAll('.tray-radio').forEach(r => r.classList.remove('selected'));
        el.classList.add('selected');
        el.dataset.value = value;
    }

    processSingleTrayResult(entryId) {
        // Ensure ID is treated as string for comparison
        const id = String(entryId);
        const container = document.getElementById('singleTrayForm');
        if (!container) return;

        // Get Tray Status
        const selectedRadio = container.querySelector('.tray-radio.selected');
        if (!selectedRadio) {
            this.showToast('Please select a tray status.', 'error');
            return;
        }
        const trayStatus = selectedRadio.dataset.value;
        
        // Get Observations
        const checkedBoxes = container.querySelectorAll('.observation-chip.selected');
        const observations = [];
        let riskScore = 0;
        
        checkedBoxes.forEach(box => {
            observations.push(box.dataset.obsId);
            riskScore += parseInt(box.dataset.score || 0);
        });
        riskScore += parseInt(selectedRadio.dataset.score || 0);

        // Calculate Risk Level
        let riskLevel = riskScore >= 6 ? 'Action Required' : riskScore >= 3 ? 'Watch' : 'Normal';
        
        const entry = this.state.feedEntries.find(e => e.id == id);
        
        // Logic for suggestion
        let newAmount = entry.amount;
        let reason = "Keep same";
        
        if (trayStatus === 'empty') {
            newAmount = entry.amount * 1.05;
            reason = `+5% (was ${entry.amount}kg)`;
        } else if (trayStatus === 'half') {
            newAmount = entry.amount * 0.9;
            reason = `-10% (was ${entry.amount}kg)`;
        } else if (trayStatus === 'too-much') {
            newAmount = entry.amount * 0.8;
            reason = `-20% (was ${entry.amount}kg)`;
        }

        // Smart Recommendation: Weather Integration
        // If weather is bad (Rain/Storm), suggest reducing feed to prevent waste/ammonia spikes
        if (this.currentWeatherCode !== null && this.currentWeatherCode >= 50) {
            const weatherFactor = 0.9; // Reduce by 10%
            newAmount = newAmount * weatherFactor;
            reason += " + Weather Adj.";
        }

        // Prepare data object
        this.tempTrayResult = {
            entryId: id,
            trayResult: trayStatus,
            trayResults: [trayStatus], // For backward compatibility
            observations,
            riskScore,
            riskLevel,
            notes: container.querySelector('input').value,
            newAmount: parseFloat(newAmount.toFixed(1)),
            reason
        };

        // Show Confirmation View
        const list = document.getElementById('trayCheckList');
        const footer = document.querySelector('#trayCheckModal .modal-footer');
        
        list.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 10px;">Result Recorded</div>
                <div style="margin-bottom: 20px;">
                    <span class="log-status ${trayStatus}" style="font-size: 14px; padding: 6px 12px;">${trayStatus.toUpperCase()}</span>
                </div>
                
                <div style="background: #f1f8e9; padding: 16px; border-radius: 12px; border: 1px solid #c8e6c9; margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #2e7d32; margin-bottom: 4px;">Suggested Next Feed</div>
                    <div style="font-size: 24px; font-weight: 800; color: #2e7d32;">${this.tempTrayResult.newAmount} kg</div>
                    <div style="font-size: 12px; color: #2e7d32;">${reason}</div>
                </div>

                <p style="font-size: 13px; color: var(--gray);">Confirm to save this result and update the feed plan.</p>
            </div>
        `;

        footer.innerHTML = `
            <button class="btn btn-success" style="width: 100%;" onclick="app.saveSingleTrayResult()">
                Confirm & Finish
            </button>
        `;
    }

    renderSuggestionModal(suggestions) {
        this.pendingSuggestions = suggestions;
        const list = document.getElementById('suggestionList');
        list.innerHTML = '';

        suggestions.forEach(s => {
            const row = document.createElement('div');
            row.className = 'suggestion-row';
            row.innerHTML = `
                <div>
                    <div style="font-weight: 700;">${s.tankName}</div>
                </div>
                <div>
                    <span class="tray-badge ${s.trayResults.join(' ')}">${s.trayResults.map(r => r.charAt(0).toUpperCase()).join(', ')}</span>
                </div>
                <div>
                    <div style="font-weight: 800; font-size: 16px; color: var(--primary);">${s.newAmount} kg</div>
                    <div style="font-size: 11px; font-weight: 600; color: ${s.reasonColor};">${s.reason}</div>
                </div>
            `;
            list.appendChild(row);
        });

        this.closeAllModals();
        document.getElementById('suggestionModal').classList.add('active');
    }

    async acceptSuggestions() {
        if (!this.pendingSuggestions) return;

        this.pendingSuggestions.forEach(s => {
            // Update the original feed entry with the result
            const entry = this.state.feedEntries.find(e => e.id === s.entryId);
            if (entry) {
                entry.trayResults = s.trayResults;
                entry.notes = s.notes;
                entry.trayResult = s.trayResult; // Updated single status
                entry.observations = s.observations;
                entry.riskScore = s.riskScore;
                entry.riskLevel = s.riskLevel;
            }

            // Update the tank with the next suggested feed amount
            const tank = this.getTankById(s.tankId);
            if (tank) {
                tank.nextSuggestedFeed = {
                    amount: s.newAmount,
                    reason: s.reason
                };
            }
        });
        
        // No need to call saveFeedEntries/saveTanks as we updated Firestore in the loop (if implemented correctly)
        // But wait, the loop above only updated local state in the provided snippet?
        // The provided snippet for acceptSuggestions was incomplete in the original code regarding Firestore.
        // Let's fix it to write to Firestore.
        
        const batch = this.db.batch();
        this.pendingSuggestions.forEach(s => {
            const entryRef = this.db.collection('feedEntries').doc(s.entryId.toString());
            batch.update(entryRef, {
                trayResults: s.trayResults,
                notes: s.notes,
                trayResult: s.trayResult,
                observations: s.observations,
                riskScore: s.riskScore,
                riskLevel: s.riskLevel
            });
            
            const tankRef = this.db.collection('tanks').doc(s.tankId);
            batch.update(tankRef, {
                nextSuggestedFeed: { amount: s.newAmount, reason: s.reason }
            });
        });
        
        await batch.commit();

        this.closeAllModals();
        this.renderAll();
        this.showToast('Plan for next feed is updated!', 'success');
        this.pendingSuggestions = null;
    }

    async recalculateTankBiomass(tankId) {
        const tank = this.getTankById(tankId);
        if (!tank) return;
        
        // 1. Try to calculate based on Sampling (Most Accurate)
        const samples = this.state.samplingEntries
            .filter(s => s.tankId == tankId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (samples.length > 0) {
            const lastSample = samples[0];
            // Biomass = Current Seed * ABW. (Divide by 1000 for kg)
            const currentSeed = tank.currentSeed || tank.initialSeed || 0;
            tank.biomass = parseFloat(((currentSeed * lastSample.abw) / 1000).toFixed(1));
        } else {
            // 2. Fallback to FCR Estimation if no samples yet
            const entries = this.state.feedEntries.filter(e => e.tankId == tankId);
            const totalFeed = entries.reduce((sum, e) => sum + e.amount, 0);
            const tankHarvests = this.state.harvests.filter(h => h.tankId == tankId);
            const totalHarvested = tankHarvests.reduce((sum, h) => sum + h.weight, 0);
            
            // Using standard FCR of 1.2 for estimation
            const estimatedFCR = 1.2;
            tank.biomass = Math.max(0, parseFloat(((totalFeed / estimatedFCR) - totalHarvested).toFixed(1)));
        }
        
        // Update Firestore
        await this.db.collection('tanks').doc(tankId).update({ biomass: tank.biomass });
    }

    // ===== WATER ANALYSIS =====
    renderWaterScreen() {
        const select = document.getElementById('waterTankSelect');
        select.innerHTML = '';
        document.getElementById('waterDate').value = this.currentDate;
        
        const currentFarmId = this.state.settings.currentFarmId;
        const tanks = this.state.tanks.filter(t => t.farmId === currentFarmId);
        
        if (tanks.length === 0) {
            select.innerHTML = '<option value="">No tanks found</option>';
            return;
        }

        tanks.forEach(t => {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = t.name;
            select.appendChild(option);
        });
        
        // Auto-fill DOC if tank selected
        const updateDoc = () => {
            const t = this.getTankById(select.value);
            if (t) {
                const doc = Math.floor((new Date() - new Date(t.stockingDate)) / (1000 * 60 * 60 * 24));
                document.getElementById('waterDoc').value = doc;
                this.renderWaterHistory(t.id);
                this.renderWaterChart(t.id);
            }
        };

        select.onchange = () => {
            updateDoc();
        };
        
        // Trigger once
        if (tanks.length > 0) {
            select.value = tanks[0].id;
            updateDoc();
        } else {
            document.getElementById('waterHistoryList').innerHTML = '<div class="empty-state" style="padding:20px;"><p>No tanks available</p></div>';
        }
    }

    analyzeWater() {
        const tankId = document.getElementById('waterTankSelect').value;
        const tank = this.getTankById(tankId);
        const acre = tank ? tank.size : 1;
        
        const ph = parseFloat(document.getElementById('waterPh').value);
        const alk = parseFloat(document.getElementById('waterAlk').value);
        const ca = parseFloat(document.getElementById('waterCa').value);
        const mg = parseFloat(document.getElementById('waterMg').value);
        const amm = parseFloat(document.getElementById('waterAmm').value);
        const no2 = parseFloat(document.getElementById('waterNo2').value);

        if (isNaN(ph)) {
            this.showToast('Please enter at least pH level', 'error');
            return;
        }

        let html = "";
        let score = 100;
        let issues = 0;

        // Helper for cards
        const createCard = (type, title, msg) => {
            return `
                <div class="lab-result-card ${type}">
                    <div style="font-weight: 700; margin-bottom: 4px; color: var(--dark);">${title}</div>
                    <div style="font-size: 13px; color: var(--dark); opacity: 0.8;">${msg}</div>
                </div>
            `;
        };

        // pH
        if (ph >= 7.5 && ph <= 8.5) {
            html += createCard("success", "pH Stable", "pH is in safe range (7.5 - 8.5)");
        } else {
            score -= 25; issues++;
            html += createCard("danger", "pH Risk", "pH is outside optimal range. May cause stress & ammonia toxicity.");
        }

        // Alkalinity
        if (!isNaN(alk)) {
            if (alk >= 120 && alk <= 200) {
                html += createCard("success", "Alkalinity Good", "Buffering capacity is stable.");
            } else {
                score -= 10; issues++;
                html += createCard("warning", "Alkalinity Attention", "Maintain between 120–200 ppm for stability.");
            }
        }

        // Magnesium
        if (!isNaN(mg)) {
            if (mg < 700) {
                score -= 25; issues++;
                const dose = Math.round(acre * 25); // Assuming 25kg/acre for MgSO4
                html += createCard("danger", "Magnesium Critical", `Apply MgSO₄: <b>${dose} kg</b>. Split dose morning & evening.`);
            } else if (mg < 900) {
                score -= 10; issues++;
                html += createCard("warning", "Magnesium Low", "Levels are borderline. Consider supplementing.");
            } else {
                html += createCard("success", "Magnesium Optimal", "Supports good moulting & growth.");
            }
        }

        // Ca:Mg Ratio
        if (!isNaN(ca) && !isNaN(mg) && mg > 0) {
            const ratio = ca / mg;
            if (ratio > 0.6) {
                score -= 25; issues++;
                html += createCard("danger", "Imbalanced Mineral Ratio", "Ca:Mg ratio is high. Magnesium is too low relative to Calcium.");
            } else {
                html += createCard("success", "Mineral Ratio Balanced", "Ca:Mg ratio is acceptable.");
            }
        }

        // Ammonia
        if (!isNaN(amm)) {
            if (amm > 0.3 && ph > 8.2) {
                score -= 25; issues++;
                html += createCard("danger", "Ammonia Toxicity Risk", "High pH + Ammonia = Toxic. Reduce feed, add probiotics, increase aeration.");
            } else if (amm > 0.2) {
                score -= 10; issues++;
                html += createCard("warning", "Ammonia Warning", "Levels rising. Reduce feed by 5–10% and monitor.");
            } else {
                html += createCard("success", "Ammonia Safe", "Levels are within safe limits.");
            }
        }

        // Nitrite
        if (!isNaN(no2)) {
            if (no2 < 0.1) {
                html += createCard("success", "Nitrite Safe", "No toxicity risk detected.");
            } else {
                score -= 25; issues++;
                html += createCard("danger", "Nitrite High", "Toxic to shrimp. Water exchange or nitrite-reducing probiotics required.");
            }
        }

        // Score Display
        let scoreColor = "var(--success)";
        let statusMsg = "Excellent Water Quality";
        if (score < 80) { scoreColor = "var(--warning)"; statusMsg = "Attention Needed"; }
        if (score < 60) { scoreColor = "var(--danger)"; statusMsg = "Critical Action Required"; }

        const resultContainer = document.getElementById('waterAnalysisResult');
        resultContainer.innerHTML = `
            <div class="lab-score" style="border-color: ${scoreColor}">
                <div class="score-circle" style="color: ${scoreColor}; border-color: ${scoreColor}">${score}</div>
                <div style="font-weight: 700; color: var(--dark);">${statusMsg}</div>
                <div style="font-size: 12px; color: var(--gray); margin-top: 4px;">${issues} issues detected</div>
            </div>
            ${html}
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:16px;">
                <button class="btn btn-success" onclick="app.saveWaterResult()">
                    <i class="fas fa-save"></i> Save to Log
                </button>
                <button class="btn btn-secondary" onclick="document.getElementById('waterAnalysisResult').style.display='none'">
                    Close
                </button>
            </div>
        `;
        resultContainer.style.display = 'block';
        
        // Scroll to results
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    async saveWaterResult() {
        const tankId = document.getElementById('waterTankSelect').value;
        const tank = this.getTankById(tankId);
        const date = document.getElementById('waterDate').value || this.currentDate;
        const doc = parseInt(document.getElementById('waterDoc').value) || 0;
        
        const ph = parseFloat(document.getElementById('waterPh').value);
        const alk = parseFloat(document.getElementById('waterAlk').value);
        const ca = parseFloat(document.getElementById('waterCa').value);
        const mg = parseFloat(document.getElementById('waterMg').value);
        const amm = parseFloat(document.getElementById('waterAmm').value);
        const no2 = parseFloat(document.getElementById('waterNo2').value);

        // Simple score recalc for storage
        let score = 100;
        if (ph < 7.5 || ph > 8.5) score -= 25;
        if (!isNaN(alk) && (alk < 120 || alk > 200)) score -= 10;
        if (!isNaN(mg)) { if (mg < 700) score -= 25; else if (mg < 900) score -= 10; }
        if (!isNaN(ca) && !isNaN(mg) && mg > 0 && (ca/mg) > 0.6) score -= 25;
        if (!isNaN(amm)) { if (amm > 0.3 && ph > 8.2) score -= 25; else if (amm > 0.2) score -= 10; }
        if (!isNaN(no2) && no2 >= 0.1) score -= 25;
        
        const entry = {
            id: Date.now(),
            tankId,
            farmId: tank.farmId,
            date,
            doc,
            ph, alk, ca, mg, amm, no2,
            score: Math.max(0, score)
        };

        this.state.waterEntries.push(entry);
        await this.db.collection('waterEntries').doc(entry.id.toString()).set(entry);
        
        this.renderWaterHistory(tankId);
        this.renderWaterChart(tankId);
        this.showToast('Water test result saved!');
        document.getElementById('waterAnalysisResult').style.display = 'none';
    }

    renderWaterHistory(tankId) {
        const container = document.getElementById('waterHistoryList');
        const entries = this.state.waterEntries
            .filter(e => e.tankId == tankId)
            .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

        if (entries.length === 0) {
            container.innerHTML = '<div class="text-center text-muted" style="padding:20px; font-size:13px;">No history available for this tank.</div>';
            return;
        }

        container.innerHTML = entries.map(e => {
            let scoreColor = "var(--success)";
            if (e.score < 80) scoreColor = "var(--warning)";
            if (e.score < 60) scoreColor = "var(--danger)";

            return `
                <div class="timeline-card" style="border-left-color: ${scoreColor}; padding: 12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="font-weight:700; font-size:14px;">${new Date(e.date).toLocaleDateString()} <span style="font-weight:400; color:var(--gray); font-size:12px;">(DOC ${e.doc})</span></div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="font-weight:800; color:${scoreColor};">${e.score}/100</div>
                            <i class="fas fa-trash" style="color:var(--gray); cursor:pointer; font-size:12px;" onclick="app.deleteWaterEntry(${e.id})"></i>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; font-size:12px;">
                        <div>pH: <b>${e.ph}</b></div>
                        <div>Alk: <b>${e.alk || '-'}</b></div>
                        <div>Mg: <b>${e.mg || '-'}</b></div>
                        <div>Amm: <b>${e.amm || '-'}</b></div>
                        <div>NO2: <b>${e.no2 || '-'}</b></div>
                        <div>Ca: <b>${e.ca || '-'}</b></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderWaterChart(tankId) {
        const ctx = document.getElementById('waterTrendChart');
        const container = document.getElementById('waterChartContainer');
        
        if (!ctx) return;

        // Filter entries for this tank
        const entries = this.state.waterEntries
            .filter(e => e.tankId == tankId)
            .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id) // Ascending for chart
            .slice(-10); // Last 10

        if (entries.length < 2) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';

        const labels = entries.map(e => new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
        const phData = entries.map(e => e.ph);
        const ammData = entries.map(e => e.amm || 0);

        if (this.waterChart) this.waterChart.destroy();

        this.waterChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'pH',
                        data: phData,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        yAxisID: 'y',
                        tension: 0.3
                    },
                    {
                        label: 'Ammonia (ppm)',
                        data: ammData,
                        borderColor: '#F44336',
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { title: { display: true, text: 'Water Quality Trend (Last 10 Tests)' } },
                scales: {
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'pH' }, min: 6, max: 10 },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Ammonia' }, grid: { drawOnChartArea: false }, min: 0 }
                }
            }
        });
    }

    async deleteWaterEntry(id) {
        if (confirm('Delete this water test record?')) {
            await this.db.collection('waterEntries').doc(id.toString()).delete();
            const entry = this.state.waterEntries.find(e => e.id === id);
            const tankId = entry ? entry.tankId : null;
            this.state.waterEntries = this.state.waterEntries.filter(e => e.id !== id);
            if (tankId) {
                this.renderWaterHistory(tankId);
                this.renderWaterChart(tankId);
            }
            this.showToast('Record deleted');
        }
    }

    getCurrentLocation() {
        if (!navigator.geolocation) {
            this.showToast('Geolocation is not supported by your browser', 'error');
            return;
        }

        this.showLoading(true);
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            document.getElementById('farmLat').value = lat;
            document.getElementById('farmLng').value = lng;

            try {
                // Reverse geocoding for better UX using Nominatim (Free)
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                    headers: { 'Accept-Language': 'en' }
                });
                const data = await response.json();
                if (data && data.display_name) {
                    // Simplify address (first 3 parts)
                    const parts = data.display_name.split(', ');
                    const simpleAddress = parts.slice(0, 3).join(', ');
                    document.getElementById('farmLocation').value = simpleAddress;
                } else {
                    document.getElementById('farmLocation').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                }
            } catch (e) {
                document.getElementById('farmLocation').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
            
            this.showLoading(false);
            this.showToast('Location updated');
        }, (error) => {
            this.showLoading(false);
            let msg = 'Unable to retrieve location.';
            if (error.code === 1) msg = 'Location permission denied.';
            this.showToast(msg, 'error');
        }, { enableHighAccuracy: true, timeout: 10000 });
    }

    // CRUD Operations
    async saveFarm() {
        const name = document.getElementById('farmNameInput').value;
        const location = document.getElementById('farmLocation').value;
        const contact = document.getElementById('farmContact').value;
        const phone = document.getElementById('farmPhone').value;
        const lat = document.getElementById('farmLat').value;
        const lng = document.getElementById('farmLng').value;
        const ownerId = this.currentUser.uid;

        if (!name) {
            this.showToast('Farm name is required', 'error');
            return;
        }

        // MVP: Unlimited farms allowed for everyone

        try {
        this.showLoading(true);
        if (this.editingFarmId) {
            const farm = this.getFarmById(this.editingFarmId);
            if (farm) {
                farm.name = name;
                farm.location = location;
                farm.contact = contact;
                farm.phone = phone;
                farm.lat = lat ? parseFloat(lat) : null;
                farm.lng = lng ? parseFloat(lng) : null;
                await this.db.collection('farms').doc(farm.id).set(farm, { merge: true });
                this.showToast('Farm updated successfully');
            }
        } else {
            const newId = this.db.collection('farms').doc().id; // Always random ID for unlimited farms

            const newFarm = {
                id: newId,
                name,
                ownerId,
                memberIds: [ownerId],
                members: { [ownerId]: 'owner' },
                location,
                contact,
                phone,
                lat: lat ? parseFloat(lat) : null,
                lng: lng ? parseFloat(lng) : null,
                created: new Date().toISOString()
            };

            await this.db.collection('farms').doc(newFarm.id).set(newFarm);
            this.state.farms.push(newFarm);
            
            // Set as current if first
            if (this.state.farms.length === 1) {
                this.state.settings.currentFarmId = newFarm.id;
                await this.saveSettings();
            }
            this.showToast('Farm added successfully');
        }
        
        // Refresh listeners to include the new farm in real-time updates
        this.detachFirestoreListeners();
        await this.loadAllData();

        this.showLoading(false);
        this.closeAllModals();
        this.renderAll();
        
        // Clear inputs
        document.getElementById('farmNameInput').value = '';
        document.getElementById('farmLocation').value = '';
        document.getElementById('farmContact').value = '';
        document.getElementById('farmPhone').value = '';
        document.getElementById('farmLat').value = '';
        document.getElementById('farmLng').value = '';
        this.editingFarmId = null;
        } catch (e) {
            console.error(e);
            this.showLoading(false);
            this.showToast('Error saving farm: ' + e.message, 'error');
        }
    }

    showDeleteConfirmation(id) {
        document.getElementById('farmModalActions').style.display = 'none';
        document.getElementById('farmDeleteConfirm').style.display = 'flex';
        document.getElementById('confirmDeleteFarmBtn').onclick = () => this.deleteFarm(id);
    }

    cancelDeleteFarm() {
        document.getElementById('farmDeleteConfirm').style.display = 'none';
        document.getElementById('farmModalActions').style.display = 'flex';
    }

    async deleteFarm(id) {
        const farmId = String(id);

        this.showLoading(true);

        // Find tanks to be deleted
        const tanksToDelete = this.state.tanks.filter(t => t.farmId === farmId);
        const tankIdsToDelete = tanksToDelete.map(t => t.id);

        // Delete all sub-data for these tanks first (Clean up orphaned data)
        for (const tank of tanksToDelete) {
            await this.deleteCollectionByQuery(this.db.collection('feedEntries').where('tankId', '==', tank.id));
            await this.deleteCollectionByQuery(this.db.collection('waterEntries').where('tankId', '==', tank.id));
            await this.deleteCollectionByQuery(this.db.collection('harvests').where('tankId', '==', tank.id));
            await this.deleteCollectionByQuery(this.db.collection('sampling').where('tankId', '==', tank.id));
            await this.deleteCollectionByQuery(this.db.collection('medicineApplications').where('tankId', '==', tank.id));
        }

        const batch = this.db.batch();
        // Delete farm document
        batch.delete(this.db.collection('farms').doc(farmId));
        // Delete tanks
        tanksToDelete.forEach(t => batch.delete(this.db.collection('tanks').doc(t.id)));
        // Delete inventory
        batch.delete(this.db.collection('inventory').doc(farmId));
        
        await batch.commit();

        this.state.tanks = this.state.tanks.filter(t => t.farmId !== farmId);
        this.state.feedEntries = this.state.feedEntries.filter(e => !tankIdsToDelete.includes(e.tankId));
        this.state.waterEntries = this.state.waterEntries.filter(e => !tankIdsToDelete.includes(e.tankId));
        this.state.harvests = this.state.harvests.filter(h => !tankIdsToDelete.includes(h.tankId));

        // Filter out the farm itself
        this.state.farms = this.state.farms.filter(f => f.id !== farmId);
        
        // Check if the deleted farm was the current one
        if (this.state.settings.currentFarmId === farmId) {
            this.state.settings.currentFarmId = this.state.farms.length > 0 ? this.state.farms[0].id : null;
        }
        
        // Refresh listeners to stop listening to deleted farm
        this.detachFirestoreListeners();
        await this.loadAllData();

        this.showLoading(false);
        this.renderAll();
        this.closeAllModals();
        this.showToast('Farm deleted successfully', 'warning');
    }

    async saveTank() {
        const farmId = document.getElementById('tankFarmSelect').value;
        const name = document.getElementById('tankNameInput').value;
        const size = parseFloat(document.getElementById('tankSize').value);
        const stockingDate = document.getElementById('stockingDate').value;
        const initialSeed = parseInt(document.getElementById('initialSeed').value);
        const checkTrays = parseInt(document.getElementById('tankCheckTrays').value) || 2;

        if (!name || !farmId) {
            this.showToast('Name and Farm are required', 'error');
            return;
        }

        try {
            this.showLoading(true);
            if (this.editingTankId) {
                const tank = this.getTankById(this.editingTankId);
                if (tank) {
                    tank.farmId = farmId;
                    tank.name = name;
                    tank.size = size;
                    tank.stockingDate = stockingDate;
                    tank.initialSeed = initialSeed;
                    tank.checkTrays = checkTrays;
                    await this.db.collection('tanks').doc(tank.id).set(tank, { merge: true });
                    this.showToast('Tank updated successfully');
                }
            } else {
                const newTank = {
                    id: Date.now().toString(),
                    farmId,
                    name,
                    size,
                    stockingDate: stockingDate || this.currentDate,
                    initialSeed: initialSeed || 0,
                    checkTrays,
                    biomass: 0, // Initial biomass
                    nextSuggestedFeed: null,
                    status: 'active'
                };
                await this.db.collection('tanks').doc(newTank.id).set(newTank);
                this.state.tanks.push(newTank);
                this.showToast('Tank added successfully');
            }

            this.closeAllModals();
            this.renderAll();
            this.editingTankId = null;
        } catch (error) {
            console.error("Error saving tank:", error);
            this.showToast("Failed to save tank. Please try again.", "error");
        } finally {
            this.showLoading(false);
        }
    }

    editTank(id) {
        const tank = this.getTankById(id);
        if (!tank) return;
        
        this.editingTankId = id;
        this.openTankModal(tank.farmId);
        document.getElementById('tankNameInput').value = tank.name;
        document.getElementById('tankSize').value = tank.size;
        document.getElementById('stockingDate').value = tank.stockingDate;
        document.getElementById('initialSeed').value = tank.initialSeed;
        document.getElementById('tankCheckTrays').value = tank.checkTrays || 2;
        document.querySelector('#tankModal h3').innerHTML = '<i class="fas fa-edit"></i> Edit Tank';
    }

    openDeleteTankConfirmation(id) {
        const tank = this.getTankById(id);
        if (!tank) return;
        
        document.getElementById('deleteTankName').textContent = tank.name;
        document.getElementById('confirmDeleteTankBtn').onclick = () => this.deleteTank(id);
        document.getElementById('deleteTankModal').classList.add('active');
    }

    async deleteTank(id) {
        this.showLoading(true);
        const tankId = String(id);
        
        try {
            // Use helper to delete large collections safely
            await this.deleteCollectionByQuery(this.db.collection('feedEntries').where('tankId', '==', tankId));
            await this.deleteCollectionByQuery(this.db.collection('waterEntries').where('tankId', '==', tankId));
            await this.deleteCollectionByQuery(this.db.collection('harvests').where('tankId', '==', tankId));
            
            // Delete tank document
            await this.db.collection('tanks').doc(tankId).delete();

            this.state.tanks = this.state.tanks.filter(t => t.id !== tankId);
            this.state.feedEntries = this.state.feedEntries.filter(e => e.tankId !== tankId);
            this.state.waterEntries = this.state.waterEntries.filter(e => e.tankId !== tankId);
            this.state.harvests = this.state.harvests.filter(h => h.tankId !== tankId);
            
            this.showLoading(false);
            this.renderAll();
            this.closeAllModals();
            this.showToast('Tank deleted', 'warning');
        } catch (error) {
            console.error("Error deleting tank:", error);
            this.showLoading(false);
            this.showToast("Failed to delete tank. Please try again.", "error");
        }
    }
    toggleTankMenu(id) {
        document.querySelectorAll('.tank-menu-dropdown').forEach(el => {
            if(el.id !== `tank-menu-${id}`) el.classList.remove('show');
        });
        const menu = document.getElementById(`tank-menu-${id}`);
        if(menu) menu.classList.toggle('show');
    }

    editFeedEntry(id) {
        const entry = this.state.feedEntries.find(e => e.id === id);
        if (!entry) return;

        const tank = this.getTankById(entry.tankId);
        this.editingEntryId = id;
        document.getElementById('editFeedAmount').value = entry.amount;
        document.getElementById('editFeedDate').value = entry.date;

        const suppContainer = document.getElementById('editFeedSupplements');
        suppContainer.innerHTML = this.state.settings.supplements.map(s => {
            const isSelected = entry.supplements && entry.supplements.includes(s);
            return `
                <div class="supplement-option ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected')"><i class="fas ${isSelected ? 'fa-check' : 'fa-plus'}"></i> ${s}</div>
            `;
        }).join('');

        // Handle multiple tray results
        const trayStatusGroup = document.getElementById('editTrayStatusGroup');
        const trayCount = tank ? tank.checkTrays || 1 : 1;
        const trayResults = entry.trayResults || [entry.trayResult];
        let trayEditHTML = '';
        for (let i = 0; i < trayCount; i++) {
            trayEditHTML += `
                <div class="form-group" style="margin-bottom: 10px;">
                    <label style="font-size: 13px;">Tray ${i + 1} Status</label>
                    <select class="form-control edit-tray-select">
                        <option value="pending" ${trayResults[i] === 'pending' ? 'selected' : ''}>Pending Check</option>
                        <option value="empty" ${trayResults[i] === 'empty' ? 'selected' : ''}>Empty</option>
                        <option value="little" ${trayResults[i] === 'little' ? 'selected' : ''}>Little Left</option>
                        <option value="half" ${trayResults[i] === 'half' ? 'selected' : ''}>Half Full</option>
                        <option value="too-much" ${trayResults[i] === 'too-much' ? 'selected' : ''}>Too Much</option>
                        <option value="unknown" ${trayResults[i] === 'unknown' ? 'selected' : ''}>Unknown</option>
                    </select>
                </div>`;
        }
        trayStatusGroup.innerHTML = trayEditHTML;
        
        document.getElementById('editFeedModal').classList.add('active');
    }

    async updateFeedEntry() {
        if (!this.editingEntryId) return;

        const amount = parseFloat(document.getElementById('editFeedAmount').value);
        const date = document.getElementById('editFeedDate').value;
        const supplements = Array.from(document.querySelectorAll('#editFeedSupplements .supplement-option.selected'))
            .map(el => el.textContent.trim());
        const newTrayResults = Array.from(document.querySelectorAll('.edit-tray-select')).map(sel => sel.value);
        
        const entry = this.state.feedEntries.find(e => e.id == this.editingEntryId);
        if (!entry) return;

        const oldAmount = entry.amount;
        const diff = amount - oldAmount;

        // Update single trayResult for backward compatibility
        let worstResult = 'empty';
        if (newTrayResults.includes('too-much')) worstResult = 'too-much';
        else if (newTrayResults.includes('half')) worstResult = 'half';
        else if (newTrayResults.includes('little')) worstResult = 'little';

        this.showLoading(true);
        const entryRef = this.db.collection('feedEntries').doc(this.editingEntryId.toString());
        await entryRef.update({
            amount: amount,
            date: date,
            supplements: supplements,
            trayResults: newTrayResults,
            trayResult: worstResult
        });

        // FACT 2: DOUBLE DIP FIX
        // Removed frontend inventory update. Backend should handle adjustments (requires logic update in backend if amount changes).
        
        this.recalculateTankBiomass(entry.tankId);
        this.showLoading(false);
        this.closeAllModals();
        // No need to call renderAll(), onSnapshot will handle it.
        this.showToast('Entry updated');
    }

    async deleteCurrentFeedEntry() {
        if (!this.editingEntryId) return;
        
        if (!confirm('Are you sure you want to delete this feed entry?')) return;

        const entry = this.state.feedEntries.find(e => e.id == this.editingEntryId);
        const tankId = entry ? entry.tankId : null;
        const amount = entry ? entry.amount : 0;

        this.showLoading(true);
        await this.db.collection('feedEntries').doc(this.editingEntryId.toString()).delete();
        
        // FACT 2: DOUBLE DIP FIX
        // Removed frontend inventory refund. Backend trigger should handle refund on delete.

        if (tankId) this.recalculateTankBiomass(tankId);
        this.closeAllModals();
        this.showLoading(false);
        // No need to call renderAll(), onSnapshot will handle it.
        this.showToast('Entry deleted', 'warning');
    }

    // Prices
    renderPrices() {
        const container = document.getElementById('priceRows');
        container.innerHTML = this.state.prices.map(p => `
            <div class="price-row">
                <div class="price-count">${p.count}c</div>
                <div class="price-value">₹${p.price}</div>
                <div class="price-change ${p.change.includes('+') ? 'up' : 'down'}">${p.change}</div>
                <div class="price-trend">
                    <i class="fas fa-arrow-${p.trend === 'up' ? 'up' : p.trend === 'down' ? 'down' : 'right'}" style="color: var(--${p.trend});"></i>
                    <span class="trend-${p.trend}">${p.trend.toUpperCase()}</span>
                </div>
            </div>
        `).join('');
    }

    calculateHarvestValue() {
        const yieldVal = parseFloat(document.getElementById('harvestYield').value);
        const size = parseInt(document.getElementById('harvestSize').value);
        
        if (!yieldVal) return;

        const priceObj = this.state.prices.find(p => p.count == size);
        if (priceObj) {
            const total = yieldVal * priceObj.price;
            document.getElementById('harvestValue').textContent = `₹${total.toLocaleString()}`;
            document.getElementById('harvestResult').style.display = 'block';
        }
    }

    openTankDetail(tankId) {
        const tank = this.getTankById(tankId);
        if (!tank) return;

        // Restore the original structure for editTrayStatus if it was replaced
        const trayStatusGroup = document.getElementById('editTrayStatusGroup');
        if (!trayStatusGroup.querySelector('#editTrayStatus')) {
            trayStatusGroup.innerHTML = `
                <label>Tray Status</label>
                <select id="editTrayStatus" class="form-control">
                    <option value="pending">Pending Check</option>
                    <option value="empty">Empty</option>
                    <option value="little">Little Left</option>
                    <option value="half">Half Full</option>
                    <option value="too-much">Too Much</option>
                    <option value="unknown">Unknown</option>
                </select>
            `;
        }

        const farm = this.getFarmById(tank.farmId);
        const entries = this.state.feedEntries.filter(e => e.tankId == tankId);
        const totalFeed = entries.reduce((sum, e) => sum + e.amount, 0);

        // Get latest ABW
        const samples = this.state.samplingEntries.filter(s => s.tankId == tankId).sort((a,b) => new Date(b.date) - new Date(a.date));
        const latestABW = samples.length > 0 ? samples[0].abw : 0;

        const content = document.getElementById('tankDetailContent');
        this.editingTankId = tankId; // Important for footer actions

        content.innerHTML = `
            <div class="form-group">
                <label>Farm</label>
                <div class="form-control" style="background: #f8f9fa;">${farm ? farm.name : 'Unknown'}</div>
            </div>
            <div class="form-group">
                <label>Tank Name</label>
                <div class="form-control" style="background: #f8f9fa;">${tank.name}</div>
            </div>
            <div class="form-group">
                <label>Stocking Date</label>
                <div class="form-control" style="background: #f8f9fa;">${new Date(tank.stockingDate).toLocaleDateString()}</div>
            </div>
            <div class="overall-stats" style="margin-top: 20px;">
                <div class="stat-card">
                    <div class="stat-value">${totalFeed.toFixed(1)}</div>
                    <div class="stat-label">Total Feed (kg)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${entries.length}</div>
                    <div class="stat-label">Feed Entries</div>
                </div>
                <div class="stat-card" style="border-color: var(--info);">
                    <div class="stat-value" style="color: var(--info);">${latestABW}g</div>
                    <div class="stat-label">Current ABW</div>
                </div>
            </div>

            <!-- Growth Chart -->
            <div class="chart-container" style="height: 250px; margin-top: 20px; background: white; border: 2px solid var(--border); border-radius: var(--radius); padding: 10px; display: none;" id="growthChartContainer">
                <canvas id="growthChart"></canvas>
            </div>
        `;
        
        const footer = document.getElementById('tankDetailFooter');
        const isInactive = tank.status === 'inactive';

        if (isInactive) {
            footer.innerHTML = `
                <button class="btn btn-success" style="width: 100%;" onclick="app.openStartNewCropModal('${tank.id}')">
                    <i class="fas fa-sync-alt"></i> Start New Crop
                </button>
            `;
        } else {
            footer.innerHTML = `
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom: 8px;">
                     <button class="btn btn-primary" onclick="app.openSamplingModal('${tank.id}')">
                        <i class="fas fa-balance-scale"></i> Sample
                    </button>
                     <button class="btn btn-info" style="background-color: var(--info); color: white;" onclick="app.openApplyMedicineModal('${tank.id}')">
                        <i class="fas fa-syringe"></i> Medicine
                    </button>
                </div>
                <div style="display:flex; gap:8px; width:100%;">
                    <button class="btn btn-danger" style="flex:1;" onclick="app.openEndCropModal('${tank.id}')">
                        <i class="fas fa-flag-checkered"></i> End Crop
                    </button>
                    <button class="btn btn-warning" style="flex:1;" onclick="app.openPartialHarvestModal('${tank.id}')">
                        <i class="fas fa-weight-hanging"></i> Partial
                    </button>
                </div>
            `;
        }

        document.getElementById('tankDetailTitle').textContent = tank.name;
        document.getElementById('tankDetailModal').classList.add('active');
        this.renderGrowthChart(tankId);
    }

    // Settings
    openSettingsModal() {
        this.renderSettingsSupplements();
        this.renderSettingsFeedTypes();
        document.getElementById('settingFeedsPerDay').value = this.state.settings.feedsPerDay || 4;

        const footer = document.querySelector('#settingsModal .modal-footer');
        footer.innerHTML = `<button class="btn btn-secondary" onclick="app.signOut()">Sign Out</button>`;
        
        document.getElementById('settingsModal').classList.add('active');
    }

    async openTeamManagement() {
        const list = document.getElementById('teamMembersList');
        const section = document.getElementById('teamManagementSection');
        const currentFarm = this.getFarmById(this.state.settings.currentFarmId);

        if (!currentFarm || this.currentUser.uid !== currentFarm.ownerId) {
            section.style.display = 'none';
            return;
        }
        section.style.display = 'block';
        list.innerHTML = '<div class="text-muted">Loading team...</div>';

        const members = currentFarm.members || {};
        let html = '';
        for (const uid in members) {
            if (uid === currentFarm.ownerId) continue; // Don't list the owner themselves

            const userProfile = await this.getUserProfile({ uid });
            const name = userProfile ? userProfile.name : 'Invited User';
            const phone = userProfile ? userProfile.phone : '...';

            html += `
                <div class="settings-item">
                    <div>
                        <span style="font-weight: 600;">${name}</span>
                        <span style="font-size: 12px; color: var(--gray); display: block;">${phone} - <strong>${members[uid]}</strong></span>
                    </div>
                    <button class="btn-icon" style="color: var(--danger);" onclick="app.removeMember('${uid}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        list.innerHTML = html || '<div class="text-muted">No other members on this farm.</div>';
    }

    async inviteMember() {
        const phone = document.getElementById('invitePhone').value;
        const role = document.getElementById('inviteRole').value;
        const farmId = this.state.settings.currentFarmId;
        const farm = this.getFarmById(farmId);

        if (!/^\+?[1-9]\d{1,14}$/.test(phone)) {
            this.showToast('Please enter a valid phone number with country code.', 'error');
            return;
        }

        const invitation = { farmId, farmName: farm.name, invitedByUid: this.currentUser.uid, invitedByName: this.currentUser.name, phone, role, status: 'pending', createdAt: new Date() };
        await this.db.collection('invitations').add(invitation);
        this.showToast(`Invitation sent to ${phone}!`, 'success');
    }

    async generateInviteLink() {
        const role = document.getElementById('inviteRole').value;
        const farmId = this.state.settings.currentFarmId;
        const farm = this.getFarmById(farmId);
        
        if (!farm) return;

        this.showLoading(true);
        try {
            const invitation = {
                farmId,
                farmName: farm.name,
                invitedByUid: this.currentUser.uid,
                invitedByName: this.currentUser.name,
                role,
                type: 'link',
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            const docRef = await this.db.collection('invitations').add(invitation);
            const link = `${window.location.origin}${window.location.pathname}?invite=${docRef.id}`;
            
            if (navigator.share) {
                await navigator.share({
                    title: 'Join Farm - AquaBook Pro',
                    text: `${this.currentUser.name} invited you to join ${farm.name} as a ${role}.`,
                    url: link
                });
            } else {
                await navigator.clipboard.writeText(link);
                this.showToast('Invite link copied to clipboard!');
            }
        } catch (e) {
            console.error(e);
            this.showToast('Error creating link', 'error');
        }
        this.showLoading(false);
    }

    async shareViaWhatsApp() {
        const role = document.getElementById('inviteRole').value;
        const farmId = this.state.settings.currentFarmId;
        const farm = this.getFarmById(farmId);
        
        if (!farm) return;

        this.showLoading(true);
        try {
            const invitation = {
                farmId,
                farmName: farm.name,
                invitedByUid: this.currentUser.uid,
                invitedByName: this.currentUser.name,
                role,
                type: 'link',
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            const docRef = await this.db.collection('invitations').add(invitation);
            const link = `${window.location.origin}${window.location.pathname}?invite=${docRef.id}`;
            const message = `Hello! I'm inviting you to join ${farm.name} as a ${role} on AquaBook Pro. Click here: ${link}`;
            
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
            
        } catch (e) {
            console.error(e);
            this.showToast('Error creating WhatsApp link', 'error');
        }
        this.showLoading(false);
    }

    async processLinkInvitation(inviteId, user) {
        try {
            const docRef = this.db.collection('invitations').doc(inviteId);
            const doc = await docRef.get();
            
            if (!doc.exists) {
                this.showToast('Invalid invitation link', 'error');
                return;
            }
            
            const invite = doc.data();
            if (invite.status !== 'pending') {
                this.showToast('This invitation has already been used', 'warning');
                return;
            }
            
            // Check if already a member
            const farmDoc = await this.db.collection('farms').doc(invite.farmId).get();
            if (farmDoc.exists) {
                const farm = farmDoc.data();
                if (farm.memberIds && farm.memberIds.includes(user.uid)) {
                    return; // Already a member, silently ignore
                }
            }

            if (confirm(`Accept invitation to join "${invite.farmName}" as a ${invite.role}?`)) {
                this.showLoading(true);
                await docRef.update({ status: 'accepted', claimedByUid: user.uid, claimedByName: user.name, claimedAt: new Date().toISOString() });
                const updateData = {};
                updateData[`members.${user.uid}`] = invite.role;
                updateData['memberIds'] = firebase.firestore.FieldValue.arrayUnion(user.uid);
                await this.db.collection('farms').doc(invite.farmId).update(updateData);
                this.showToast('Joined farm successfully!', 'success');
                await this.loadAllData(); // Reload to see new farm
            }
        } catch (e) {
            console.error("Link Invite Error", e);
            this.showToast('Error processing invitation', 'error');
        }
        this.showLoading(false);
    }

    renderSettingsSupplements() {
        const list = document.getElementById('settingsSupplementsList');
        list.innerHTML = this.state.settings.supplements.map(s => `
            <div class="settings-item">
                <span>${s}</span>
                <button class="btn-icon" style="color: var(--danger);" onclick="app.removeSupplement('${s}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    renderSettingsFeedTypes() {
        const list = document.getElementById('settingsFeedTypesList');
        list.innerHTML = this.state.settings.feedTypes.map(s => `
            <div class="settings-item">
                <span>${s}</span>
                <button class="btn-icon" style="color: var(--danger);" onclick="app.removeFeedType('${s}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    updateFeedsPerDay(val) {
        this.state.settings.feedsPerDay = parseInt(val);
        this.saveSettings();
        this.renderLogBook();
    }

    addNewSupplement() {
        const input = document.getElementById('newSupplementInput');
        const name = input.value.trim();
        if (name && !this.state.settings.supplements.includes(name)) {
            this.state.settings.supplements.push(name);
            this.saveSettings();
            this.renderSettingsSupplements();
            input.value = '';
        }
    }

    removeSupplement(name) {
        this.state.settings.supplements = this.state.settings.supplements.filter(s => s !== name);
        this.saveSettings();
        this.renderSettingsSupplements();
    }

    addNewFeedType() {
        const input = document.getElementById('newFeedTypeInput');
        const name = input.value.trim();
        if (name && !this.state.settings.feedTypes.includes(name)) {
            this.state.settings.feedTypes.push(name);
            this.saveSettings();
            this.renderSettingsFeedTypes();
            input.value = '';
        }
    }

    removeFeedType(name) {
        this.state.settings.feedTypes = this.state.settings.feedTypes.filter(s => s !== name);
        this.saveSettings();
        this.renderSettingsFeedTypes();
    }

    // ===== CROP CYCLE MANAGEMENT =====
    openEndCropModal(tankId) {
        this.currentHarvestTankId = tankId;
        document.getElementById('endCropDate').value = this.currentDate;
        document.getElementById('endCropWeight').value = '';
        document.getElementById('endCropCount').value = '';
        this.closeAllModals();
        document.getElementById('endCropModal').classList.add('active');
    }

    async saveEndCrop() {
        const tankId = this.currentHarvestTankId;
        const date = document.getElementById('endCropDate').value;
        const weight = parseFloat(document.getElementById('endCropWeight').value);
        const count = parseFloat(document.getElementById('endCropCount').value);

        if (!weight || !count) {
            this.showToast('Please enter final weight and count', 'error');
            return;
        }

        const tank = this.getTankById(tankId);
        if (!tank) return;

        if (!confirm(`Are you sure you want to end the crop cycle for "${tank.name}"? The tank will become inactive.`)) {
            return;
        }

        // Create final harvest record
        const harvest = {
            id: Date.now(),
            tankId,
            farmId: tank.farmId,
            date,
            weight,
            count,
            type: 'final'
        };
        this.state.harvests.push(harvest);
        await this.db.collection('harvests').doc(harvest.id.toString()).set(harvest);

        // Update tank status
        tank.status = 'inactive';
        await this.db.collection('tanks').doc(tank.id).update({ status: 'inactive' });

        this.closeAllModals();
        this.renderAll();
        this.showToast(`Crop cycle for ${tank.name} ended.`, 'success');
    }

    openStartNewCropModal(tankId) {
        this.editingTankId = tankId;
        document.getElementById('newStockingDate').value = this.currentDate;
        document.getElementById('newInitialSeed').value = '';
        this.closeAllModals();
        document.getElementById('startNewCropModal').classList.add('active');
    }

    async saveNewCrop() {
        const tankId = this.editingTankId;
        const newStockingDate = document.getElementById('newStockingDate').value;
        const newInitialSeed = parseInt(document.getElementById('newInitialSeed').value);

        if (!newStockingDate || !newInitialSeed || newInitialSeed <= 0) {
            this.showToast('Please provide a valid stocking date and seed count.', 'error');
            return;
        }

        const tank = this.getTankById(tankId);
        if (!tank) return;

        if (!confirm(`FINAL WARNING:

All existing data for "${tank.name}" (feed logs, water tests, harvests) will be permanently deleted. This cannot be undone.

Are you sure you want to start a new crop cycle?`)) {
            return;
        }

        this.showLoading(true);

        // Delete associated data safely using helper
        await this.deleteCollectionByQuery(this.db.collection('feedEntries').where('tankId', '==', tankId));
        await this.deleteCollectionByQuery(this.db.collection('waterEntries').where('tankId', '==', tankId));
        await this.deleteCollectionByQuery(this.db.collection('harvests').where('tankId', '==', tankId));

        this.state.feedEntries = this.state.feedEntries.filter(e => e.tankId != tankId);
        this.state.waterEntries = this.state.waterEntries.filter(e => e.tankId != tankId);
        this.state.harvests = this.state.harvests.filter(h => h.tankId != tankId);

        // Update tank
        tank.status = 'active';
        tank.stockingDate = newStockingDate;
        tank.initialSeed = newInitialSeed;
        tank.currentSeed = newInitialSeed;
        tank.biomass = 0;
        tank.nextSuggestedFeed = null;

        await this.db.collection('tanks').doc(tankId).update({ 
            status: 'active', stockingDate: newStockingDate, initialSeed: newInitialSeed, currentSeed: newInitialSeed, biomass: 0, nextSuggestedFeed: null 
        });

        this.showLoading(false);
        this.closeAllModals();
        this.renderAll();
        this.showToast(`New crop cycle started for ${tank.name}!`, 'success');
    }

    // ===== SAMPLING & GROWTH CHART =====
    openSamplingModal(tankId) {
        if(tankId) this.editingTankId = tankId;
        document.getElementById('sampleDate').value = this.currentDate;
        document.getElementById('sampleWeight').value = '';
        document.getElementById('sampleCount').value = '';
        document.getElementById('abwResultCard').style.display = 'none';
        
        const calcABW = () => {
            const w = parseFloat(document.getElementById('sampleWeight').value);
            const c = parseFloat(document.getElementById('sampleCount').value);
            if(w && c) {
                const abw = (w/c).toFixed(2);
                document.getElementById('calculatedABW').textContent = `${abw}g`;
                document.getElementById('abwResultCard').style.display = 'block';
            }
        };
        document.getElementById('sampleWeight').onkeyup = calcABW;
        document.getElementById('sampleCount').onkeyup = calcABW;
        document.getElementById('sampleWeight').onchange = calcABW;
        document.getElementById('sampleCount').onchange = calcABW;

        this.closeAllModals();
        document.getElementById('samplingModal').classList.add('active');
    }

    async saveSampling() {
        const tankId = this.editingTankId;
        const tank = this.getTankById(tankId);
        const date = document.getElementById('sampleDate').value;
        const weight = parseFloat(document.getElementById('sampleWeight').value);
        const count = parseFloat(document.getElementById('sampleCount').value);

        if(!weight || !count) { this.showToast('Invalid input', 'error'); return; }

        const abw = parseFloat((weight/count).toFixed(2));
        const sample = {
            id: Date.now(), tankId, farmId: tank.farmId, date, weight, count, abw
        };
        this.state.samplingEntries.push(sample);
        
        await this.db.collection('sampling').doc(sample.id.toString()).set(sample);
        await this.recalculateTankBiomass(tankId); // Update biomass based on new ABW
        this.closeAllModals();
        this.showToast(`Sample logged! ABW: ${abw}g`);
        if(tankId) this.openTankDetail(tankId);
    }

    renderGrowthChart(tankId) {
        const ctx = document.getElementById('growthChart');
        const container = document.getElementById('growthChartContainer');
        if (!ctx || !container) return;

        const samples = this.state.samplingEntries
            .filter(s => s.tankId == tankId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (samples.length < 2) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';

        const labels = samples.map(s => new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
        const data = samples.map(s => s.abw);

        if (this.growthChart) this.growthChart.destroy();

        this.growthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'ABW (g)',
                    data: data,
                    borderColor: '#9C27B0',
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Growth Trend (ABW)' },
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: false }
                }
            }
        });
    }

    // ===== PARTIAL HARVEST =====
    openPartialHarvestModal(tankId) {
        this.currentHarvestTankId = tankId;
        document.getElementById('harvestDate').value = this.currentDate;
        document.getElementById('harvestWeight').value = '';
        document.getElementById('harvestCount').value = '';
        this.closeAllModals();
        document.getElementById('partialHarvestModal').classList.add('active');
    }

    async savePartialHarvest() {
        const tankId = this.currentHarvestTankId;
        const date = document.getElementById('harvestDate').value;
        const weight = parseFloat(document.getElementById('harvestWeight').value);
        const count = parseFloat(document.getElementById('harvestCount').value);

        if (!weight || !count) {
            this.showToast('Please enter weight and count', 'error');
            return;
        }

        const tank = this.getTankById(tankId);
        
        // Record Harvest
        const harvest = {
            id: Date.now(),
            tankId,
            farmId: tank.farmId,
            date,
            weight,
            count
        };
        this.state.harvests.push(harvest);
        await this.db.collection('harvests').doc(harvest.id.toString()).set(harvest);

        // Update Tank Stats
        // 1. Update Biomass
        const oldBiomass = tank.biomass || 0;
        const newBiomass = Math.max(0, oldBiomass - weight);
        tank.biomass = newBiomass;

        // 2. Update Seed Count (Approximate)
        // Harvested pieces = Weight (kg) * Count (pcs/kg)
        const harvestedPcs = weight * count;
        // If we don't have currentSeed, assume initialSeed is the start
        if (!tank.currentSeed) tank.currentSeed = tank.initialSeed;
        tank.currentSeed = Math.max(0, Math.floor(tank.currentSeed - harvestedPcs));

        await this.db.collection('tanks').doc(tank.id).update({ biomass: newBiomass, currentSeed: tank.currentSeed });

        // Generate Plan
        this.renderHarvestPlan(tank, weight, count, newBiomass, tank.currentSeed);
        
        this.closeAllModals();
        document.getElementById('harvestPlanModal').classList.add('active');
        this.renderAll();
    }

    renderHarvestPlan(tank, hWeight, hCount, remBiomass, remSeed) {
        const content = document.getElementById('harvestPlanContent');
        // Simple feed logic: 2% of biomass for maintenance/growth after stress
        const suggestedFeed = (remBiomass * 0.02).toFixed(1); 

        content.innerHTML = `
            <div class="stat-card" style="margin-bottom:16px; border-color:var(--success);">
                <div class="stat-label">Harvest Recorded</div>
                <div class="stat-value" style="color:var(--success);">${hWeight} kg <span style="font-size:14px; color:var(--gray);">@ ${hCount}c</span></div>
            </div>
            
            <div class="plan-card">
                <div class="plan-title"><i class="fas fa-chart-line"></i> Status Update</div>
                <p><strong>Remaining Biomass:</strong> ${remBiomass.toFixed(1)} kg</p>
                <p><strong>Est. Remaining Stock:</strong> ${remSeed.toLocaleString()} pcs</p>
                <p><strong>New Feed Target:</strong> ~${suggestedFeed} kg/day</p>
            </div>

            <div class="plan-card" style="background:#fff3e0; border-color:#ff9800;">
                <div class="plan-title" style="color:#e65100;"><i class="fas fa-exclamation-circle"></i> Immediate Actions</div>
                <ul style="padding-left:20px; font-size:13px; line-height:1.6;">
                    <li><strong>Stop Feed:</strong> Skip the next scheduled feed to allow tank to settle.</li>
                    <li><strong>Check Bottom:</strong> Harvesting disturbs sludge. Apply <strong>Probiotics</strong> (Soil/Water) immediately to prevent ammonia spikes.</li>
                    <li><strong>Monitor Oxygen:</strong> Ensure aerators are running full capacity tonight.</li>
                    <li><strong>Resume Feeding:</strong> Start with 50% of the new target (${(suggestedFeed/2).toFixed(1)} kg) tomorrow and increase gradually.</li>
                </ul>
            </div>
        `;
    }

    shareApp() {
        if (navigator.share) {
            navigator.share({
                title: 'AquaBook Pro',
                text: 'Manage your shrimp farm efficiently with AquaBook Pro. Track feed, water quality, and expenses in one place.',
                url: window.location.href
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href).then(() => {
                this.showToast('App link copied to clipboard!');
            });
        }
    }

    // ===== DATA BACKUP & RESTORE =====
    exportLogbookToCSV() {
        const currentFarmId = this.state.settings.currentFarmId;
        if (!currentFarmId) {
            this.showToast("Please select a farm first.", "error");
            return;
        }

        const farmTanks = this.state.tanks.filter(t => t.farmId === currentFarmId);
        const tankMap = {};
        farmTanks.forEach(t => tankMap[t.id] = t.name);
        
        // Filter entries for current farm and sort by date descending
        const entries = this.state.feedEntries
            .filter(e => tankMap[e.tankId])
            .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);

        if (entries.length === 0) {
            this.showToast("No data to export.", "info");
            return;
        }

        // CSV Header
        let csvContent = "Date,Time,Tank Name,Amount (kg),Tray Result,Supplements,Notes\n";

        entries.forEach(e => {
            const tankName = tankMap[e.tankId] || "Unknown";
            const supplements = e.supplements ? `"${e.supplements.join('; ')}"` : "";
            const notes = e.notes ? `"${e.notes.replace(/"/g, '""')}"` : "";
            const time = e.time || "";
            
            const row = [e.date, time, tankName, e.amount, e.trayResult, supplements, notes].join(",");
            csvContent += row + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `aquabook_log_${this.getFormattedDate()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    exportData() {
        const data = {
            farms: this.state.farms,
            tanks: this.state.tanks,
            feedEntries: this.state.feedEntries,
            harvests: this.state.harvests,
            waterEntries: this.state.waterEntries,
            samplingEntries: this.state.samplingEntries,
            inventory: this.state.inventory,
            medicineInventory: this.state.medicineInventory,
            medicineApplications: this.state.medicineApplications,
            settings: this.state.settings,
            prices: this.state.prices,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "aquabook_backup_" + this.getFormattedDate() + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        this.showToast('Backup file downloaded successfully');
    }

    // Helper to delete large collections in chunks
    async deleteCollectionByQuery(query) {
        const snapshot = await query.get();
        const batchSize = 400; // Safe limit below 500
        if (snapshot.size === 0) return;

        let batch = this.db.batch();
        let count = 0;
        
        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;
            if (count >= batchSize) {
                await batch.commit();
                batch = this.db.batch();
                count = 0;
            }
        }
        if (count > 0) {
            await batch.commit();
        }
    }
}

// ===== INITIALIZE APP =====
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AquaBookPro();
});

// Register Service Worker for PWA (Offline Support)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed', err));
    });
}

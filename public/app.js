// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw",
  authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
  projectId: "coastal-fresh---sea-foods",
  storageBucket: "coastal-fresh---sea-foods.firebasestorage.app",
  messagingSenderId: "782759620106",
  appId: "1:782759620106:web:960ec7c125faa30675f9f3",
  measurementId: "G-468VYWGBHM"
};

class AquaRythu {
constructor() {
// Initialize Firebase Auth reference
this.auth = null;
this.userId = null;

this.state = {
farm: null, // Single farm object
tanks: [],
feedLogs: [], // Renamed from feedEntries
harvests: [],
waterQuality: [],
applications: [],
inventory: { totalKg: 0 },
            // Disease / health logs per tank
            diseases: [],
medicineInventory: [],
            settings: {
farmId: null, // Single farm
feedsPerDay: 4,
feedPrice: 90,
marketPrice: 350,
feedJumpThreshold: 30,
analyticsEnabled: false, // Disabled for cost lock
            feedTimes: [6, 10, 14, 18], // Default feed times
            trayCheckPercentages: { range1: 0.3, range2: 0.6, range3: 1.0 }, // 3g to 10g per kg
            farmType: 'semi',          // extensive | semi | intensive
            blindFeedingDuration: 30   // global default, can be overridden per tank
}
};


this.initialized = false;
this.editingEntryId = null;
this.editingFarmId = null;
this.editingTankId = null;
this.editingScheduleTankId = null;
this.transitionTankId = null;
this.activeLogTankId = null;
this.currentCheck = {};
this.viewMode = 'today';
this.analyticsEvents = [];
this.userId = null; // Will be set by Firebase Auth
this.feedJumpDetected = {};
this.pondSwitchCount = 0;
this.lastPondSwitchTime = null;
this.pondComparisonTooltipShown = false;
this.ignoredBlindTransitions = new Set();
this.charts = {};
this.currentChartTab = 'feed';
this.chartDateRange = 30;
this.isSaving = false;
this.saveQueue = [];
this.dynamicModals = [];
this.db = null;
// Removed multi-farm listeners for cost lock

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', () => this.init());
} else {
this.init();
}
}

get currentDate() {
return this.getFormattedDate();
}

// ===== LIFECYCLE AWARENESS SYSTEM =====
// Pond lifecycle states
get LIFECYCLE_STATES() {
return {
PRE_STOCK: 'PRE_STOCK',
BLIND_FEED: 'BLIND_FEED',
TRAY_ACTIVE: 'TRAY_ACTIVE',
OPTIMIZATION: 'OPTIMIZATION',
HARVEST_READY: 'HARVEST_READY',
HARVESTED: 'HARVESTED'
};
}

// Lifecycle state configuration
getLifecycleConfig() {
return {
PRE_STOCK: {
label: 'Pre-Stocking',
icon: '🔧',
color: '#9E9E9E',
bgColor: '#F5F5F5',
description: 'Pond preparation phase',
docRange: [null, 0]
},
BLIND_FEED: {
label: 'Blind Feeding',
icon: '🌱',
color: '#FF9800',
bgColor: '#FFF3E0',
description: 'Initial growth without tray checks',
docRange: [0, 30]
},
TRAY_ACTIVE: {
label: 'Tray Training',
icon: '📊',
color: '#2196F3',
bgColor: '#E3F2FD',
description: 'Active tray-based feeding',
docRange: [30, 60]
},
OPTIMIZATION: {
label: 'Optimization',
icon: '⚡',
color: '#4CAF50',
bgColor: '#E8F5E9',
description: 'Peak growth optimization',
docRange: [60, 90]
},
HARVEST_READY: {
label: 'Harvest Ready',
icon: '🎯',
color: '#9C27B0',
bgColor: '#F3E5F5',
description: 'Ready for harvest',
docRange: [90, 120]
},
HARVESTED: {
label: 'Harvested',
icon: '✅',
color: '#607D8B',
bgColor: '#ECEFF1',
description: 'Crop completed',
docRange: [120, null]
}
};
}

// Calculate lifecycle state based on DOC and tank data
calculateLifecycleState(tank) {
if (!tank) return this.LIFECYCLE_STATES.PRE_STOCK;

const doc = this.getDaysOld(tank.stockingDate);
const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
const hasTransitioned = tank.hasTransitionedFromBlind;
const status = tank.status;

if (status === 'harvested' || status === 'archived') {
return this.LIFECYCLE_STATES.HARVESTED;
}

if (status === 'inactive') {
return this.LIFECYCLE_STATES.PRE_STOCK;
}

if (doc < 0) {
return this.LIFECYCLE_STATES.PRE_STOCK;
}

if (doc <= blindDuration && !hasTransitioned) {
return this.LIFECYCLE_STATES.BLIND_FEED;
}

const trayEntries = this.state.feedLogs.filter(e => 
e.tankId === tank.id && 
e.trayResult && 
e.trayResult !== 'pending' && 
e.trayResult !== 'blind-fed'
);

if (doc <= 60 || trayEntries.length < 20) {
return this.LIFECYCLE_STATES.TRAY_ACTIVE;
}

if (doc <= 90) {
return this.LIFECYCLE_STATES.OPTIMIZATION;
}

return this.LIFECYCLE_STATES.HARVEST_READY;
}

// Get lifecycle state info
getLifecycleStateInfo(state) {
const config = this.getLifecycleConfig();
return config[state] || config.PRE_STOCK;
}

// Update tank lifecycle state
updateTankLifecycleState(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

const newState = this.calculateLifecycleState(tank);
const oldState = tank.lifecycleState;

if (oldState !== newState) {
tank.lifecycleState = newState;
tank.lifecycleStateUpdatedAt = new Date().toISOString();
this.saveTanks();
this.trackEvent('lifecycle_transition', {
tank_id: tankId,
from_state: oldState,
to_state: newState,
doc: this.getDaysOld(tank.stockingDate)
});
}

return newState;
}

// Update all tank lifecycle states
updateAllLifecycleStates() {
this.state.tanks.forEach(tank => {
if (tank.status !== 'archived') {
this.updateTankLifecycleState(tank.id);
}
});
}

// Check if feature is available in current lifecycle state
isFeatureAvailable(tank, feature) {
const state = tank.lifecycleState || this.calculateLifecycleState(tank);
const featureMatrix = {
PRE_STOCK: {
canLogFeed: false,
canCheckTray: false,
canViewSchedule: false,
canHarvest: false,
showBlindSchedule: false
},
BLIND_FEED: {
canLogFeed: true,
canCheckTray: false,
canViewSchedule: true,
canHarvest: false,
showBlindSchedule: true
},
TRAY_ACTIVE: {
canLogFeed: true,
canCheckTray: true,
canViewSchedule: true,
canHarvest: false,
showBlindSchedule: false
},
OPTIMIZATION: {
canLogFeed: true,
canCheckTray: true,
canViewSchedule: true,
canHarvest: false,
showBlindSchedule: false
},
HARVEST_READY: {
canLogFeed: true,
canCheckTray: true,
canViewSchedule: true,
canHarvest: true,
showBlindSchedule: false
},
HARVESTED: {
canLogFeed: false,
canCheckTray: false,
canViewSchedule: false,
canHarvest: false,
showBlindSchedule: false
}
};

return featureMatrix[state]?.[feature] || false;
}


trackEvent(eventName, metadata = {}) {
if (!this.state.settings.analyticsEnabled) return;
const event = {
event: eventName,
user_id: this.userId,
timestamp: new Date().toISOString(),
...metadata
};
this.analyticsEvents.push(event);
// Save events to localStorage
this.saveAnalyticsEvents();
this.handleAnalyticsEvent(eventName, metadata);
}

saveAnalyticsEvents() {
  return this.enqueueSave(() => {
    try {
      localStorage.setItem('aquabook_analytics', JSON.stringify(this.analyticsEvents));
    } catch (e) {
      console.error('Failed to save analytics events:', e);
      // Do not block main flow; surface a toast for visibility
      this.showToast('Failed to persist analytics events.', 'warning');
      throw e;
    }
  });
}

// Lightweight error reporting
reportError(err, context = {}) {
  try {
    const payload = {
      message: (err && err.message) ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
      user_id: this.userId,
      ts: new Date().toISOString(),
      context
    };
    // Save to analytics events as an 'error' event for offline collection
    this.analyticsEvents.push({ event: 'client_error', payload });
    // Try to send to configured endpoint if provided
    const endpoint = (this.state && this.state.settings && this.state.settings.errorEndpoint) ? this.state.settings.errorEndpoint : null;
    if (endpoint) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(e => console.warn('Error reporting failed:', e));
    } else {
      // fallback: just console.log
      console.warn('Error reported (no endpoint):', payload);
    }
    // Attempt to persist analytics (non-blocking)
    try { this.saveAnalyticsEvents(); } catch (e) { /* ignore */ }
  } catch (e) {
    console.error('reportError failed:', e);
  }
}

checkBackupStatus() {
const banner = document.getElementById('backupWarningBanner');
if (!banner) return;

const lastBackup = this.state.settings.lastBackupDate;
const backupText = document.getElementById('backupWarningText');
if (!backupText) return;
if (!lastBackup) {
banner.style.display = 'block';
backupText.textContent = "You haven't backed up your data yet.";
return;
}

const days = this.getDaysOld(lastBackup);
if (days > 7) {
banner.style.display = 'block';
backupText.textContent = `Last backup was ${days} days ago.`;
} else {
banner.style.display = 'none';
}
}

renderFeedWasteSummary() {
const card = document.getElementById('feedWasteCard');
if (card) card.style.display = 'none';
}

// ===== PRODUCTION AUTHENTICATION METHODS =====

showLoginScreen() {
  const app = document.getElementById('app');
  if (app) {
    app.style.display = 'none';
  }
  
  // Create login modal if it doesn't exist
  let loginModal = document.getElementById('loginModal');
  if (!loginModal) {
    loginModal = document.createElement('div');
    loginModal.id = 'loginModal';
    loginModal.className = 'modal-overlay active';
    loginModal.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h2><i class="fas fa-farm"></i> AquaRythu Login</h2>
        </div>
        <div class="modal-body">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 48px; margin-bottom: 10px;">🐟</div>
            <p style="color: var(--gray);">Sign in to manage your aquaculture farm</p>
          </div>
          
          <div id="loginError" class="error-message" style="display: none; margin-bottom: 15px; color: var(--danger);"></div>
          
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="loginEmail" placeholder="Enter your email" class="form-control" onkeydown="if(event.key==='Enter') app.signIn()">
          </div>
          
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="loginPassword" placeholder="Enter your password" class="form-control" onkeydown="if(event.key==='Enter') app.signIn()">
          </div>
          
          <button class="btn btn-primary" onclick="app.signIn()" style="width: 100%; margin-bottom: 10px;">
            <i class="fas fa-sign-in-alt"></i> Sign In
          </button>
          
          <button class="btn btn-secondary" onclick="app.signUp()" style="width: 100%;">
            <i class="fas fa-user-plus"></i> Create New Account
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(loginModal);
  }
  
  // Handle Intent from URL (Login vs Signup)
  const params = new URLSearchParams(window.location.search);
  const intent = params.get('intent');
  const titleEl = loginModal.querySelector('.modal-header h2');
  if (titleEl) {
    if (intent === 'signup') {
      titleEl.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    } else {
      titleEl.innerHTML = '<i class="fas fa-farm"></i> AquaRythu Login';
    }
  }
  
  loginModal.classList.add('active');
  this.showLoading(false);
}

async signIn() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  
  if (!this.auth) {
    errorEl.textContent = 'System Error: Firebase Auth not initialized.';
    errorEl.style.display = 'block';
    return;
  }

  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password';
    errorEl.style.display = 'block';
    return;
  }
  
  try {
    await this.auth.signInWithEmailAndPassword(email, password);
    // Auth state listener will handle the rest
  } catch (error) {
    errorEl.textContent = this.getAuthErrorMessage(error.code);
    errorEl.style.display = 'block';
  }
}

async signUp() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  
  if (!this.auth) {
    errorEl.textContent = 'System Error: Firebase Auth not initialized.';
    errorEl.style.display = 'block';
    return;
  }

  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password';
    errorEl.style.display = 'block';
    return;
  }
  
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    errorEl.style.display = 'block';
    return;
  }
  
  try {
    await this.auth.createUserWithEmailAndPassword(email, password);
    // Auth state listener will handle the rest
  } catch (error) {
    errorEl.textContent = this.getAuthErrorMessage(error.code);
    errorEl.style.display = 'block';
  }
}

async signOut() {
  try {
    // COST-SAFETY: Unsubscribe from all real-time listeners to stop read costs
    if (this.unsubscribeSettings) this.unsubscribeSettings();
    if (this.unsubscribeFarm) this.unsubscribeFarm();
    if (this.unsubscribeTanks) this.unsubscribeTanks();
    
    await this.auth.signOut();
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

getAuthErrorMessage(errorCode) {
  if (!errorCode) return 'An unknown error occurred.';
  const errorMessages = {
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'An account with this email already exists',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/invalid-email': 'Please enter a valid email address',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later',
    'default': 'An error occurred. Please try again.'
  };
  return errorMessages[errorCode] || errorMessages['default'];
}

// Remove fake auth method
getOrCreateUserId() {
  // DEPRECATED: Use real Firebase Auth instead
  return null;
}

hasPermission(perm) { return true; }
can(feature) { return true; }

handleAnalyticsEvent(eventName, metadata) {
switch(eventName) {
case 'log_feed':
break;
case 'log_feed_7_days':
break;
case 'feed_jump_detected':
this.showFeedJumpBanner(metadata.pond_id);
break;
case 'open_performance_tab':
this.handlePerformanceTabOpen();
break;
case 'click_compare_ponds':
this.handlePondComparisonClick();
break;
case 'click_export':
this.handleExportClick();
break;
}
}

detectFeedJump(tankId, currentAmount) {
const tank = this.getTankById(tankId);
if (!tank) return false;
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = this.getFormattedDate(yesterday);
const todayEntries = this.state.feedLogs.filter(e =>
e.tankId === tankId && e.date === this.currentDate
);
const yesterdayEntries = this.state.feedLogs.filter(e =>
e.tankId === tankId && e.date === yesterdayStr
);
const todayTotal = todayEntries.reduce((sum, e) => sum + e.amount, 0);
const yesterdayTotal = yesterdayEntries.reduce((sum, e) => sum + e.amount, 0);
if (yesterdayTotal === 0) return false;
const increasePercentage = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
const threshold = this.state.settings.feedJumpThreshold || 30;
if (increasePercentage >= threshold) {
// Check if we already detected a jump today
const key = `${tankId}_${this.currentDate}`;
if (!this.feedJumpDetected[key]) {
this.feedJumpDetected[key] = true;
// Track the event
this.trackEvent('feed_jump_detected', {
pond_id: tankId,
increase_percentage: increasePercentage.toFixed(1),
yesterday_feed: yesterdayTotal,
today_feed: todayTotal,
doc: this.getDaysOld(tank.stockingDate)
});
return true;
}
}
return false;
}




showFeedJumpBanner(tankId) {
const banner = document.getElementById('feedJumpBanner');
if (banner) {
banner.classList.add('show');
// Auto-hide after 10 seconds
setTimeout(() => {
banner.classList.remove('show');
}, 10000);
}
}

handlePerformanceTabOpen() {
// All features available to all users
}

showPondComparisonTooltip() {
const tooltip = document.getElementById('pondComparisonTooltip');
if (tooltip) {
tooltip.style.display = 'block';
setTimeout(() => {
tooltip.style.display = 'none';
}, 5000);
}
}

handleExportClick() {
this.exportReportData();
}

loadAnalyticsEvents() {
try {
const saved = localStorage.getItem('aquabook_analytics');
this.analyticsEvents = saved ? JSON.parse(saved) : [];
} catch (e) {
this.analyticsEvents = [];
}
}

loadAllData() {
  if (!this.db || !this.userId) return;

  this.showLoading(true);

  // COST-LOCKED V1: Summary-first loading strategy
  
  // 1. Load user settings
  if (this.unsubscribeSettings) this.unsubscribeSettings();
  this.unsubscribeSettings = this.db.collection('users').doc(this.userId)
    .onSnapshot(doc => {
      if (doc.exists && doc.data().settings) {
        this.state.settings = { ...this.state.settings, ...doc.data().settings };
        this.renderAll();
      }
    });

  // 2. Load single farm (owner-based)
  if (this.unsubscribeFarm) this.unsubscribeFarm();
  this.unsubscribeFarm = this.db.collection('farms')
    .where('ownerUid', '==', this.userId)
    .limit(1) // Only one farm per user in V1
    .onSnapshot(snapshot => {
      const farms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (farms.length > 0) {
        this.state.farm = farms[0];
        this.state.settings.farmId = farms[0].id;
        this.loadFarmSummary(farms[0].id);
      } else {
        // No farm found - clear state
        this.state.farm = null;
        this.state.tanks = [];
        this.state.feedLogs = [];
        this.state.harvests = [];
        this.state.waterQuality = [];
        this.state.applications = [];
        this.state.diseases = [];
        this.renderAll();
        this.showLoading(false);
        this.checkFirstTimeUser();
      }
    }, error => {
      console.error("Error loading farm:", error);
      this.showToast('Error syncing data', 'error');
      this.showLoading(false);
    });
}

// COST-LOCKED V1: Load farm daily summary instead of full history
loadFarmSummary(farmId) {
  if (!farmId) return;
  
  // Load today's farm daily summary (1 read)
  const today = this.getFormattedDate();
  const farmDailyId = `${farmId}_${today.replace(/-/g, '_')}`;
  
  this.db.collection('farmDaily').doc(farmDailyId)
    .onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data();
        // Use summary for UI instead of loading all feed logs
        this.state.todaySummary = data;
        this.renderSummaryScreen();
      }
      this.showLoading(false);
    });
  
  // Load tanks for the farm (minimal data)
  this.loadTanksForFarm(farmId);
}

// COST-LOCKED V1: Render summary screen instead of full history
renderSummaryScreen() {
  if (!this.state.todaySummary) {
    // Fallback to tank-based rendering if no summary available
    this.renderLogBook();
    return;
  }

  const summary = this.state.todaySummary;
  const farmTanks = this.state.tanks || [];
  
  // Update UI with summary data
  const totalFeedEl = document.getElementById('totalFeedToday');
  const roundsDoneEl = document.getElementById('roundsCompletedToday');
  const lastFeedEl = document.getElementById('lastFeedAmount');
  
  if (totalFeedEl) totalFeedEl.textContent = `${summary.totalFeedKg?.toFixed(1) || 0} kg`;
  if (roundsDoneEl) roundsDoneEl.textContent = summary.roundsDone || 0;
  if (lastFeedEl) lastFeedEl.textContent = `${summary.lastFeedKg?.toFixed(1) || 0} kg`;
  
  // Render tank list with minimal data
  this.renderTankList(farmTanks);
}

renderTankList(tanks) {
  const container = document.getElementById('tankList');
  if (!container) return;
  
  if (tanks.length === 0) {
    container.innerHTML = '<div class="empty-state">No tanks found</div>';
    return;
  }
  
  container.innerHTML = tanks.map(tank => `
    <div class="tank-card" onclick="app.openTankDetail('${tank.id}')">
      <h4>${this.sanitizeHTML(tank.name)}</h4>
      <div class="tank-status">${tank.status || 'Active'}</div>
      <div class="tank-biomass">${tank.biomass?.toFixed(1) || 0} kg</div>
    </div>
  `).join('');
}

loadTanksForFarm(farmId) {
  if (this.unsubscribeTanks) this.unsubscribeTanks();
  this.unsubscribeTanks = this.db.collection('tanks')
    .where('farmId', '==', farmId)
    .limit(50) // COST-SAFETY: Limit tank loading to prevent runaway reads
    .onSnapshot(snapshot => {
      this.state.tanks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.renderAll();
    });
}

// COST-SAFETY: Use this method instead of loading all logs
async loadRecentLogsSafe(tankId) {
  if (!this.db || !this.userId) return;
  
  // Only load last 7 days of logs
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - 7);
  const dateStr = this.getFormattedDate(dateLimit);

  try {
    const snapshot = await this.db.collection('feedLogs')
      .where('tankId', '==', tankId)
      .where('date', '>=', dateStr)
      .orderBy('date', 'desc')
      .limit(50) // Hard limit to ensure you never read thousands of docs at once
      .get();
      
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Merge into state...
    console.log(`Loaded ${logs.length} logs safely.`);
    return logs;
  } catch (e) {
    console.error("Error loading logs:", e);
    return [];
  }
}

init() {
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  this.db = firebase.firestore();
  this.auth = firebase.auth(); // Initialize Firebase Auth
  
  // COST-SAFETY: Connect to Emulators when running locally
  // Run 'firebase emulators:start' in your terminal to use this
  // DISABLED by default to ensure login works with live DB if emulators aren't running
  /* if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.log("🔧 Localhost detected: Connecting to Firebase Emulators to save costs.");
    try {
      this.db.useEmulator("localhost", 8080);
      this.auth.useEmulator("http://localhost:9099");
      // If you use Functions: firebase.functions().useEmulator("localhost", 5001);
    } catch (e) {
      console.warn("Emulator connection failed (ignore if using live DB for testing)", e);
    }
  } */

  this.db.enablePersistence().catch(err => {
    if (err.code == 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
    } else if (err.code == 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });

  // COST-LOCKED V1: Real Firebase Auth listener
  this.auth.onAuthStateChanged(user => {
    if (user) {
      this.userId = user.uid;
      // Hide login modal and show app
      const loginModal = document.getElementById('loginModal');
      if (loginModal) {
        loginModal.classList.remove('active');
      }
      const app = document.getElementById('app');
      if (app) {
        app.style.display = 'block';
      }
      this.loadAllData();
    } else {
      // User is signed out - show login screen
      this.userId = null;
      this.state.farm = null;
      this.state.tanks = [];
      this.state.feedLogs = [];
      this.showLoginScreen();
      this.showLoading(false);
    }
  });
}
try {
this.showLoading(true);
this.setupUI();
this.checkFirstTimeUser();
this.renderAll();
this.setupEventListeners();

// Load analytics events
this.loadAnalyticsEvents();

setTimeout(() => {
this.showLoading(false);
this.initialized = true;
this.showToast(`Welcome to AquaRythu!`, 'success');
// Track app open
this.trackEvent('app_open');
    // Global error capture for client-side issues
    try {
      window.addEventListener('error', (ev) => {
        try { this.reportError(ev.error || ev.message || 'window.error', { filename: ev.filename, lineno: ev.lineno, colno: ev.colno }); } catch (e) { console.error(e); }
      });
      window.addEventListener('unhandledrejection', (ev) => {
        try { this.reportError(ev.reason || 'unhandledrejection', { promise: true }); } catch (e) { console.error(e); }
      });
    } catch (e) {
      console.warn('Global error handlers could not be registered', e);
    }
}, 800);
} catch (error) {
this.reportError(error, { phase: 'init' });
this.showLoading(false);
this.showToast("Something went wrong. Please refresh.", "error");
}
}

saveAllData() {
return this.enqueueSave(() => {
try {
localStorage.setItem('aquabook_farm', JSON.stringify(this.state.farm));
localStorage.setItem('aquabook_tanks', JSON.stringify(this.state.tanks));
localStorage.setItem('aquabook_feedLogs', JSON.stringify(this.state.feedLogs));
// Legacy compatibility
localStorage.setItem('aquabook_entries', JSON.stringify(this.state.feedLogs));
localStorage.setItem('aquabook_harvests', JSON.stringify(this.state.harvests));
localStorage.setItem('aquabook_water_quality', JSON.stringify(this.state.waterQuality));
localStorage.setItem('aquabook_applications', JSON.stringify(this.state.applications));
localStorage.setItem('aquabook_inventory', JSON.stringify(this.state.inventory));
localStorage.setItem('aquabook_medicine', JSON.stringify(this.state.medicineInventory));
localStorage.setItem('aquabook_diseases', JSON.stringify(this.state.diseases || []));
localStorage.setItem('aquabook_settings', JSON.stringify(this.state.settings));
this.saveAnalyticsEvents();
} catch (e) {
console.error('Failed to save all data:', e);
this.showToast('Failed to save data. Check storage.', 'error');
throw e;
}
});
}

// BUG #2 FIX: Queue-based save system to prevent race conditions
enqueueSave(saveFn) {
return new Promise((resolve, reject) => {
this.saveQueue.push({ fn: saveFn, resolve, reject });
this.processSaveQueue();
});
}

async processSaveQueue() {
// If already saving, wait for the queue to be processed
if (this.isSaving) return;

while (this.saveQueue.length > 0) {
this.isSaving = true;
const { fn, resolve, reject } = this.saveQueue.shift();
try {
  const result = fn();
  if (result && typeof result.then === 'function') {
    await result;
  }
  resolve();
} catch (e) {
reject(e);
}
this.isSaving = false;
}
}

async saveFarm() { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId && this.state.farm) {
        await this.db.collection('farms').doc(this.state.farm.id).set(this.state.farm, { merge: true });
      } else {
        localStorage.setItem('aquabook_farm', JSON.stringify(this.state.farm));
      }
    } catch (e) {
      console.error('Failed to save farm:', e);
      this.showToast('Failed to save farm.', 'error');
      throw e;
    }
  });
}

async saveTank(tank) {
  if (!tank || !tank.id) return;
  // The .set() method with { merge: true } will create or update the document.
  return this.db.collection('tanks').doc(tank.id).set(tank, { merge: true });
}

async saveTanks() { // This function can now be used to save all tanks in a batch
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        const batch = this.db.batch();
        this.state.tanks.forEach(tank => {
            if (tank.id) {
                const ref = this.db.collection('tanks').doc(tank.id);
                batch.set(ref, tank, { merge: true });
            }
        });
        await batch.commit();
      } else {
        localStorage.setItem('aquabook_tanks', JSON.stringify(this.state.tanks));
      }
    } catch (e) {
      console.error('Failed to save tanks:', e);
      this.showToast('Failed to save tanks.', 'error');
      throw e;
    }
  });
}

async saveFeedEntry(entry) {
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        if (entry && entry.id) {
          if (!entry.farmId) {
             const tank = this.getTankById(entry.tankId);
             entry.farmId = tank ? tank.farmId : this.state.settings.farmId;
          }
          await this.db.collection('feedLogs').doc(String(entry.id)).set(entry, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_entries', JSON.stringify(this.state.feedLogs));
      }
    } catch (e) {
      console.error('Failed to save feed entries:', e);
      this.showToast('Failed to save feed entry.', 'error');
      throw e;
    }
  });
}

async saveHarvest(harvest) { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        if (harvest && harvest.id) {
           if (!harvest.farmId) {
             const tank = this.getTankById(harvest.tankId);
             harvest.farmId = tank ? tank.farmId : this.state.settings.currentFarmId;
           }
           await this.db.collection('harvests').doc(String(harvest.id)).set(harvest, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_harvests', JSON.stringify(this.state.harvests));
      }
    } catch (e) {
      console.error('Failed to save harvest:', e);
      this.showToast('Failed to save harvest.', 'error');
      throw e;
    }
  });
}

async saveWaterQualityData(entry) { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        if (entry && entry.id) {
           if (!entry.farmId) {
             const tank = this.getTankById(entry.tankId);
             entry.farmId = tank ? tank.farmId : this.state.settings.currentFarmId;
           }
           await this.db.collection('waterQuality').doc(String(entry.id)).set(entry, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_water_quality', JSON.stringify(this.state.waterQuality));
      }
    } catch (e) {
      console.error('Failed to save water quality data:', e);
      this.showToast('Failed to save water quality data.', 'error');
      throw e;
    }
  });
}

async saveApplications(entry) { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        if (entry && entry.id) {
           if (!entry.farmId) {
             const tank = this.getTankById(entry.tankId);
             entry.farmId = tank ? tank.farmId : this.state.settings.currentFarmId;
           }
           await this.db.collection('applications').doc(String(entry.id)).set(entry, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_applications', JSON.stringify(this.state.applications));
      }
    } catch (e) {
      console.error('Failed to save applications:', e);
      this.showToast('Failed to save application.', 'error');
      throw e;
    }
  });
}

async saveInventory() { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        const farmId = this.state.settings.currentFarmId;
        if (farmId) {
            await this.db.collection('inventory').doc(farmId).set({
                totalKg: this.state.inventory.totalKg
            }, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_inventory', JSON.stringify(this.state.inventory));
      }
    } catch (e) {
      console.error('Failed to save inventory:', e);
      this.showToast('Failed to save inventory.', 'error');
      throw e;
    }
  });
}

async saveMedicineInventory() { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        const farmId = this.state.settings.currentFarmId;
        if (farmId) {
            await this.db.collection('inventory').doc(farmId).set({
                medicine: this.state.medicineInventory
            }, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_medicine', JSON.stringify(this.state.medicineInventory));
      }
    } catch (e) {
      console.error('Failed to save medicine inventory:', e);
      this.showToast('Failed to save medicine inventory.', 'error');
      throw e;
    }
  });
}

async saveDiseases(entry) {
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        if (entry && entry.id) {
           if (!entry.farmId) {
             const tank = this.getTankById(entry.tankId);
             entry.farmId = tank ? tank.farmId : this.state.settings.currentFarmId;
           }
           await this.db.collection('diseases').doc(String(entry.id)).set(entry, { merge: true });
        }
      } else {
        localStorage.setItem('aquabook_diseases', JSON.stringify(this.state.diseases || []));
      }
    } catch (e) {
      console.error('Failed to save disease log:', e);
      this.showToast('Failed to save disease log.', 'error');
      throw e;
    }
  });
}

async saveSettings() { 
  return this.enqueueSave(async () => {
    try {
      if (this.db && this.userId) {
        await this.db.collection('users').doc(this.userId).set({
          settings: this.state.settings
        }, { merge: true });
      } else {
        localStorage.setItem('aquabook_settings', JSON.stringify(this.state.settings));
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
      this.showToast('Failed to save settings.', 'error');
      throw e;
    }
  });
}

showLoading(show) {
const loader = document.getElementById('loading');
if (show) loader.classList.add('active');
else loader.classList.remove('active');
}

showToast(message, type = 'success', duration = 3000) {
const toast = type === 'error' ? document.getElementById('errorToast') : document.getElementById('successToast');
const msgSpan = toast.querySelector('span');
msgSpan.textContent = message;
toast.classList.add('show');
// Apply warning styling if type is warning
if (type === 'warning') {
  toast.style.background = '#fff3cd';
  toast.style.borderLeft = '4px solid #ffc107';
  toast.style.color = '#856404';
  const icon = toast.querySelector('i');
  if (icon) {
    icon.className = 'fas fa-exclamation-triangle';
    icon.style.color = '#ffc107';
  }
}
setTimeout(() => {
  toast.classList.remove('show');
  // Reset warning styling
  if (type === 'warning') {
    toast.style.background = '';
    toast.style.borderLeft = '';
    toast.style.color = '';
    const icon = toast.querySelector('i');
    if (icon) {
      icon.className = 'fas fa-check-circle';
      icon.style.color = '';
    }
  }
}, duration);
}


// Shows a custom alert modal (non-blocking)
showAlertModal(message, title = 'Alert') {
const modalId = 'alertModal_' + Date.now();
const modal = document.createElement('div');
modal.className = 'modal-overlay active';
modal.id = modalId;
modal.innerHTML = `
<div class="modal-content" style="max-width: 400px;">
<div class="modal-header">
<h3>${this.sanitizeHTML(title)}</h3>
<button class="close-modal" data-modal-id="${modalId}">×</button>
</div>
<div class="modal-body">
<p style="margin: 0; line-height: 1.6; color: var(--gray-700);">${this.sanitizeHTML(message)}</p>
</div>
<div class="modal-footer">
<button class="btn btn-primary" data-modal-id="${modalId}">OK</button>
</div>
</div>
`;
document.body.appendChild(modal);
this.dynamicModals.push(modal);

// Add event listeners with proper cleanup
const closeHandler = (e) => {
const id = e.target.dataset.modalId;
const m = document.getElementById(id);
if (m) {
m.remove();
const idx = this.dynamicModals.indexOf(m);
if (idx > -1) this.dynamicModals.splice(idx, 1);
}
};

modal.querySelectorAll('[data-modal-id]').forEach(btn => {
btn.addEventListener('click', closeHandler);
});

// Auto-focus OK button for accessibility
const primaryBtn = modal.querySelector('.btn-primary');
if (primaryBtn) primaryBtn.focus();
}

// Shows a custom confirmation modal (returns Promise)
showConfirmModal(message, title = 'Confirm', confirmText = 'Yes', cancelText = 'Cancel') {
return new Promise((resolve) => {
const modalId = 'confirmModal_' + Date.now();
const modal = document.createElement('div');
modal.className = 'modal-overlay active';
modal.id = modalId;
modal.innerHTML = `
<div class="modal-content" style="max-width: 400px;">
<div class="modal-header">
<h3>${this.sanitizeHTML(title)}</h3>
<button class="close-modal" data-modal-id="${modalId}">×</button>
</div>
<div class="modal-body">
<p style="margin: 0; line-height: 1.6; color: var(--gray-700);">${this.sanitizeHTML(message)}</p>
</div>
<div class="modal-footer">
<button class="btn btn-secondary" data-action="cancel">${this.sanitizeHTML(cancelText)}</button>
<button class="btn btn-primary" data-action="confirm">${this.sanitizeHTML(confirmText)}</button>
</div>
</div>
`;
document.body.appendChild(modal);

const confirmBtn = modal.querySelector('.btn-primary');
const cancelBtn = modal.querySelector('.btn-secondary');
const closeBtn = modal.querySelector('.close-modal');

const closeModal = () => {
modal.classList.remove('active');
setTimeout(() => {
        modal.remove();
        const idx = this.dynamicModals.indexOf(modal);
        if (idx > -1) this.dynamicModals.splice(idx, 1);
      }, 300);
};
confirmBtn.onclick = () => {
closeModal();
resolve(true);
};
cancelBtn.onclick = () => {
closeModal();
resolve(false);
};
    closeBtn.onclick = () => {
      closeModal();
      resolve(false); // Closing is equivalent to cancelling
    };

confirmBtn.focus();
});
}

// BUG #5 FIX: Sanitize HTML to prevent XSS attacks
sanitizeHTML(str) {
    if (!str || typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Safe attribute escaping for onclick handlers
escapeAttribute(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// BUG FIX #10: Proper timezone handling to prevent DOC calculation errors
getFormattedDate(date = new Date()) {
// Convert to local timezone by adjusting for timezone offset
// This ensures the date string always matches the user's local date
const d = date instanceof Date ? date : new Date(date);
// Use local date methods directly instead of UTC with offset adjustment
const year = d.getFullYear();
const month = String(d.getMonth() + 1).padStart(2, '0');
const day = String(d.getDate()).padStart(2, '0');
return `${year}-${month}-${day}`;
}

// BUG FIX #10: Proper timezone-aware date comparison for DOC calculation
getDaysOld(dateStr = new Date()) {
// If dateStr is a Date object, use getFormattedDate to get normalized string
const normalizedDateStr = typeof dateStr === 'string' ? dateStr : this.getFormattedDate(dateStr);
// Parse the date string as local midnight (not UTC)
const parts = normalizedDateStr.split('-');
if (parts.length === 3) {
const year = parseInt(parts[0], 10);
const month = parseInt(parts[1], 10) - 1;
const day = parseInt(parts[2], 10);
// Create date in local timezone
const targetDate = new Date(year, month, day, 0, 0, 0, 0);
// Get today's date at local midnight
const today = new Date();
today.setHours(0, 0, 0, 0);
// Calculate difference in days
const diffTime = today - targetDate;
const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
return Math.max(0, diffDays); // Never negative
} else {
// Fallback for non-string dates
const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
const today = new Date();
today.setHours(0, 0, 0, 0);
d.setHours(0, 0, 0, 0);
const diffTime = today - d;
const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
return Math.max(0, diffDays);
}
}

getLunarPhase(date = new Date()) {
const knownNewMoon = new Date('2000-01-06T18:14:00Z');
const synodicMonth = 29.53058867;
const msPerDay = 86400000;
const diff = date.getTime() - knownNewMoon.getTime();
const days = diff / msPerDay;
const age = (days % synodicMonth + synodicMonth) % synodicMonth; // Age in days
// Shukla Paksha (Waxing) - Ashtami (8) to Navami (9)
if (age >= 6.5 && age <= 9.5) return { isEvent: true, name: 'Ashtami/Navami (Waxing)' };
// Krishna Paksha (Waning) - Ashtami (23) to Navami (24)
if (age >= 21.0 && age <= 24.0) return { isEvent: true, name: 'Ashtami/Navami (Waning)' };
return { isEvent: false };
}

checkFirstTimeUser() {
const hasFarm = !!this.state.farm;
const lock = document.getElementById('firstTimeLock');
const navTabs = document.querySelector('.nav-tabs');
const mainApp = document.getElementById('app');
const stickyBtn = document.getElementById('stickyLogFeedBtn');

if (!hasFarm) {
lock.classList.remove('hidden');
if (navTabs) navTabs.style.display = 'none';
if (mainApp) mainApp.style.opacity = '0.5';
if (stickyBtn) stickyBtn.style.display = 'none';
const farmSelector = document.getElementById('farmSelector');
if (farmSelector) farmSelector.style.pointerEvents = 'none';
document.querySelectorAll('.nav-btn').forEach(btn => {
btn.classList.add('disabled');
});
} else {
lock.classList.add('hidden');
if (navTabs) navTabs.style.display = 'grid';
if (mainApp) mainApp.style.opacity = '1';
if (stickyBtn) stickyBtn.style.display = 'inline-flex';
const farmSelector = document.getElementById('farmSelector');
if (farmSelector) farmSelector.style.pointerEvents = 'auto';
document.querySelectorAll('.nav-btn').forEach(btn => {
btn.classList.remove('disabled');
});
}
}

setupUI() {
const currentDateEl = document.getElementById('currentDate');
if (currentDateEl) {
currentDateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
// Setup pricing toggle
const pricingOptions = document.querySelectorAll('#pricingToggle .pricing-option');
pricingOptions.forEach(option => {
option.addEventListener('click', () => {
pricingOptions.forEach(opt => opt.classList.remove('active'));
option.classList.add('active');
this.updatePricingDisplay();
});
});
}

renderAll() {
this.updateFarmSelector();
this.renderFarmsList();
this.renderOverallStats();
this.renderLogBook();
this.renderInventorySummary();
this.renderPerformanceScreen();
this.renderFeedRecommendation();
this.checkBackupStatus();
// Render charts if on analytics screen
if (document.getElementById('analyticsScreen')?.classList.contains('active')) {
this.renderCharts();
}

// Check for blind feeding transitions
this.checkBlindFeedingTransitions();
}

updatePerformanceScreenForPlan() {
// All features are free in MVP v1
const fcrCard = document.getElementById('fcrCard');
if (fcrCard) {
fcrCard.classList.remove('locked');
const overlay = fcrCard.querySelector('.preview-overlay');
if (overlay) overlay.remove();
}
const fcrTrendEl = document.getElementById('fcrTrend');
if (fcrTrendEl) {
fcrTrendEl.style.display = 'inline-block';
}
const efficiencyScoreEl = document.getElementById('efficiencyScore');
const efficiencyCard = efficiencyScoreEl ? efficiencyScoreEl.closest('.performance-card') : null;
if (efficiencyCard) {
efficiencyCard.classList.remove('locked');
}
}

renderFeedRecommendation() {
const card = document.getElementById('feedRecommendation');
const text = document.getElementById('recommendationText');
const action = document.getElementById('recommendationAction');
if (!card || !text || !action) { return; }

const farmId = this.state.settings.farmId;
if (!farmId) return;

const tanks = this.state.tanks.filter(t => t.farmId === farmId && t.status !== 'inactive');
if (tanks.length === 0) {
card.style.display = 'none';
return;
}

// Analyze recent tray checks
let wasteCount = 0;
let emptyCount = 0;
let totalChecks = 0;
let severeWasteCount = 0;

tanks.forEach(tank => {
// Skip recommendation for tanks in blind feeding
const doc = this.getDaysOld(tank.stockingDate);
const blindDuration = this.state.settings.blindFeedingDuration || 30;
if (doc <= blindDuration) return;

const entries = this.state.feedLogs.filter(e => e.tankId === tank.id).sort((a, b) => b.id - a.id);
const lastEntry = entries[0];
// Only consider valid tray checks (exclude pending, skipped, blind-fed)
if (lastEntry && lastEntry.trayResult && !['pending', 'skipped', 'blind-fed'].includes(lastEntry.trayResult)) {
totalChecks++;
if (lastEntry.trayResult === 'half') wasteCount++;
if (lastEntry.trayResult === 'too-much') { wasteCount++; severeWasteCount++; }
if (lastEntry.trayResult === 'empty') emptyCount++;
}
});

if (totalChecks === 0) {
card.style.display = 'none';
return;
}

card.style.display = 'block';

if (severeWasteCount > 0) {
text.innerHTML = `<strong>${severeWasteCount} ponds</strong> reported excessive feed waste. Immediate action required.`;
action.innerHTML = `Cut feed by 40-50% in these ponds to prevent water spoilage.`;
action.style.color = 'var(--danger)';
} else if (wasteCount > 0) {
const pct = Math.round((wasteCount / totalChecks) * 100);
text.innerHTML = `<strong>${pct}% of ponds</strong> reported leftover feed.`;
action.innerHTML = `Reduce feed by 10-20% in affected ponds.`;
action.style.color = 'var(--warning-dark)';
} else if (emptyCount === totalChecks) {
text.innerHTML = `All ponds reported <strong>empty trays</strong>. Appetite is strong.`;
action.innerHTML = `Safe to increase feed by 5% (check water quality first).`;
action.style.color = 'var(--success-dark)';
} else {
text.innerHTML = `Feed consumption is <strong>stable</strong> across most ponds.`;
action.innerHTML = `Maintain current feeding schedule.`;
action.style.color = 'var(--primary-dark)';
}
}

renderOverallStats() {
document.querySelectorAll('.overall-stats .stat-card').forEach(el => el.classList.remove('loading'));

const farmId = this.state.settings.farmId;
const farmTanks = farmId ? this.state.tanks.filter(t => t.farmId === farmId) : [];
const farmTankIds = farmTanks.map(t => t.id);
const farmFeedEntries = farmId ? this.state.feedLogs.filter(e => farmTankIds.some(id => id === e.tankId)) : [];
const farmHarvests = farmId ? this.state.harvests.filter(h => farmTankIds.includes(h.tankId)) : [];
const totalHarvested = farmHarvests.reduce((sum, h) => sum + h.weight, 0);

document.getElementById('totalTanks').textContent = farmTanks.length;


const totalFeed = farmFeedEntries.reduce((sum, entry) => {
const amount = typeof entry.amount === 'number' && entry.amount >= 0 ? entry.amount : 0;
return sum + amount;
}, 0);
document.getElementById('totalFeed').innerHTML = `${totalFeed.toFixed(1)} <span class="unit">kg</span>`;

const todayFeed = farmFeedEntries
.filter(e => e.date === this.currentDate)
.reduce((sum, e) => {
const amount = typeof e.amount === 'number' && e.amount >= 0 ? e.amount : 0;
return sum + amount;
}, 0);
document.getElementById('feedToday').innerHTML = `${todayFeed.toFixed(1)} <span class="unit">kg</span>`;

const totalBiomass = farmTanks.filter(t => t.status !== 'inactive').reduce((sum, tank) => {
const biomass = typeof tank.biomass === 'number' && tank.biomass >= 0 ? tank.biomass : 0;
return sum + biomass;
}, 0);
document.getElementById('totalBiomass').innerHTML = `${totalBiomass.toFixed(1)} <span class="unit">kg</span>`;

const totalProduction = totalBiomass + totalHarvested;
// Ensure all values are valid numbers before calculation
const validTotalFeed = !isNaN(totalFeed) && totalFeed >= 0 ? totalFeed : 0;
const validTotalProduction = !isNaN(totalProduction) && totalProduction >= 0 ? totalProduction : 0;
const avgFCR = validTotalProduction > 0 ? (validTotalFeed / validTotalProduction).toFixed(2) : '0.00';
const avgFCREl = document.getElementById('avgFCR');
if (avgFCREl) avgFCREl.textContent = avgFCR;

const validChecks = farmFeedEntries.filter(e => ['empty', 'little', 'half', 'too-much'].includes(e.trayResult));
const wasteChecks = validChecks.filter(e => ['half', 'too-much'].includes(e.trayResult));
const wastePctVal = validChecks.length > 0 ? ((wasteChecks.length / validChecks.length) * 100) : 0;
const wastePct = wastePctVal.toFixed(1);
const feedWasteEl = document.getElementById('feedWaste');
if (feedWasteEl) {
feedWasteEl.innerHTML = `${wastePct}<span class="unit">%</span>`;
if (wastePctVal <= 10) feedWasteEl.style.color = 'var(--success)';
else if (wastePctVal <= 20) feedWasteEl.style.color = 'var(--warning)';
else feedWasteEl.style.color = 'var(--danger)';
}

// Update Check Trays button with count
const pendingChecks = farmFeedEntries.filter(e => e.trayResult === 'pending').length;
const checkBtn = document.querySelector('.quick-actions-grid .btn-info');
if (checkBtn) {
if (pendingChecks > 0) {
checkBtn.innerHTML = `<i class="fas fa-search"></i> Check Trays <span style="background:rgba(0,0,0,0.2); padding:2px 8px; border-radius:10px; font-size:12px; margin-left:4px;">${pendingChecks}</span>`;
} else {
checkBtn.innerHTML = `<i class="fas fa-search"></i> Check Trays`;
}
}
}

renderInventorySummary() {
const feedStock = this.state.inventory.totalKg || 0;
const displayFeedStock = document.getElementById('displayFeedStock');
const displayMedStock = document.getElementById('displayMedStock');
if (displayFeedStock) displayFeedStock.innerHTML = `${feedStock.toFixed(1)} <span class="unit">kg</span>`;
if (displayMedStock) displayMedStock.innerHTML = `${this.state.medicineInventory.length} <span class="unit">Items</span>`;
}

renderFarmsList() {
const container = document.getElementById('farmsList');
const headerContainer = document.getElementById('farmHeaderContainer');
container.innerHTML = '';
if (headerContainer) headerContainer.innerHTML = '';

if (!this.state.farm) {
container.innerHTML = `<div class="empty-state">
<i class="fas fa-water"></i>
<h3>No Farm Found</h3>
<p>Create your first farm to get started</p>
<button class="btn btn-primary" onclick="app.openFarmModal()"><i class="fas fa-plus"></i> Add Farm</button>
</div>`;
return;
}

const farmToRender = this.state.farm;
this.state.settings.farmId = farmToRender.id;
this.saveSettings();
this.updateFarmSelector();

if (!farmToRender) return;

const farm = farmToRender;
const farmTanks = this.state.tanks.filter(tank => tank.farmId === farm.id);

if (headerContainer) {
headerContainer.innerHTML = `
<div class="farm-header" style="border: 2px solid var(--border); border-radius: var(--radius);">
<div class="farm-name">
<i class="fas fa-tractor"></i>
<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.sanitizeHTML(farm.name)}</span>
</div>
<div class="farm-stats">
<div class="farm-stat">
<span class="farm-stat-value">${farmTanks.length}</span>
Tanks
</div>
</div>
<div class="farm-actions" style="display: flex; gap: 8px; flex-shrink: 0;">
<button class="btn btn-sm" style="border: 1px solid var(--border); background: white; color: var(--gray); min-width: 44px; min-height: 44px;" onclick="app.openSettingsModal()">
<i class="fas fa-cog"></i><span class="action-label" style="margin-left: 6px;">Farm Settings</span>
</button>
<button class="btn btn-sm btn-secondary" style="min-width: 44px; min-height: 44px;" onclick="app.editFarm('${farm.id}')">
<i class="fas fa-edit"></i><span class="action-label" style="margin-left: 6px;">Edit Farm</span>
</button>
<button class="btn btn-sm btn-primary" style="min-width: 44px; min-height: 44px;" onclick="app.openTankModal('${farm.id}')">
<i class="fas fa-plus"></i><span class="action-label" style="margin-left: 6px;">Add Tank</span>
</button>
</div>
</div>
`;
}

if (farmTanks.length === 0) {
container.innerHTML = `
<div class="empty-state" style="padding: 30px 20px;">
<i class="fas fa-water" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
<h3 style="font-size: 16px; margin-bottom: 8px;">No Tanks Yet</h3>
<p style="font-size: 13px; margin-bottom: 16px;">Add your first tank to start tracking.</p>
<button class="btn btn-primary" onclick="app.openTankModal('${farm.id}')">
<i class="fas fa-plus"></i> Add New Tank
</button>
</div>
`;
} else {
// Add "Add Tank" card to the grid for easier access
const addTankCard = `
<div class="tank-summary-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px dashed var(--border); cursor: pointer; min-height: 180px; background: var(--light);" onclick="app.openTankModal('${farm.id}')">
<div style="width: 50px; height: 50px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
<i class="fas fa-plus" style="color: var(--primary); font-size: 20px;"></i>
</div>
<div style="font-weight: 600; color: var(--gray);">Add New Tank</div>
</div>
`;
container.innerHTML = `
<div class="tanks-grid" style="padding: 0;">
${farmTanks.map(tank => this.getTankCardHTML(tank)).join('')}
${addTankCard}
</div>
`;
}
}

getTankCardHTML(tank) {
const doc = this.getDaysOld(tank.stockingDate);
const isInactive = tank.status === 'inactive';
const status = doc > 75 ? 'danger' : doc > 50 ? 'warning' : 'good';
    const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
    
    // LIFECYCLE STATE BADGE
    const lifecycleState = tank.lifecycleState || this.calculateLifecycleState(tank);
    const lifecycleInfo = this.getLifecycleStateInfo(lifecycleState);
    const lifecycleBadge = `<span class="lifecycle-badge ${lifecycleState}">${lifecycleInfo.icon} ${lifecycleInfo.label}</span>`;
    
    // Phase labels for first 30 DOC
    let phaseLabel = '';
    if (doc <= 3) phaseLabel = 'Phase 1 · Stocking';
    else if (doc <= 15) phaseLabel = 'Phase 2 · Stabilisation';
    else if (doc <= 30) phaseLabel = 'Phase 3 · Biomass';

    // Tray mode labels (deprecated in favor of lifecycle state)
    let trayPhaseLabel = '';
    if (!isInactive) {
        if (doc <= blindDuration && !tank.hasTransitionedFromBlind) {
            trayPhaseLabel = 'Blind Feed Mode';
        } else if (doc > blindDuration && !tank.hasTransitionedFromBlind) {
            trayPhaseLabel = 'Tray Training';
        } else if (tank.hasTransitionedFromBlind) {
            trayPhaseLabel = 'Tray Active';
        }
    }

const allTankEntries = this.state.feedLogs.filter(e => e.tankId === tank.id);

const totalFeed = allTankEntries.reduce((sum, e) => {
const amount = typeof e.amount === 'number' && e.amount >= 0 ? e.amount : 0;
return sum + amount;
}, 0);
const todayEntries = allTankEntries.filter(e => e.date === this.currentDate);
const todayFeed = todayEntries.reduce((sum, e) => {
const amount = typeof e.amount === 'number' && e.amount >= 0 ? e.amount : 0;
return sum + amount;
}, 0);
const currentBiomass = typeof tank.biomass === 'number' && tank.biomass >= 0 ? tank.biomass : 0;
const tankHarvests = this.state.harvests.filter(h => h.tankId === tank.id);
const totalHarvested = tankHarvests.reduce((sum, h) => {
const weight = typeof h.weight === 'number' && h.weight >= 0 ? h.weight : 0;
return sum + weight;
}, 0);
const totalProduction = currentBiomass + totalHarvested;
const validTotalFeed = !isNaN(totalFeed) ? totalFeed : 0;
const validTotalProduction = !isNaN(totalProduction) ? totalProduction : 0;
const estimatedFCR = validTotalProduction > 0 ? (validTotalFeed / validTotalProduction).toFixed(2) : '0.00';

let statusDot = '';
if (todayEntries.length > 0) {
const last = todayEntries[todayEntries.length - 1];
let statusClass = 'status-good';
if (last.trayResult === 'too-much') statusClass = 'status-bad';
else if (last.trayResult === 'half' || last.trayResult === 'little') statusClass = 'status-warn';
statusDot = `<div class="tank-feed-status ${statusClass}" title="Last Feed: ${last.trayResult}"></div>`;
}

    return `
    <div class="tank-summary-card ${status} ${isInactive ? 'inactive' : ''} state-${lifecycleState}" onclick="app.openTankDetail('${this.escapeAttribute(tank.id)}')">
${statusDot}
<div class="tank-summary-header">
<div class="tank-summary-name">
${this.sanitizeHTML(tank.name)}
    ${phaseLabel ? `<span style="background:#eef2ff; color:#3730a3; font-size:10px; padding:2px 6px; border-radius:999px; font-weight:600; margin-left:6px;">${phaseLabel}</span>` : ''}
</div>
<div style="display: flex; align-items: center; gap: 8px;">
    <div class="tank-summary-doc">DOC: ${doc}</div>
<div class="tank-action-menu">
<button class="tank-menu-btn" onclick="app.toggleTankMenu('${this.escapeAttribute(tank.id)}'); event.stopPropagation();">
<i class="fas fa-ellipsis-v"></i>
</button>
<div class="tank-menu-dropdown" id="tank-menu-${tank.id}">
<button class="tank-menu-item" onclick="app.editTank('${this.escapeAttribute(tank.id)}'); event.stopPropagation();">
<i class="fas fa-edit"></i> Edit Tank
</button>
<button class="tank-menu-item delete" onclick="app.deleteTank('${this.escapeAttribute(tank.id)}'); event.stopPropagation();">
<i class="fas fa-trash"></i> Delete Tank
</button>
</div>
</div>
</div>
</div>
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 12px; color: var(--gray);">
<div>Size: <span style="color: var(--dark); font-weight: 600;">${tank.size || '-'} ac</span></div>
<div>Est. Stock: <span style="color: var(--dark); font-weight: 600;">${(tank.currentSeed || tank.initialSeed || 0).toLocaleString()}</span></div>
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

    <div style="margin-top: 12px; font-size: 12px; color: var(--gray); border-top: 1px solid #eee; padding-top: 8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
    <span>Biomass: <span style="color: var(--dark); font-weight: 600;">${(tank.biomass || 0).toFixed(0)} kg</span></span>
    <span>• FCR: <span style="color: var(--primary); font-weight: 600;">${estimatedFCR}</span></span>
    <span style="margin-left:auto; font-size:10px; color:var(--gray-600);">${lifecycleInfo.description}</span>
    </div>
</div>
`;
}

renderLogBook() {
// 1. Setup Container and Tabs
const logScreen = document.getElementById('logScreen');
const farmId = this.state.settings.farmId;
const farmTanks = farmId ? this.state.tanks.filter(t => t.farmId === farmId) : [];
// Handle Empty State
const emptyState = document.getElementById('emptyLog');
if (farmTanks.length === 0) {
// Hide table container and toolbar
document.querySelector('.log-toolbar').style.display = 'none';
document.querySelector('.feed-log-table-container').style.display = 'none';
emptyState.style.display = 'block';
emptyState.querySelector('h3').textContent = 'No Tanks Found';
emptyState.querySelector('p').textContent = 'Add a tank to start logging feed.';
return;
}
emptyState.style.display = 'none';
document.querySelector('.log-toolbar').style.display = 'flex'; // We'll repurpose or hide this
document.querySelector('.feed-log-table-container').style.display = 'block';

// 2. Render Tank Tabs (New Logic)
// We need to inject the tank tabs container if it doesn't exist
let tabsContainer = document.getElementById('logTankTabs');
if (!tabsContainer) {
tabsContainer = document.createElement('div');
tabsContainer.id = 'logTankTabs';
tabsContainer.className = 'tank-tabs-wrapper';
// Insert after screen header
const header = logScreen.querySelector('.screen-header');
header.parentNode.insertBefore(tabsContainer, header.nextSibling);
}

// Set active tank if null or invalid
if (!this.activeLogTankId || !farmTanks.find(t => t.id === this.activeLogTankId)) {
this.activeLogTankId = farmTanks[0].id;
}

// Render Tabs
tabsContainer.innerHTML = farmTanks.map(tank => `
<button class="tank-tab ${tank.id === this.activeLogTankId ? 'active' : ''}"
onclick="app.switchLogTank('${this.escapeAttribute(tank.id)}')">
<i class="fas fa-water" style="font-size: 18px;"></i>
<span>${this.sanitizeHTML(tank.name)}</span>
</button>
`).join('');

// 3. Render Active Tank Content
this.renderActiveTankLog(this.activeLogTankId);
}

switchLogTank(tankId) {
this.activeLogTankId = tankId;
this.renderLogBook();
}

renderActiveTankLog(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

// Update Toolbar (Date Filters) - Keep existing structure but update context
// We hide the "Today/Yesterday" global toggle if we want per-tank history,
// but the prompt says "under that, show last 7 day...".
// So we keep the toolbar but maybe style it smaller or move it.
// For now, let's keep the toolbar as is, it controls the list below.
// 4. Render Feed Plan Card (New)
// We need a container for this. Let's put it before the toolbar.
let planContainer = document.getElementById('logFeedPlanContainer');
if (!planContainer) {
planContainer = document.createElement('div');
planContainer.id = 'logFeedPlanContainer';
const toolbar = document.querySelector('.log-toolbar');
toolbar.parentNode.insertBefore(planContainer, toolbar);
}

// Calculate Plan
const doc = this.getDaysOld(tank.stockingDate);
const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
let planAmount = 0;
let planSource = '';
let planSub = '';
let feedsToday = [];
let planSourceTooltip = '';

// Check Blind Schedule (and ensure not transitioned)
if (tank.blindSchedule && doc <= blindDuration && !tank.hasTransitionedFromBlind) {
// Show Day 1 schedule for Day 0 (stocking day)
// Note: scheduleDoc is used to look up the schedule, but actual DOC should be displayed
const scheduleDoc = doc === 0 ? 1 : doc;
const schedule = tank.blindSchedule.find(s => s.doc === scheduleDoc);
if (schedule) {
planAmount = schedule.amount;
// Fallback for feeds array if missing (legacy data support)
const feedsCount = this.state.settings.feedsPerDay || 4;
feedsToday = schedule.feeds || Array(feedsCount).fill(parseFloat((schedule.amount / feedsCount).toFixed(2)));
if (schedule.status === 'manual') {
planSource = `Manual Override`;
planSourceTooltip = `You have manually set the feed amount for this day.`;
} else {
planSource = `Blind feeding based on pond setup`;
const stockingDensity = (tank.initialSeed && tank.size) ? Math.round(tank.initialSeed / tank.size).toLocaleString() : 'N/A';
planSourceTooltip = `Based on:\n- Pond Size: ${tank.size || 'N/A'} acres\n- Stocking Density: ${stockingDensity} PL/acre`;
}

planSub = `${feedsToday.length} feeds: ${feedsToday.map(f => f + 'kg').join(', ')}`;
}
}
// If no blind schedule or past day 30, check last feed/tray
if (planAmount === 0) {
const entries = this.state.feedLogs.filter(e => e.tankId === tankId).sort((a, b) => b.id - a.id);
const lastEntry = entries[0];
const feedsPerDay = this.state.settings.feedsPerDay || 4;

if (lastEntry) {

const lastAmount = (lastEntry?.amount) ?? 2.0;
const lastTray = (lastEntry?.trayResult) ?? 'pending';
const res = this.calculateStrictFeed(lastAmount, lastTray, doc);
planAmount = res.amount * feedsPerDay;
feedsToday = Array(feedsPerDay).fill(res.amount);
planSource = `Suggested Feed`;
planSub = `Based on last tray: ${lastTray}`;
} else {
planAmount = 2.0; // Default start
feedsToday = Array(feedsPerDay).fill(0.5);
planSource = 'Initial Feed';
planSub = 'Start with base amount';
}
}


// Check if tank is in Tray Active mode
const isTrayActive = this.isTrayActiveMode(tank);

// TRAY ACTIVE MODE: Show Last Feed Round Summary
let lastRoundSummaryHTML = '';
if (isTrayActive) {
  lastRoundSummaryHTML = this.renderLastFeedRoundSummary(tankId, this.currentDate);
}

// Check if we can show next feed suggestion
const canShowSuggestion = this.canShowNextFeedSuggestion(tankId, this.currentDate);
const allRoundsCompleted = this.areAllRoundsCompleted(tankId, this.currentDate);

// Warning banner for tray status not updated (Tray Active mode only)
let trayStatusWarningHTML = '';
if (isTrayActive && !canShowSuggestion && !allRoundsCompleted) {
  const lastRound = this.getLastCompletedRound(tankId, this.currentDate);
  if (lastRound) {
    trayStatusWarningHTML = `
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 8px; padding: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #f59e0b;"></i>
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 700; color: #f59e0b; margin-bottom: 4px;">Update Tray Status to Continue</div>
          <div style="font-size: 13px; color: var(--gray);">You must update the tray status for Round ${lastRound.roundNumber} before the next feed suggestion can be shown.</div>
        </div>
        <button class="btn btn-warning" onclick="app.openTrayCheckPopup('${tankId}', ${lastRound.entry.id})" style="padding: 10px 16px; font-size: 13px; white-space: nowrap;">
          <i class="fas fa-edit"></i> Update Tray Status
        </button>
      </div>
    `;
  }
}

// Warning banner for all rounds completed
let allRoundsWarningHTML = '';
if (allRoundsCompleted) {
  const totalRounds = this.state.settings.feedsPerDay || 4;
  allRoundsWarningHTML = `
    <div style="background: #ffebee; border-left: 4px solid var(--danger); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <i class="fas fa-times-circle" style="font-size: 24px; color: var(--danger);"></i>
        <div style="font-size: 16px; font-weight: 700; color: var(--danger);">All Feeding Rounds Completed for Today</div>
      </div>
      <div style="font-size: 13px; color: var(--gray); margin-bottom: 12px;">
        You have completed all ${totalRounds} planned feeding rounds for today. Feeding more may cause overfeeding and feed waste.
      </div>
      <div style="background: white; border: 1px solid #ffcdd2; border-radius: 6px; padding: 10px; font-size: 12px; color: var(--gray);">
        <strong style="color: var(--danger);">⚠️ Warning:</strong> Any additional feed logged today will be marked as <strong>"Extra Feed"</strong> and may negatively impact your FCR.
      </div>
    </div>
  `;
}

// HERO CARD: "One big number" & "Confirm X kg"
const todayEntries = this.state.feedLogs.filter(e => e.tankId === tankId && e.date === this.currentDate).sort((a, b) => a.id - b.id);
const nextFeedIndex = todayEntries.length;
const totalFeedsForDay = feedsToday.length;
        let heroHTML = '';
        // Only show hero card if we can show suggestion (or in blind mode)
        if (nextFeedIndex < totalFeedsForDay && (canShowSuggestion || !isTrayActive)) {
        const amount = feedsToday[nextFeedIndex];
        const isBlind = doc <= blindDuration && !tank.hasTransitionedFromBlind;
let explanation = '';
let trayFeedGrams = 0;
if (isBlind) {
explanation = `Blind feeding (Day ${doc} based on stocking)`;
} else {
const entries = this.state.feedLogs.filter(e => e.tankId === tankId).sort((a, b) => b.id - a.id);
const lastEntry = entries[0];
let lastResult = lastEntry ? (lastEntry.trayResult || 'None') : 'None';
if (lastResult === 'too-much') lastResult = 'Too Much';
else if (lastResult === 'blind-fed') lastResult = 'Blind Fed (Transition)';
else if (lastResult === 'pending') lastResult = 'Pending Check';
explanation = `Based on last tray check: <span style="text-transform: capitalize; font-weight: 600;">${lastResult}</span>`;

const traySettings = this.state.settings.trayCheckPercentages || { range1: 0.3, range2: 0.6, range3: 1.0 };
let pct = traySettings.range1;
if (doc >= 90) {
    pct = traySettings.range3;
} else if (doc >= 60) {
    pct = traySettings.range2;
}
const trayFeedKg = amount * (pct / 100);
trayFeedGrams = Math.round(trayFeedKg * 1000);

}

heroHTML = `
<div style="background: white; border: 2px solid ${isBlind ? 'var(--primary)' : 'var(--success)'}; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
<div style="background: ${isBlind ? 'var(--primary)' : 'var(--success)'}; color: white; padding: 6px 12px; border-radius: 20px; font-weight: 700; font-size: 14px;">
DOC ${doc}
</div>
<div style="font-size: 12px; font-weight: 600; color: var(--gray); text-transform: uppercase;">
${isBlind ? 'Blind Phase' : 'Tray Phase'}
</div>
</div>
<div style="text-align: center; margin-bottom: 20px;">
<div style="font-size: 13px; color: var(--gray); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Suggested Feed</div>
<div style="font-size: 56px; font-weight: 800; color: var(--dark); line-height: 1;">
${amount} <span style="font-size: 20px; color: var(--gray); font-weight: 600;">kg</span>
</div>
${!isBlind && trayFeedGrams > 0 ? `
<div style="margin-top: 8px; font-size: 16px; font-weight: 600; color: var(--success-dark);">
    <i class="fas fa-balance-scale"></i>
    ${trayFeedGrams} grams / check tray
</div>
` : ''}
<div style="font-size: 14px; color: var(--primary); margin-top: 8px; font-weight: 500;">
${explanation}
</div>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 8px;">
<button class="btn btn-secondary" onclick="app.skipFeed('${tankId}')" style="justify-content: center; border: 2px solid var(--border); color: var(--gray); padding: 12px 0; width: 100%;">
Skip
</button>
<button class="btn btn-secondary" onclick="app.openLogFeedModal('${tankId}', ${amount}, ${nextFeedIndex})" style="justify-content: center; border: 2px solid var(--border); padding: 12px 0; width: 100%;">
Edit
</button>
<button class="btn btn-primary" onclick="app.quickLogFeed('${tankId}', ${amount})" style="justify-content: center; font-size: 16px; background: ${isBlind ? 'var(--primary)' : 'var(--success)'}; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2); width: 100%;">
Confirm ${amount} kg
</button>
</div>
</div>
`;
} else {
heroHTML = `
<div style="background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
<i class="fas fa-check-circle" style="font-size: 48px; color: var(--success); margin-bottom: 12px;"></i>
<h3 style="color: var(--success-dark); margin-bottom: 4px;">All Feeds Completed</h3>
<p style="color: var(--success-dark); opacity: 0.8; font-size: 14px;">Great job! See you tomorrow.</p>
</div>
`;
}

        let scheduleHTML = '';
        // BLIND MODE: Show new blind feed log book UI matching user's mockup
        if (doc <= blindDuration && !tank.hasTransitionedFromBlind) {
// New Blind Feed Log Book UI
const perFeedAmount = feedsToday.length > 0 ? (planAmount / feedsToday.length).toFixed(2) : 0;
const allFeedsCompleted = todayEntries.length >= feedsToday.length;

// Get time labels for feeds
const count = feedsToday.length;
let scheduleTimes = this.state.settings[`feedSchedule${count}`];
if (!scheduleTimes || scheduleTimes.length !== count) {
if (this.state.settings.feedTimes && this.state.settings.feedTimes.length === count) scheduleTimes = this.state.settings.feedTimes;
else scheduleTimes = Array.from({length: count}, (_, i) => Math.floor(6 + (i * (16/Math.max(1, count)))));
}

// Completion message if all feeds done
let completionHTML = '';
if (allFeedsCompleted) {
completionHTML = `
<div class="blind-feed-completion-message">
<h3>🎉 All Feeds Completed Today!</h3>
<p>Great job! See you tomorrow for the next feeding cycle.</p>
</div>
`;
}

// Build feed items HTML
let feedItemsHTML = '';
feedsToday.forEach((amount, index) => {
const entry = todayEntries[index];
const isDone = !!entry;
const hour = scheduleTimes[index] !== undefined ? scheduleTimes[index] : (6 + (index * 4));
const ampm = hour >= 12 ? 'PM' : 'AM';
const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
const timeLabel = `${displayHour}:00 ${ampm}`;

let buttonHTML = '';
if (isDone) {
if (entry.trayResult === 'skipped') {
buttonHTML = `<button class="blind-log-feed-btn skipped" disabled>⏭ Skipped</button>`;
} else {
buttonHTML = `<button class="blind-log-feed-btn done" disabled>✓ Done (${entry.amount} kg)</button>`;
}
} else {
buttonHTML = `<button class="blind-log-feed-btn" onclick="app.quickLogBlindFeed('${tankId}', ${amount}, ${index})">Log</button>`;
}

feedItemsHTML += `
<div class="blind-feed-item">
<div class="blind-feed-item-row">
<div class="blind-feed-details">
<div class="blind-feed-name">Feed ${index + 1} · ${timeLabel}</div>
</div>
<div class="blind-feed-action">
<div class="blind-feed-amount">${amount.toFixed(2)} <span class="unit">kg</span></div>
${buttonHTML}
</div>
</div>
</div>
`;
});

scheduleHTML = `
${completionHTML}
<div class="blind-feed-plan-card">
<div class="blind-feed-plan-header">
<div class="blind-feed-plan-title">
<h2>Day 0-${blindDuration} Blind Feed Plan</h2>
<div class="blind-feed-plan-subtitle">
Feed based on PL count estimation
<span class="info-icon" title="Based on stocking density: ${tank.initialSeed ? Math.round(tank.initialSeed / (tank.size || 1)).toLocaleString() : 'N/A'} PL/acre">i</span>
</div>
</div>
<div class="blind-feed-total-target">
<div class="target-value">${planAmount.toFixed(1)} <small style="font-size: 16px;">kg</small></div>
<div class="target-label">Total Target</div>
</div>
</div>

<button class="blind-feed-plan-btn" onclick="app.openFeedSchedule('${tankId}')">
📋 Feed Plan
</button>

<div class="blind-feed-schedule" id="blindFeedSchedule_${tankId}">
${feedItemsHTML}
</div>
</div>
`;
} else {
// TRAY PHASE: Show Last Feed Context instead of Schedule Plan
const allEntries = this.state.feedLogs.filter(e => e.tankId === tankId).sort((a, b) => b.id - a.id);
const lastEntry = allEntries[0];
if (lastEntry) {
let trayDetails = '';
            if (lastEntry.trayResults && lastEntry.trayResults.length > 0) {
trayDetails = `<div style="display:flex; gap:12px; margin-top:8px;">`;
lastEntry.trayResults.forEach((status, i) => {
let icon = 'question';
let color = 'var(--gray)';
let label = 'Pending';
if (status === 'empty') { icon = 'check'; color = 'var(--success)'; label = 'Empty'; }
else if (status === 'little') { icon = 'utensils'; color = 'var(--info)'; label = 'Little'; }
else if (status === 'half') { icon = 'adjust'; color = 'var(--warning)'; label = 'Half'; }
else if (status === 'too-much') { icon = 'exclamation-triangle'; color = 'var(--danger)'; label = 'Full'; }
trayDetails += `
<div style="text-align:center;">
<div style="width:32px; height:32px; border-radius:50%; background:${color}20; color:${color}; display:flex; align-items:center; justify-content:center; margin:0 auto 4px auto;">
<i class="fas fa-${icon}" style="font-size:14px;"></i>
</div>
<div style="font-size:10px; color:var(--gray); font-weight:600;">Tray ${i+1}</div>
<div style="font-size:10px; color:${color};">${label}</div>
</div>
`;
});
trayDetails += `</div>`;
            } else {
                // Simple text result line; if still pending, also show a CTA to update trays now.
                const isPending = !lastEntry.trayResult || lastEntry.trayResult === 'pending';
                const baseLabel = lastEntry.trayResult || 'Pending';
                const updateCTA = isPending
                    ? `<button class="btn btn-sm btn-secondary" style="margin-left:8px; padding:4px 10px; font-size:11px;"
                               onclick="event.stopPropagation(); app.openTrayCheckPopup('${tankId}', ${lastEntry.id});">
                           Update
                       </button>`
                    : '';
                trayDetails = `<div style="font-size:13px; color:var(--gray); margin-top:4px; display:flex; align-items:center;">
                                   Result: <strong style="text-transform:capitalize; margin-left:4px;">${baseLabel}</strong>
                                   ${updateCTA}
                               </div>`;
}

let suppHTML = '';
if (lastEntry.supplements && lastEntry.supplements.length > 0) {
suppHTML = `
<div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;">
<div style="font-size:11px; color:var(--gray); margin-bottom:6px; font-weight:600; text-transform:uppercase;">Supplements Used</div>
<div style="display:flex; flex-wrap:wrap; gap:6px;">
${lastEntry.supplements.map(s => `<span style="background:var(--info-light); color:var(--info-dark); padding:4px 10px; border-radius:12px; font-size:11px; font-weight:500;">${s}</span>`).join('')}
</div>
</div>
`;
}

scheduleHTML = `
<div class="daily-schedule-card" style="padding: 16px;">
<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #eee;">
<div>
<h4 style="margin:0; color:var(--dark); font-size:15px;">Previous Feed</h4>
<div style="font-size:12px; color:var(--gray); margin-top:2px;">${new Date(lastEntry.date).toLocaleDateString()} &bull; ${lastEntry.time}</div>
</div>
<div style="text-align:right;">
<div style="font-size:20px; font-weight:800; color:var(--dark);">${lastEntry.amount} <span style="font-size:12px; font-weight:600; color:var(--gray);">kg</span></div>
</div>
</div>
<div style="background:var(--light); border-radius:12px; padding:12px;">
<div style="font-size:12px; font-weight:600; color:var(--dark); margin-bottom:4px;">Tray Check Results</div>
${trayDetails}
</div>

${suppHTML}
</div>
`;
}
}

        const isBlindMode = doc <= blindDuration && !tank.hasTransitionedFromBlind;
if (isBlindMode) {
    // Blind feeding: only show the plan card.
    planContainer.innerHTML = scheduleHTML;
} else {
    // TRAY MODE: Use simplified design matching user mockup
    planContainer.innerHTML = this.renderTrayFeedLogBookSimple(tankId, tank, doc);
}

const container = document.getElementById('logTimelineContainer');
if (!container) return;

// Filter entries based on the viewMode selected in the log-toolbar
const today = new Date();
let startDate, endDate;

if (this.viewMode === 'today') {
startDate = this.getFormattedDate(today);
endDate = startDate;
} else if (this.viewMode === 'yesterday') {
const d = new Date(today); d.setDate(d.getDate() - 1);
startDate = this.getFormattedDate(d);
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
startDate = tank.stockingDate;
endDate = this.getFormattedDate(today);
}

const isDateInRange = (d) => d >= startDate && d <= endDate;
const tankEntries = this.state.feedLogs.filter(e => e.tankId === tankId && isDateInRange(e.date));

// Check if blind mode for different rendering
if (isBlindMode) {
// BLIND MODE: Render simpler log entries matching user's mockup
container.innerHTML = this.renderBlindFeedLogEntries(tankId, tankEntries, blindDuration);
return;
}

// TRAY MODE: Existing register-style rendering
const contextHTML = `
<div class="context" style="border-bottom: 1px solid var(--border);">
<div class="chip">DOC ${doc}</div>
<div class="chip">Tray Feeding</div>
</div>
`;

if (tankEntries.length === 0) {
container.innerHTML = contextHTML + `
<div class="empty-state" style="padding: 40px 20px; margin: 0 12px 12px; background: #fff; border: 1px solid var(--border); border-radius: 12px;">
<i class="fas fa-clipboard-list" style="font-size: 32px; opacity: 0.3; margin-bottom: 12px;"></i>
<p style="color: var(--gray);">No feed logs for this period.</p>
</div>
`;
return;
}

const entriesByDate = {};
tankEntries.forEach(e => { if (!entriesByDate[e.date]) entriesByDate[e.date] = []; entriesByDate[e.date].push(e); });

const sortedDates = Object.keys(entriesByDate).sort().reverse();

let registerHTML = `
<div class="register">
<div style="padding:10px 12px;font-size:11px;background:#f8fafc;border-bottom:1px solid var(--border)">
Tray status:
<b style="color:var(--success)">Completed</b> ·
<b style="color:var(--warn, #f59e0b)">Little Left</b> ·
<b style="color:var(--danger)">Half Left</b> ·
<b style="color:#64748b">Not Checked</b>
</div>
`;

const feedsCount = this.state.settings.feedsPerDay || 4;
const feedLabels = ['Morning', 'Late Morning', 'Afternoon', 'Evening', 'Night 1', 'Night 2'].slice(0, feedsCount);

sortedDates.forEach(date => {
const dateObj = new Date(date);
const isToday = date === this.currentDate;
const isYesterday = date === this.getFormattedDate(new Date(new Date().setDate(new Date().getDate() - 1)));
let dateDisplay = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
if (isToday) dateDisplay = `TODAY · ${dateDisplay}`;
if (isYesterday) dateDisplay = `YESTERDAY · ${dateDisplay}`;

registerHTML += `<div style="padding:10px 12px;background:#f1f5f9;font-size:12px;font-weight:600">${dateDisplay}</div>`;
registerHTML += `<div class="row head" style="grid-template-columns: repeat(${feedsCount}, 1fr);">`;
feedLabels.forEach(label => { registerHTML += `<div class="cell">${label}</div>`; });
registerHTML += `</div>`;

const entries = entriesByDate[date].sort((a, b) => a.id - b.id);
const entryMap = new Map();
entries.forEach((entry, index) => { entryMap.set(index, entry); });

registerHTML += `<div class="row" style="grid-template-columns: repeat(${feedsCount}, 1fr);">`;

for (let i = 0; i < feedsCount; i++) {
const entry = entryMap.get(i);
if (entry) {
let statusColor = '#64748b', statusText = '– Not Checked', highlightClass = '';

if (entry.trayResult === 'empty') { statusColor = 'var(--success)'; statusText = '✔ Completed'; }
else if (entry.trayResult === 'little') { statusColor = 'var(--warn, #f59e0b)'; statusText = '● Little Left'; }
else if (entry.trayResult === 'half') { statusColor = 'var(--danger)'; statusText = '◐ Half Left'; highlightClass = 'highlight'; }
else if (entry.trayResult === 'too-much') { statusColor = 'var(--danger)'; statusText = '✖ Too Much'; highlightClass = 'highlight'; }
else if (entry.trayResult === 'pending') { statusText = 'Pending Check'; }
else if (entry.trayResult === 'skipped') { statusText = 'Skipped'; }
else if (entry.trayResult === 'blind-fed') { statusText = 'Blind Fed'; }

const mixHTML = (entry.supplements && entry.supplements.length > 0) ? `<div class="mix">${entry.supplements.map(s => `<span>${this.sanitizeHTML(s)}</span>`).join('')}</div>` : '';
const reasonHTML = entry.reason ? `<div class="reason">${this.sanitizeHTML(entry.reason)}</div>` : '';

// Extra feed warning badge
const extraFeedBadge = entry.is_extra_feed ? `<div style="background: #ffebee; color: var(--danger); font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-top: 4px; text-transform: uppercase;">Extra Feed</div>` : '';

// Round number badge for Tray Active mode
const roundBadge = entry.feed_round_number && entry.feeding_mode === 'TRAY' ? `<div style="background: var(--info-light); color: var(--primary); font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-top: 2px;">R${entry.feed_round_number}</div>` : '';

registerHTML += `
<div class="cell ${highlightClass} ${entry.is_extra_feed ? 'extra-feed' : ''}" onclick="app.editFeedEntry(${entry.id})" style="cursor: pointer; ${entry.is_extra_feed ? 'border: 2px solid var(--danger); background: #fff5f5;' : ''}">
<span class="qty">${entry.amount} kg</span>
${roundBadge}
${reasonHTML}
${mixHTML}
<span style="color:${statusColor};font-size:11px;font-weight:600;">${statusText}</span>
${extraFeedBadge}
</div>
`;
} else {
registerHTML += `<div class="cell done">-</div>`;
}
}
registerHTML += `</div>`;
});

registerHTML += `</div>`;
container.innerHTML = contextHTML + registerHTML;
}

renderBlindFeedLogEntries(tankId, tankEntries, blindDuration) {
// Render blind feed log entries matching user's mockup
const tank = this.getTankById(tankId);
const doc = this.getDaysOld(tank.stockingDate);
const feedsCount = this.state.settings.feedsPerDay || 4;

if (tankEntries.length === 0) {
return `
<div class="blind-feed-log-entries">
<div class="empty-state" style="padding: 40px 20px; background: #fff; border: 1px solid var(--border); border-radius: 12px; text-align: center;">
<i class="fas fa-clipboard-list" style="font-size: 32px; opacity: 0.3; margin-bottom: 12px;"></i>
<p style="color: var(--gray);">No feed logs for this period.</p>
</div>
</div>
`;
}

// Group entries by date
const entriesByDate = {};
tankEntries.forEach(e => { 
if (!entriesByDate[e.date]) entriesByDate[e.date] = []; 
entriesByDate[e.date].push(e); 
});

const sortedDates = Object.keys(entriesByDate).sort().reverse();

let logEntriesHTML = `<div class="blind-feed-log-entries">`;

sortedDates.forEach(date => {
const dateObj = new Date(date);
const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
const day = dateObj.getDate();

const entries = entriesByDate[date].sort((a, b) => a.id - b.id);

// Build feed slots HTML
let slotsHTML = '';
for (let i = 0; i < feedsCount; i++) {
const entry = entries[i];
if (entry) {
let statusClass = 'status-done';
let statusText = 'fed';
if (entry.trayResult === 'skipped') {
statusClass = 'status-skipped';
statusText = 'skipped';
} else if (entry.trayResult === 'blind-fed') {
statusClass = 'status-done';
statusText = 'fed';
}
slotsHTML += `
<div class="blind-feed-slot ${statusClass}" onclick="app.editFeedEntry(${entry.id})" style="cursor: pointer;">
<div class="slot-amount">${entry.amount} kg</div>
<div class="slot-status">${statusText}</div>
</div>
`;
} else {
slotsHTML += `
<div class="blind-feed-slot status-pending">
<div class="slot-amount">-</div>
<div class="slot-status">pending</div>
</div>
`;
}
}

logEntriesHTML += `
<div class="blind-feed-log-entry">
<div class="blind-feed-date-badge">
<div class="blind-feed-date-day">${month}</div>
<div class="blind-feed-date-number">${day}</div>
</div>
<div class="blind-feed-slots">
${slotsHTML}
</div>
</div>
`;
});

logEntriesHTML += `</div>`;
return logEntriesHTML;
}

/*
Legacy renderLogBook logic removed/replaced above.
The new logic handles the "Tank Tabs" requirement.
*/

/*
if (this.viewMode === 'today' || this.viewMode === 'yesterday') {
const dateStr = startDate;
const colTotals = [0, 0, 0, 0, 0, 0];

tanksToShow.forEach(tank => {
const farm = this.getFarmById(tank.farmId);
const entries = this.state.feedLogs
.filter(e => e.tankId === tank.id && e.date === dateStr)
.sort((a, b) => a.id - b.id);

const total = entries.reduce((sum, e) => sum + e.amount, 0);

const getCell = (index) => {
if (entries[index]) {
const e = entries[index];
colTotals[index] += e.amount;

let statusClass = 'status-completed';
let statusText = 'COMPLETED';
if (e.trayResult === 'pending') {
statusClass = 'status-pending';
statusText = 'PENDING';
}

return `
<div style="font-weight: 600; font-size: 14px;">${e.amount} kg</div>
<div class="status-badge ${statusClass}">${statusText}</div>
`;
}
return `<span style="color: var(--gray-500);">-</span>`;
};

const row = document.createElement('tr');
row.innerHTML = `
<td>
<div style="display: flex; justify-content: space-between; align-items: flex-start;">
<div>
<div style="font-weight: 600; font-size: 14px; color: var(--gray-900);">${this.sanitizeHTML(tank.name)}</div>
</div>
</div>
</td>
${Array.from({length: feedsCount}, (_, i) => `<td data-label="${feedLabels[i]}">${getCell(i)}</td>`).join('')}
`;
tableBody.appendChild(row);
});
} else {
tanksToShow.forEach(tank => {
const tankEntries = this.state.feedLogs
.filter(e => e.tankId === tank.id && isDateInRange(e.date));

if (tankEntries.length === 0) return;

const headerRow = document.createElement('tr');
// XSS FIX: Sanitize tank name before displaying
headerRow.innerHTML = `<td colspan="${feedsCount + 1}" style="background:#e3f2fd; font-weight:700; color:var(--primary-dark);">
<div style="display: flex; justify-content: space-between; align-items: center;">
<span>${this.sanitizeHTML(tank.name)}</span>
</div>
</td>`;
tableBody.appendChild(headerRow);

const entriesByDate = {};
tankEntries.forEach(e => {
if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
entriesByDate[e.date].push(e);
});

const sortedDates = Object.keys(entriesByDate).sort().reverse();

sortedDates.forEach(date => {
const entries = entriesByDate[date].sort((a, b) => a.id - b.id);
const total = entries.reduce((sum, e) => sum + e.amount, 0);

const getCell = (index) => {
if (entries[index]) {
const e = entries[index];
let badgeClass = 'unknown';
let badgeText = e.trayResult;
if (e.trayResult === 'too-much') badgeText = 'Too Much';

const suppTitle = (e.supplements && e.supplements.length > 0) ? `Supplements: ${e.supplements.join(', ')}` : '';

if (e.trayResult === 'empty') badgeClass = 'empty';
else if (e.trayResult === 'little') badgeClass = 'little';
else if (e.trayResult === 'half') badgeClass = 'half';
else if (e.trayResult === 'too-much') badgeClass = 'too-much';
else if (e.trayResult === 'pending') badgeClass = 'pending';

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
} */

renderPerformanceScreen() {
const farmId = this.state.settings.farmId;
if (!farmId) return;
const farmTanks = this.state.tanks.filter(t => t.farmId === farmId);
const farmTankIds = farmTanks.map(t => t.id);
const farmFeedEntries = this.state.feedLogs.filter(e => farmTankIds.some(id => id === e.tankId));
const farmHarvests = this.state.harvests.filter(h => farmTankIds.includes(h.tankId));
// Calculate FCR with input validation (BUG FIX #8)
const totalFeed = farmFeedEntries.reduce((sum, e) => {
const amount = typeof e.amount === 'number' && e.amount >= 0 ? e.amount : 0;
return sum + amount;
}, 0);
const totalHarvested = farmHarvests.reduce((sum, h) => {
const weight = typeof h.weight === 'number' && h.weight >= 0 ? h.weight : 0;
return sum + weight;
}, 0);
const totalBiomass = farmTanks.reduce((sum, tank) => {
const biomass = typeof tank.biomass === 'number' && tank.biomass >= 0 ? tank.biomass : 0;
return sum + biomass;
}, 0);
const totalProduction = totalBiomass + totalHarvested;
const validTotalFeed = !isNaN(totalFeed) ? totalFeed : 0;
const validTotalProduction = !isNaN(totalProduction) ? totalProduction : 0;
const avgFCR = validTotalProduction > 0 ? (validTotalFeed / validTotalProduction).toFixed(2) : '0.00';
const fcrValueEl = document.getElementById('fcrValue');
if (fcrValueEl) fcrValueEl.textContent = avgFCR;
// Calculate Efficiency Score (simplified)
const validChecks = farmFeedEntries.filter(e => ['empty', 'little', 'half', 'too-much'].includes(e.trayResult));
const wasteChecks = validChecks.filter(e => ['half', 'too-much'].includes(e.trayResult));
const wastePct = validChecks.length > 0 ? (wasteChecks.length / validChecks.length) * 100 : 0;
const efficiencyScore = Math.max(0, 100 - wastePct);
const efficiencyScoreEl = document.getElementById('efficiencyScore');
if (efficiencyScoreEl) efficiencyScoreEl.textContent = Math.round(efficiencyScore);
// Calculate Growth & Survival Estimates
let totalADG = 0;
let activeTankCount = 0;
let weightedSurvival = 0;
let totalInitialSeed = 0;

farmTanks.forEach(tank => {
if (tank.status === 'active') {
const doc = this.getDaysOld(tank.stockingDate);
if (doc > 0) {
// Estimate Survival (Linear decay: 95% start, -0.15% per day approx)
const estSurvivalRate = Math.max(0.6, 0.95 - ((doc/100) * 0.15));
const currentPop = tank.initialSeed * estSurvivalRate;
// Biomass is estimated based on FCR 1.2
let biomass = tank.biomass || 0;
if (biomass > 0 && currentPop > 0) {
const avgWeight = (biomass * 1000) / currentPop; // grams
const adg = avgWeight / doc; // grams per day
totalADG += adg;
activeTankCount++;
}
weightedSurvival += estSurvivalRate * tank.initialSeed;
totalInitialSeed += tank.initialSeed;
}
}
});

const avgADG = activeTankCount > 0 ? (totalADG / activeTankCount) : 0.2;
const avgGrowthRateWeekly = (avgADG * 7).toFixed(1); // g/week
const avgSurvival = totalInitialSeed > 0 ? ((weightedSurvival / totalInitialSeed) * 100).toFixed(0) : 85;

const growthRateEl = document.getElementById('growthRate');
if (growthRateEl) growthRateEl.textContent = `${avgADG.toFixed(2)} g/day`;
const survivalRateEl = document.getElementById('survivalRate');
if (survivalRateEl) survivalRateEl.textContent = `${avgSurvival}%`;

// Set trend indicators
const fcrTrendEl = document.getElementById('fcrTrend');
if (fcrTrendEl) {
fcrTrendEl.textContent = avgFCR < 1.5 ? 'Good' : 'High';
fcrTrendEl.className = avgFCR < 1.5 ? 'performance-trend trend-up' : 'performance-trend trend-down';
}
const efficiencyTrendEl = document.getElementById('efficiencyTrend');
if (efficiencyTrendEl) {
efficiencyTrendEl.textContent = efficiencyScore > 80 ? 'High' : 'Low';
efficiencyTrendEl.className = efficiencyScore > 80 ? 'performance-trend trend-up' : 'performance-trend trend-down';
}
const growthTrendEl = document.getElementById('growthTrend');
if (growthTrendEl) {
growthTrendEl.textContent = avgADG > 0.2 ? 'Fast' : 'Slow';
growthTrendEl.className = avgADG > 0.2 ? 'performance-trend trend-up' : 'performance-trend trend-neutral';
}
const survivalTrendEl = document.getElementById('survivalTrend');
if (survivalTrendEl) {
survivalTrendEl.textContent = avgSurvival > 80 ? 'High' : 'Avg';
survivalTrendEl.className = avgSurvival > 80 ? 'performance-trend trend-up' : 'performance-trend trend-neutral';
}

// Profit/Loss Calculation
const feedPrice = this.state.settings.feedPrice || 90;
const marketPrice = this.state.settings.marketPrice || 350;
const totalFeedCost = totalFeed * feedPrice;
// Realized Revenue from Harvests
const realizedRevenue = farmHarvests.reduce((sum, h) => sum + (h.weight * (h.price || marketPrice)), 0);
// Estimated Revenue from Standing Biomass
const estimatedRevenue = totalBiomass * marketPrice;
const totalRevenue = realizedRevenue + estimatedRevenue;
const netProfit = totalRevenue - totalFeedCost;
const profitLossContent = document.getElementById('profitLossContent');
if (profitLossContent) {
const profitSign = netProfit >= 0 ? '+' : '';
profitLossContent.innerHTML = `
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
<div>
<div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">Total Feed Cost</div>
<div style="font-size: 20px; font-weight: 700; color: var(--danger);">₹${Math.round(totalFeedCost).toLocaleString('en-IN')}</div>
<div style="font-size: 11px; color: var(--gray);">@ ₹${feedPrice}/kg</div>
</div>
<div>
<div style="font-size: 12px; color: var(--gray); margin-bottom: 4px;">Est. Revenue</div>
<div style="font-size: 20px; font-weight: 700; color: var(--success);">₹${Math.round(totalRevenue).toLocaleString('en-IN')}</div>
<div style="font-size: 11px; color: var(--gray); display: flex; align-items: center; gap: 4px;">
@ <input type="number" value="${marketPrice}" style="width: 50px; padding: 2px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px;" onchange="app.updateMarketPrice(this.value)"> ₹/kg
</div>
</div>
</div>
<div style="background: var(--light); padding: 16px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
<div style="font-weight: 600; color: var(--dark);">Net Profit (Est.)</div>
<div style="font-size: 24px; font-weight: 800; color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
${profitSign}₹${Math.round(netProfit).toLocaleString('en-IN')}
</div>
</div>
`;
}
}

switchScreen(screenName) {
document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
const screenEl = document.getElementById(`${screenName}Screen`);
if (screenEl) screenEl.classList.add('active');

document.querySelectorAll('.nav-btn').forEach(btn => {
if (btn.dataset.screen === screenName) btn.classList.add('active');
else btn.classList.remove('active');
});
// Render charts when switching to analytics screen
if (screenName === 'analytics') {
setTimeout(() => this.renderCharts(), 100);
}
// Track screen switch
this.trackEvent(`open_${screenName}_tab`);

if (screenName === 'performance') {
this.handlePerformanceTabOpen();
}
}

updateFarmSelector() {
const selector = document.getElementById('currentFarmName');
if (this.state.farm) {
const currentFarm = this.state.farm;
if (currentFarm) {
selector.innerHTML = `${this.sanitizeHTML(currentFarm.name)}`;
this.state.settings.farmId = currentFarm.id;
this.saveSettings();
}
} else {
selector.textContent = "Select Farm";
}
}

getTankById(id) {
return this.state.tanks.find(t => t.id === id);
}

getFarmById(id) {
return this.state.farm && this.state.farm.id === id ? this.state.farm : null;
}

closeAllModals() {
document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

openFarmModal() {
this.editingFarmId = null;
const farmNameInput = document.getElementById('farmNameInput');
const farmLocation = document.getElementById('farmLocation');
const farmContact = document.getElementById('farmContact');
const farmPhone = document.getElementById('farmPhone');
const farmModalTitle = document.querySelector('#farmModal h3');
const saveFarmBtn = document.getElementById('saveFarmBtn');
const farmModal = document.getElementById('farmModal');
if (farmNameInput) farmNameInput.value = '';
if (farmLocation) farmLocation.value = '';
if (farmContact) farmContact.value = '';
if (farmPhone) farmPhone.value = '';
if (farmModalTitle) farmModalTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Add New Farm';
if (saveFarmBtn) saveFarmBtn.innerHTML = '<i class="fas fa-save"></i> Save Farm';
if (farmModal) farmModal.classList.add('active');
}

editFarm(id) {
const farm = this.getFarmById(id);
if (!farm) return;

this.editingFarmId = id;
const farmNameInput = document.getElementById('farmNameInput');
const farmLocation = document.getElementById('farmLocation');
const farmContact = document.getElementById('farmContact');
const farmPhone = document.getElementById('farmPhone');
const farmModalTitle = document.querySelector('#farmModal h3');
const saveFarmBtn = document.getElementById('saveFarmBtn');
const farmModal = document.getElementById('farmModal');
if (farmNameInput) farmNameInput.value = farm.name;
if (farmLocation) farmLocation.value = farm.location || '';
if (farmContact) farmContact.value = farm.contact || '';
if (farmPhone) farmPhone.value = farm.phone || '';
if (farmModalTitle) farmModalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Farm';
if (saveFarmBtn) saveFarmBtn.innerHTML = '<i class="fas fa-save"></i> Update Farm';
if (farmModal) farmModal.classList.add('active');
}

openFarmSelector() {
  // COST-LOCKED V1: Only one farm, so show farm info instead of selector
  if (!this.state.farm) {
    this.openFarmModal();
    return;
  }
  
  const list = document.getElementById('farmsListModal');
  const farm = this.state.farm;
  const farmTanks = this.state.tanks.filter(t => t.farmId === farm.id && t.status !== 'inactive');
  const pondCount = farmTanks.length;
  const avgDoc = farmTanks.length > 0 
    ? Math.round(farmTanks.reduce((sum, t) => sum + this.getDaysOld(t.stockingDate), 0) / farmTanks.length)
    : 0;

  list.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <h3>${this.sanitizeHTML(farm.name)}</h3>
      <p style="color: var(--gray); margin: 10px 0;">
        <i class="fas fa-water"></i> ${pondCount} ${pondCount === 1 ? 'Pond' : 'Ponds'} | Avg DOC ${avgDoc}
      </p>
      ${farm.location ? `<p style="color: var(--gray-500); font-size: 12px;">${this.sanitizeHTML(farm.location)}</p>` : ''}
      <button class="btn btn-secondary" onclick="app.closeAllModals()" style="margin-top: 15px;">
        Close
      </button>
    </div>
  `;
  document.getElementById('farmSelectorModal').classList.add('active');
}

openTankModal(farmId) {
  // COST-LOCKED V1: Use single farm ID
  const actualFarmId = this.state.settings.farmId;
  if (!actualFarmId) {
    this.showToast('Please create a farm first', 'error');
    return;
  }

  this.editingTankId = null;
  const tankNameInput = document.getElementById('tankNameInput');
  const tankSize = document.getElementById('tankSize');
  const stockingDate = document.getElementById('stockingDate');
  const initialSeed = document.getElementById('initialSeed');
  const tankCheckTrays = document.getElementById('tankCheckTrays');
  const tankBlindDuration = document.getElementById('tankBlindDuration');
  const tankBlindWeek1 = document.getElementById('tankBlindWeek1');
  const tankBlindStd = document.getElementById('tankBlindStd');
  const titleEl = document.getElementById('tankModalTitle');
  const select = document.getElementById('tankFarmSelect');
  const btn = document.getElementById('saveTankBtn');
  const tankModal = document.getElementById('tankModal');
  
  if (tankNameInput) tankNameInput.value = '';
  if (tankSize) tankSize.value = '';
  if (stockingDate) stockingDate.value = '';
  if (initialSeed) initialSeed.value = '';
  if (tankCheckTrays) tankCheckTrays.value = 2;
  if (tankBlindDuration) tankBlindDuration.value = 30;
  if (tankBlindWeek1) tankBlindWeek1.value = 2;
  if (tankBlindStd) tankBlindStd.value = 4;
  if (titleEl) titleEl.innerHTML = '<i class="fas fa-water"></i> Add New Tank';

  // COST-LOCKED V1: Hide farm selector since only one farm
  if (select) {
    select.style.display = 'none';
    const label = select.previousElementSibling;
    if (label && label.textContent.includes('Farm')) {
      label.style.display = 'none';
    }
  }
  
  if(btn) btn.textContent = 'Save Tank & Generate Feed Plan';
  if (tankModal) tankModal.classList.add('active');
  this.updateBlindFeedPreview();
}

saveFarm() {
const name = document.getElementById('farmNameInput').value;
const location = document.getElementById('farmLocation').value;
const contact = document.getElementById('farmContact').value;
const phone = document.getElementById('farmPhone').value;

if (!name) {
this.showToast('Farm name is required', 'error');
return;
}

if (this.editingFarmId) {
const farm = this.getFarmById(this.editingFarmId);
if (farm) {
farm.name = name;
farm.location = location;
farm.contact = contact;
farm.phone = phone;
this.showToast('Farm updated successfully');
}
} else {
// COST-LOCKED V1: Single farm per user, no members field
if (this.state.farm) {
this.showToast('Only one farm allowed per user in V1', 'error');
return;
}

const newFarm = {
id: Date.now().toString(),
name,
location,
contact,
phone,
ownerUid: this.userId, // Single owner only
created: new Date().toISOString()
};

this.state.farm = newFarm;
this.state.settings.farmId = newFarm.id;
this.saveSettings();
this.showToast('Farm added successfully');
}

this.saveFarm();
this.closeAllModals();
this.checkFirstTimeUser();
this.renderAll();

document.getElementById('farmNameInput').value = '';
document.getElementById('farmLocation').value = '';
document.getElementById('farmContact').value = '';
document.getElementById('farmPhone').value = '';
this.editingFarmId = null;
}

generateBlindFeedingSchedule(initialSeed, stockingDateStr, duration = 30, week1Freq = 2, stdFreq = 4) {
const schedule = [];
const stockingDate = new Date(stockingDateStr);
const scale = initialSeed / 100000;
// Generate based on duration

for (let doc = 1; doc <= duration; doc++) {
let baseAmount = 0;
if (doc <= 7) {
// Week 1: 2.2kg start, +0.2kg/day
baseAmount = 2.2 + ((doc - 1) * 0.2);
} else if (doc <= 14) {
// Week 2: 3.7kg start, +0.3kg/day
baseAmount = 3.7 + ((doc - 8) * 0.3);
} else if (doc <= 21) {
// Week 3: 5.9kg start, +0.4kg/day
baseAmount = 5.9 + ((doc - 15) * 0.4);
} else if (doc <= 28) {
// Week 4: 8.8kg start, +0.5kg/day
baseAmount = 8.8 + ((doc - 22) * 0.5);
} else {
// Week 5: 12.4kg start, +0.6kg/day
baseAmount = 12.4 + ((doc - 29) * 0.6);
}

let dailyAmount = baseAmount * scale;
// Ensure minimum reasonable amount
if (dailyAmount < 0.1) dailyAmount = 0.1;
// Round to 1 decimal
dailyAmount = Math.round(dailyAmount * 10) / 10;

// Determine feeds for this specific day
const currentFeedsCount = (doc <= 7) ? week1Freq : stdFreq;

// Calculate per feed amount
const perFeed = parseFloat((dailyAmount / currentFeedsCount).toFixed(2));
const feeds = Array(currentFeedsCount).fill(perFeed);

schedule.push({
doc: doc,
amount: parseFloat(dailyAmount.toFixed(1)),
feeds: feeds,
status: 'auto'
});
}
return schedule;
}

    async saveTank() {
    // COST-LOCKED V1: Use single farm ID
    const farmId = this.state.settings.farmId;
    
    if (!farmId) {
        this.showToast('Please create a farm before adding a tank', 'error');
        return;
    }
const name = document.getElementById('tankNameInput').value;
const size = parseFloat(document.getElementById('tankSize').value);
const stockingDate = document.getElementById('stockingDate').value;
const initialSeed = parseInt(document.getElementById('initialSeed').value);
const plSize = document.getElementById('tankPlSize').value;
const checkTrays = parseInt(document.getElementById('tankCheckTrays').value) || 2;
const blindDuration = parseInt(document.getElementById('tankBlindDuration').value) || 30;
const blindWeek1 = parseInt(document.getElementById('tankBlindWeek1').value) || 2;
const blindStd = parseInt(document.getElementById('tankBlindStd').value) || 4;

        if (!name || name.trim().length === 0) {
            this.showToast('Tank name is required', 'error');
            return;
        }

        if (!farmId) {
            this.showToast('Please create/select a farm before adding a tank', 'error');
return;
}

if (!stockingDate) {
 this.showToast('Stocking date is required', 'error');
 return;
}

// Validate tank size
if (isNaN(size) || size <= 0 || size > 100) {
    this.showToast('Tank size must be between 0.01 and 100 acres', 'error');
    return;
}

// Validate stocking date (not in future)
const today = new Date();
const stockDate = new Date(stockingDate);
if (stockDate > today) {
    this.showToast('Stocking date cannot be in the future', 'error');
    return;
}

// Validate initial seed count
if (isNaN(initialSeed) || initialSeed <= 0) {
    this.showToast('Initial seed count must be greater than 0', 'error');
    return;
}

// Validate check trays
if (isNaN(checkTrays) || checkTrays < 1 || checkTrays > 20) {
    this.showToast('Number of trays must be between 1 and 20', 'error');
    return;
}

// Validate blind duration
if (isNaN(blindDuration) || blindDuration < 7 || blindDuration > 120) {
    this.showToast('Blind feeding duration must be between 7 and 120 days', 'error');
    return;
}

// Validate blind week 1 amount
if (isNaN(blindWeek1) || blindWeek1 <= 0 || blindWeek1 > 100) {
    this.showToast('Week 1 blind amount must be between 0.1 and 100 kg', 'error');
    return;
}

// Validate standard blind amount
if (isNaN(blindStd) || blindStd <= 0 || blindStd > 100) {
    this.showToast('Standard blind amount must be between 0.1 and 100 kg', 'error');
    return;
}

if (this.editingTankId) {
const tank = this.getTankById(this.editingTankId);
if (tank) {
// Regenerate blind schedule if critical parameters change
if (tank.initialSeed !== initialSeed || tank.stockingDate !== stockingDate ||
tank.blindDuration !== blindDuration || tank.blindWeek1 !== blindWeek1 || tank.blindStd !== blindStd) {
tank.blindSchedule = this.generateBlindFeedingSchedule(initialSeed || 0, stockingDate, blindDuration, blindWeek1, blindStd);
}
tank.farmId = farmId;
tank.name = name;
tank.size = size;
tank.stockingDate = stockingDate;
tank.initialSeed = initialSeed;
tank.plSize = plSize;
tank.checkTrays = checkTrays;
tank.blindDuration = blindDuration;
tank.blindWeek1 = blindWeek1;
tank.blindStd = blindStd;
this.showToast('Tank updated successfully');
}
} else {

const blindSchedule = this.generateBlindFeedingSchedule(initialSeed || 0, stockingDate, blindDuration, blindWeek1, blindStd);

const newTank = {
id: Date.now().toString(),
farmId,
name,
size,
stockingDate: stockingDate,
initialSeed: initialSeed || 0,
plSize: plSize || '',
checkTrays,
biomass: 0,
blindDuration,
blindWeek1,
blindStd,
blindSchedule: blindSchedule,
nextSuggestedFeed: null,
status: 'active',
lifecycleState: null,
lifecycleStateUpdatedAt: null
};
this.state.tanks.push(newTank);
newTank.lifecycleState = this.calculateLifecycleState(newTank);
newTank.lifecycleStateUpdatedAt = new Date().toISOString();
this.showToast('Tank added & Blind Schedule generated!');
}

    try {
        await this.saveTank(this.editingTankId ? tank : newTank);
    } catch (e) {
        this.reportError(e, { context: 'saveTank' });
        this.showToast('Failed to save tank data. Changes may not be persisted.', 'error');
    }
  this.closeAllModals();
  this.renderAll();
this.editingTankId = null;
}

updateBlindFeedPreview() {
const duration = parseInt(document.getElementById('tankBlindDuration').value) || 30;
const initialSeed = parseInt(document.getElementById('initialSeed').value) || 0;
const week1Freq = parseInt(document.getElementById('tankBlindWeek1').value) || 2;
const stdFreq = parseInt(document.getElementById('tankBlindStd').value) || 4;

const titleEl = document.getElementById('blindFeedPreviewTitle');
const subtitleEl = document.getElementById('blindFeedPreviewSubtitle');

if (!titleEl || !subtitleEl) return;

titleEl.textContent = `Day 1–${duration} Blind Feeding`;
subtitleEl.textContent = 'Enter stocking details to see a preview.';

if (initialSeed > 0) {
const schedule = this.generateBlindFeedingSchedule(initialSeed, this.currentDate, duration, week1Freq, stdFreq);
if (schedule.length > 0) {
const day1Feed = schedule[0].amount;
const lastDayFeed = schedule[schedule.length - 1].amount;
subtitleEl.textContent = `Starts at ${day1Feed.toFixed(1)} kg/day, ends at ${lastDayFeed.toFixed(1)} kg/day.`;
document.getElementById('blindFeedCost').textContent = 'Total cost: ₹' + (schedule.reduce((total, item) => total + item.amount, 0) * this.state.settings.feedPrice).toFixed(2);
}
}
}

editTank(id) {
const tank = this.getTankById(id);
if (!tank) return;


const tankName = tank.name || 'Unnamed Tank';
const tankSize = typeof tank.size === 'number' ? tank.size : '';
const stockingDate = tank.stockingDate || this.getFormattedDate();
const initialSeed = typeof tank.initialSeed === 'number' ? tank.initialSeed : 0;
const plSize = tank.plSize || '';
const checkTrays = typeof tank.checkTrays === 'number' ? tank.checkTrays : 2;
const blindDuration = typeof tank.blindDuration === 'number' ? tank.blindDuration : 30;
const blindWeek1 = typeof tank.blindWeek1 === 'number' ? tank.blindWeek1 : 2;
const blindStd = typeof tank.blindStd === 'number' ? tank.blindStd : 4;

this.openTankModal(tank.farmId);
this.editingTankId = id;
document.getElementById('tankNameInput').value = tankName;
document.getElementById('tankSize').value = tankSize;
document.getElementById('stockingDate').value = stockingDate;
document.getElementById('initialSeed').value = initialSeed;
document.getElementById('tankPlSize').value = plSize;
document.getElementById('tankCheckTrays').value = checkTrays;
document.getElementById('tankBlindDuration').value = blindDuration;
document.getElementById('tankBlindWeek1').value = blindWeek1;
document.getElementById('tankBlindStd').value = blindStd;
document.getElementById('tankModalTitle').textContent = 'Edit Tank';
const btn = document.getElementById('saveTankBtn');
if(btn) btn.textContent = 'Update Tank';

this.updateBlindFeedPreview();
}

deleteTank(id) {
this.pendingDeleteTankId = id;
document.getElementById('confirmTitle').innerHTML = '<i class="fas fa-trash"></i> Delete Tank?';
document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this tank? All associated data (feed, water tests, etc.) will be permanently deleted.';
const btn = document.getElementById('confirmActionBtn');
btn.textContent = 'Delete Permanently';
btn.onclick = () => this.executeDeleteTank();
document.getElementById('confirmationModal').classList.add('active');
}

executeDeleteTank() {
const tankId = String(this.pendingDeleteTankId);
this.state.tanks = this.state.tanks.filter(t => t.id !== tankId);
this.state.feedLogs = this.state.feedLogs.filter(e => e.tankId !== tankId);
this.state.harvests = this.state.harvests.filter(h => h.tankId !== tankId);
this.state.waterQuality = this.state.waterQuality.filter(w => w.tankId !== tankId);
this.state.applications = this.state.applications.filter(a => a.tankId !== tankId);

this.saveAllData();
this.renderAll();
this.closeAllModals();
this.showToast('Tank deleted', 'warning');
this.pendingDeleteTankId = null;
}

toggleTankMenu(id) {
document.querySelectorAll('.tank-menu-dropdown').forEach(el => {
if(el.id !== `tank-menu-${id}`) el.classList.remove('show');
});
const menu = document.getElementById(`tank-menu-${id}`);
if(menu) menu.classList.toggle('show');
}

openInventoryModal() {
document.getElementById('modalCurrentStock').innerHTML = `${(this.state.inventory.totalKg || 0).toFixed(1)} <span class="unit">kg</span>`;
document.getElementById('stockBags').value = '';
document.getElementById('inventoryModal').classList.add('active');
}

saveStock() {
const bagsInput = document.getElementById('stockBags');
const weightInput = document.getElementById('bagWeight');
if (!bagsInput || !weightInput) return;

const bags = parseFloat(bagsInput.value) || 0;
const weight = parseFloat(weightInput.value) || 25;

if (bags > 0) {
const addedKg = bags * weight;
this.state.inventory.totalKg = (this.state.inventory.totalKg || 0) + addedKg;
this.saveInventory();
this.renderOverallStats();
this.closeAllModals();
this.showToast(`Added ${addedKg} kg to stock`);
} else {
this.showToast('Please enter valid quantity', 'error');
}
}

openMedicineInventoryModal() {
this.renderMedicineList();
document.getElementById('medicineInventoryModal').classList.add('active');
}

renderMedicineList() {
const list = document.getElementById('medicineList');
if (!list) return;
if (this.state.medicineInventory.length === 0) {
list.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">No items in inventory</div>';
return;
}

list.innerHTML = this.state.medicineInventory.map((item, index) => `
<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border);">
<div>
<div style="font-weight: 600;">${this.sanitizeHTML(item.name)}</div>
<div style="font-size: 12px; color: var(--gray);">Added: ${new Date(item.date).toLocaleDateString()}</div>
</div>
<div style="display: flex; align-items: center; gap: 10px;">
<span style="font-weight: 700;">${item.qty}</span>
<button class="btn-icon" style="color: var(--danger);" onclick="app.deleteMedicineItem(${index})">
<i class="fas fa-trash"></i>
</button>
</div>
</div>
`).join('');
}

addMedicineItem() {
const nameInput = document.getElementById('medName');
const qtyInput = document.getElementById('medQty');
const name = nameInput.value.trim();
const qty = parseFloat(qtyInput.value);

if (!name || !qty) {
this.showToast('Please enter name and quantity', 'error');
return;
}

this.state.medicineInventory.push({
name,
qty,
date: new Date().toISOString()
});

this.saveMedicineInventory();
this.renderMedicineList();
this.renderInventorySummary();
nameInput.value = '';
qtyInput.value = '';
this.showToast('Item added');
}

deleteMedicineItem(index) {

this.showConfirmModal('Remove this item?', 'Confirm Delete').then(confirmed => {
if (confirmed) {
this.state.medicineInventory.splice(index, 1);
this.saveMedicineInventory();
this.renderMedicineList();
this.renderInventorySummary();
}
});
}

editFeedEntry(id) {
const entry = this.state.feedLogs.find(e => e.id === id);
if (!entry) return;


const entryAmount = typeof entry.amount === 'number' ? entry.amount : 0;
const entryDate = entry.date || this.getFormattedDate();
const entryTime = entry.time || '';
const entryReason = entry.reason || '';
const entryTrayResult = entry.trayResult || 'pending';

this.editingEntryId = id;
const tank = this.getTankById(entry.tankId);
document.getElementById('editFeedTitle').textContent = `Edit Feed - ${tank ? this.sanitizeHTML(tank.name) : 'Unknown Tank'}`;
document.getElementById('editFeedDate').textContent = `${entryDate} ${entryTime}`;
document.getElementById('editFeedAmount').value = entryAmount;
document.getElementById('editFeedReason').value = entryReason;
document.getElementById('editFeedTray').value = entryTrayResult;
document.getElementById('editFeedModal').classList.add('active');
}

saveEditedFeedEntry() {
if (!this.editingEntryId) return;
const amount = parseFloat(document.getElementById('editFeedAmount').value);
const trayResult = document.getElementById('editFeedTray').value;
const reason = document.getElementById('editFeedReason').value;

// Validate feed amount
if (isNaN(amount) || amount <= 0 || amount > 1000) {
    this.showToast('Feed amount must be between 0.01 and 1000 kg', 'error');
    return;
}

// Validate tray result
const validTrayResults = ['pending', 'empty', 'little', 'half', 'too-much', 'blind-fed', 'skipped'];
if (!validTrayResults.includes(trayResult)) {
    this.showToast('Invalid tray result selected', 'error');
    return;
}

// Validate reason if provided
if (reason && reason.trim().length > 500) {
    this.showToast('Reason must be less than 500 characters', 'error');
    return;
}

const entryIndex = this.state.feedLogs.findIndex(e => e.id === this.editingEntryId);
if (entryIndex === -1) return;

const oldAmount = this.state.feedLogs[entryIndex].amount;
const tankId = this.state.feedLogs[entryIndex].tankId;
// BUG #3 FIX: Update inventory with validation to prevent negative inventory
const diff = amount - oldAmount;
const newInventoryTotal = (this.state.inventory.totalKg || 0) - diff;

// Validate inventory won't go negative
if (newInventoryTotal < 0) {
    this.showToast(`Cannot reduce amount. Insufficient inventory. Current: ${this.state.inventory.totalKg.toFixed(1)}kg, Diff: ${diff.toFixed(1)}kg`, 'error');
    return;
}

this.state.inventory.totalKg = newInventoryTotal;
this.state.feedLogs[entryIndex].amount = amount;
this.state.feedLogs[entryIndex].trayResult = trayResult;
this.state.feedLogs[entryIndex].reason = reason || null;

// BUG #2 FIX: Use async save with proper sequencing
(async () => {
    try {
        await this.saveFeedEntry(this.state.feedLogs[entryIndex]);
        await this.saveInventory();
        this.recalculateTankBiomass(tankId);
        this.closeAllModals();
        this.renderAll();
        this.showToast('Feed entry updated');
        this.editingEntryId = null;
    } catch (e) {
        console.error('Failed to save feed entry:', e);
        this.showToast('Failed to save changes', 'error');
    }
})();
}

openWaterQualityModal(tankId) {
this.editingTankId = tankId;
document.getElementById('waterPh').value = '';
document.getElementById('waterDo').value = '';
document.getElementById('waterAmmonia').value = '';
document.getElementById('waterSalinity').value = '';
document.getElementById('waterAlkalinity').value = '';
document.getElementById('waterNitrite').value = '';
document.getElementById('waterQualityModal').classList.add('active');
}

saveWaterQuality() {
const tankId = this.editingTankId;
const ph = parseFloat(document.getElementById('waterPh').value);
const doVal = parseFloat(document.getElementById('waterDo').value);
const ammonia = parseFloat(document.getElementById('waterAmmonia').value);
const salinity = parseFloat(document.getElementById('waterSalinity').value);
const alkalinity = parseFloat(document.getElementById('waterAlkalinity').value);
const nitrite = parseFloat(document.getElementById('waterNitrite').value);
if (!tankId) return;
if (isNaN(ph) && isNaN(doVal) && isNaN(ammonia) && isNaN(salinity) && isNaN(alkalinity) && isNaN(nitrite)) {
this.showToast('Please enter at least one value', 'error');
return;
}

const entry = {
id: Date.now(),
tankId,
date: new Date().toISOString(),
ph: isNaN(ph) ? null : ph,
do: isNaN(doVal) ? null : doVal, // Dissolved Oxygen
ammonia: isNaN(ammonia) ? null : ammonia,
salinity: isNaN(salinity) ? null : salinity,
alkalinity: isNaN(alkalinity) ? null : alkalinity,
nitrite: isNaN(nitrite) ? null : nitrite
};

this.state.waterQuality.push(entry);
this.saveWaterQualityData(entry);
this.closeAllModals();
this.openTankDetail(tankId); // Refresh detail view
this.showToast('Water quality logged');
}

openApplicationModal(tankId) {
this.editingTankId = tankId;
document.getElementById('appItemName').value = '';
document.getElementById('appAmount').value = '';
document.getElementById('appUnit').value = 'kg';
document.getElementById('appDate').value = this.currentDate;
const dataList = document.getElementById('medicineListOptions');
if (dataList) {
const uniqueItems = [...new Set(this.state.medicineInventory.map(i => i.name))];
dataList.innerHTML = uniqueItems.map(i => `<option value="${this.sanitizeHTML(i)}">`).join('');
}
document.getElementById('applicationModal').classList.add('active');
}

openDiseaseModal(tankId) {
this.editingTankId = tankId;
document.getElementById('diseaseDate').value = this.currentDate;
document.getElementById('diseaseType').value = '';
document.getElementById('diseaseSymptoms').value = '';
document.getElementById('diseaseTreatment').value = '';
document.getElementById('diseaseDose').value = '';
document.getElementById('diseaseDuration').value = '';
document.getElementById('diseaseOutcome').value = 'ongoing';
document.getElementById('diseaseCost').value = '';
document.getElementById('diseaseNotes').value = '';
document.getElementById('diseaseModal').classList.add('active');
}


saveApplication() {
const tankId = this.editingTankId;
const itemName = document.getElementById('appItemName').value;
const amount = parseFloat(document.getElementById('appAmount').value);
const unit = document.getElementById('appUnit').value;
const date = document.getElementById('appDate').value;

if (!itemName || !amount) {
this.showToast('Item name and amount are required', 'error');
return;
}

if (!this.state.applications) this.state.applications = [];

const entry = {
id: Date.now(),
tankId,
date: date || new Date().toISOString(),
itemName,
amount,
unit
};

this.state.applications.push(entry);
this.saveApplications(entry);
this.closeAllModals();
this.openTankDetail(tankId);
this.showToast('Application logged');
}

saveDiseaseLog() {
const tankId = this.editingTankId;
const dateNoticed = document.getElementById('diseaseDate').value;
const diseaseType = document.getElementById('diseaseType').value;
const symptoms = document.getElementById('diseaseSymptoms').value;
const treatment = document.getElementById('diseaseTreatment').value;
const dose = document.getElementById('diseaseDose').value;
const duration = parseInt(document.getElementById('diseaseDuration').value) || 0;
const outcome = document.getElementById('diseaseOutcome').value;
const cost = parseFloat(document.getElementById('diseaseCost').value) || 0;
const notes = document.getElementById('diseaseNotes').value;

if (!diseaseType || !dateNoticed) {
this.showToast('Disease type and date are required', 'error');
return;
}

if (!this.state.diseases) this.state.diseases = [];

const entry = {
id: Date.now(),
tankId,
dateNoticed,
diseaseName: diseaseType,
diseaseType,
symptoms,
treatment,
dose,
duration,
outcome,
cost,
notes
};

this.state.diseases.push(entry);
this.saveDiseases(entry);
this.closeAllModals();
this.openTankDetail(tankId);
this.showToast('Disease log recorded');
}

deleteDiseaseLog(entryId, tankId) {
this.state.diseases = (this.state.diseases || []).filter(d => d.id !== entryId);
if (this.db && this.userId) {
    this.db.collection('diseases').doc(String(entryId)).delete();
} else {
    this.saveDiseases(null);
}
this.openTankDetail(tankId);
this.showToast('Disease log deleted');
}


openApplicationHistory(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

const list = document.getElementById('applicationHistoryList');
const entries = this.state.applications ? this.state.applications.filter(a => a.tankId === tankId).sort((a, b) => b.id - a.id) : [];

if (entries.length === 0) {
list.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No applications found.</p></div>';
} else {
list.innerHTML = entries.map(entry => {

const entryItemName = entry.itemName || 'Unknown Item';
const entryDate = entry.date || this.getFormattedDate();
const entryAmount = typeof entry.amount === 'number' ? entry.amount : 0;
const entryUnit = entry.unit || '';
return `
<div class="settings-item" style="align-items: center; margin-bottom: 8px;">
<div style="flex: 1;">
<div style="font-weight: 600;">${this.sanitizeHTML(entryItemName)}</div>
<div style="font-size: 12px; color: var(--gray);">
${new Date(entryDate).toLocaleDateString()} • ${entryAmount} ${this.sanitizeHTML(entryUnit)}
</div>
</div>
<button class="btn-icon" style="color: var(--danger);" onclick="app.deleteApplication(${entry.id}, '${this.escapeAttribute(tankId)}')">
<i class="fas fa-trash"></i>
</button>
</div>
`;
}).join('');
}
document.getElementById('applicationHistoryModal').classList.add('active');
}

deleteApplication(id, tankId) {

this.showConfirmModal('Delete this application log?', 'Confirm Delete').then(confirmed => {
if (confirmed) {
this.state.applications = this.state.applications.filter(a => a.id !== id);
if (this.db && this.userId) {
    this.db.collection('applications').doc(String(id)).delete();
} else {
    this.saveApplications(null);
}
this.openApplicationHistory(tankId);
this.openTankDetail(tankId);
this.showToast('Log deleted');
}
});
}

deleteFeedEntry() {
if (!this.editingEntryId) return;

this.showConfirmModal('Delete this feed entry?', 'Confirm Delete').then(confirmed => {
if (confirmed) {
const entryIndex = this.state.feedLogs.findIndex(e => e.id === this.editingEntryId);
if (entryIndex === -1) return;
const entry = this.state.feedLogs[entryIndex];
const tankId = entry.tankId;
// BUG #3 FIX: Restore inventory safely
const currentInventory = this.state.inventory.totalKg || 0;
const refundAmount = entry.amount || 0;
// Validate refund amount is reasonable
if (refundAmount > 0 && refundAmount <= 10000) {
    this.state.inventory.totalKg = currentInventory + refundAmount;
} else {
    // If amount is invalid, just don't refund
    console.warn('Skipping inventory refund for entry with invalid amount:', entry);
}
this.state.feedLogs.splice(entryIndex, 1);
if (this.db && this.userId) {
    this.db.collection('feedLogs').doc(String(entry.id)).delete();
} else {
    this.saveFeedEntry(null);
}
this.saveInventory();
this.recalculateTankBiomass(tankId);
this.closeAllModals();
this.renderAll();
this.showToast('Feed entry deleted');
this.editingEntryId = null;
}
});
}

adjustFeedAmount(delta) {
const input = document.getElementById('logFeedAmount');
if (!input) return;
let val = parseFloat(input.value) || 0;
val += delta;
if (val < 0) val = 0;
input.value = val.toFixed(1);
}

setFeedAmount(type) {
const input = document.getElementById('logFeedAmount');
if (!input) return;
if (type === 'last') {
const last = parseFloat(input.getAttribute('data-last')) || 0;
input.value = last;
} else if (type === 'suggested') {
const sugg = parseFloat(input.getAttribute('data-sugg')) || 0;
input.value = sugg;
}
this.showToast('Amount updated', 'info');
}

openLogFeedModal(tankId = null, prefillAmount = null, feedIndex = null, isFirstTrayFeed = false) {
const farmId = this.state.settings.farmId;
if (!farmId) return;

// LIFECYCLE CHECK: Prevent feed logging in certain states
if (tankId) {
const tank = this.getTankById(tankId);
if (tank && !this.isFeatureAvailable(tank, 'canLogFeed')) {
const lifecycleInfo = this.getLifecycleStateInfo(tank.lifecycleState || this.calculateLifecycleState(tank));
this.showToast(`Cannot log feed: Pond is in ${lifecycleInfo.label} state`, 'warning');
return;
}
}

const tanks = this.state.tanks.filter(t => t.farmId === farmId && t.status !== 'inactive');
if (tanks.length === 0) {
this.showToast('No active tanks found', 'error');
return;
}

// Determine selected tank
let selectedId = tankId;
if (!selectedId && this.activeLogTankId && document.getElementById('logScreen').classList.contains('active')) {
selectedId = this.activeLogTankId;
}
if (!selectedId) selectedId = tanks[0].id;

// Populate Dropdown
const select = document.getElementById('logFeedTankSelect');
select.innerHTML = tanks.map(t =>
`<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${this.sanitizeHTML(t.name)}</option>`
).join('');

// Reset UI state
document.getElementById('logFeedTankName').style.display = 'block';
document.getElementById('logFeedTankSelect').style.display = 'none';
document.getElementById('logFeedReason').value = '';
// Render Supplements
// Render Supplements
const suppContainer = document.getElementById('logFeedSupplements');
suppContainer.innerHTML = this.state.settings.supplements.map(s => `
<div class="supplement-option" onclick="this.classList.toggle('selected')">
<i class="fas fa-plus"></i> ${s}
</div>
`).join('');

  // Reset health inputs
  const healthCheckbox = document.getElementById('logHealthObserved');
  if (healthCheckbox) healthCheckbox.checked = false;
  const healthDetails = document.getElementById('logHealthDetails');
  if (healthDetails) healthDetails.style.display = 'none';
  const mortalityInput = document.getElementById('logMortalityCount');
  if (mortalityInput) mortalityInput.value = '';
  const diseaseSelect = document.getElementById('logDiseaseType');
  if (diseaseSelect) diseaseSelect.value = '';

// Update Context for selected tank
this.updateLogFeedContext(selectedId);

// Override with prefill amount if provided (from schedule click)
if (prefillAmount !== null) {
document.getElementById('logFeedAmount').value = prefillAmount;
const btnSugg = document.getElementById('btnSuggestedAmt');
if(btnSugg) btnSugg.textContent = `Plan: ${prefillAmount}kg`;
// Update context to show which feed this is
if (feedIndex !== null) {
document.getElementById('logFeedContextText').textContent = `Feed ${feedIndex + 1} • ${prefillAmount}kg Planned`;
}
}

// Show special indicator for first tray-based feed after blind transition
const contextText = document.getElementById('logFeedContextText');
if (isFirstTrayFeed && contextText) {
const tank = this.getTankById(selectedId);
const doc = tank ? this.getDaysOld(tank.stockingDate) : 0;
contextText.innerHTML = `
<span style="background: #e3f2fd; color: #1565C0; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 4px;">
<i class="fas fa-info-circle"></i> First Tray Check Required
</span><br>
<span style="color: var(--gray);">DOC ${doc} • Tray-based feeding active</span>
`;
}

document.getElementById('feedRoundModal').classList.add('active');
}

onLogFeedTankChange() {
const tankId = document.getElementById('logFeedTankSelect').value;
this.updateLogFeedContext(tankId);
}

// ===== DIFFERENTIATED FEED FLOW: BLIND MODE vs TRAY MODE =====
// 🌱 BLIND MODE (DOC 1-25/30):
//    - Auto-suggest from blind schedule
//    - Show round number and planned amount
//    - No tray checks required (trayResult = 'blind-fed')
//    - Track discipline only (planned vs given)
//    - NO FCR, NO efficiency graphs, NO overfeeding alerts
//
// 🍽️ TRAY MODE (DOC 30+):
//    - Show last round summary with tray status
//    - Tray status triggers next feed suggestion
//    - Farmer/Supervisor sets final feed amount
//    - Worker executes exactly as set
//    - Track execution accuracy
updateLogFeedContext(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

const entries = this.state.feedLogs.filter(e => e.tankId === tankId).sort((a, b) => b.id - a.id);
const lastEntry = entries[0];
const doc = this.getDaysOld(tank.stockingDate);

const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
const isBlindMode = doc <= blindDuration && !tank.hasTransitionedFromBlind;
const isTrayMode = !isBlindMode;

// Calculate Suggestion
let suggestion = 0;
let reason = "Initial";
if (lastEntry) {

const lastAmount = (lastEntry?.amount) ?? 0;
const lastTray = (lastEntry?.trayResult) ?? 'pending';
let blindPlanAmount = null; // Holds the suggestion from the blind schedule

// BLIND MODE: Check blind schedule if applicable
if (isBlindMode && tank.blindSchedule) {
const plan = tank.blindSchedule.find(s => s.doc === doc);
if (plan) {
// Determine which feed number based on time of day
const hour = new Date().getHours();
const feedsCount = plan.feeds ? plan.feeds.length : (this.state.settings.feedsPerDay || 4);
// Generic logic for any number of feeds
const startHour = 6; // 6 AM
const endHour = 22; // 10 PM
const window = endHour - startHour;
const interval = window / Math.max(1, feedsCount);
let feedIndex = Math.floor((hour - startHour) / interval);
if (feedIndex < 0) feedIndex = 0;
if (feedIndex >= feedsCount) feedIndex = feedsCount - 1;
if (plan.feeds && plan.feeds[feedIndex] !== undefined) {
blindPlanAmount = plan.feeds[feedIndex];
} else {
blindPlanAmount = parseFloat((plan.amount / feedsCount).toFixed(2));
}
}
}

if (blindPlanAmount !== null) {
suggestion = blindPlanAmount;
reason = `Blind Schedule (Day ${doc})`;
} else if (isTrayMode) {
// TRAY MODE: Use tray-based calculation
const res = this.calculateStrictFeed(lastAmount, lastTray, doc);
suggestion = res.amount;
reason = res.reason;
} else {
// Fallback
suggestion = lastAmount > 0 ? lastAmount : 2.0;
reason = "Continue";
}
} else {
suggestion = 2.0;
}
// TRAY MODE: If tank has a nextSuggestedFeed set from a tray check, use it
if (isTrayMode && tank.nextSuggestedFeed) {
suggestion = tank.nextSuggestedFeed;
reason = "Based on recent tray check";
}

// Check FOR RECENT HEALTH ISSUES - REDUCE FEED IF HEALTH PROBLEMS
const healthIssue = this.checkRecentHealthIssues(tankId);
let originalSuggestion = suggestion;
if (healthIssue) {
suggestion = suggestion * 0.85; // Reduce by 15% if health issues
suggestion = parseFloat(suggestion.toFixed(1));
reason = healthIssue.reason;
}
// Determine how many feeds are expected for this DOC/day
let totalFeedsForDay = this.state.settings.feedsPerDay || 4;
if (isBlindMode && tank.blindSchedule) {
  const scheduleDoc = doc === 0 ? 1 : doc;
  const schedule = tank.blindSchedule.find(s => s.doc === scheduleDoc);
  if (schedule) {
    totalFeedsForDay = schedule.feeds ? schedule.feeds.length : (this.state.settings.feedsPerDay || 4);
  }
}

// Count how many feeds already logged for THIS calendar date
const todayEntries = this.state.feedLogs.filter(e => e.tankId === tankId && e.date === this.currentDate).sort((a, b) => a.id - b.id);

// BLIND MODE vs TRAY MODE: Different UI context
const feedRoundNumber = todayEntries.length + 1;

const btnSugg = document.getElementById('btnSuggestedAmt');
const healthWarningBanner = document.getElementById('healthWarningBanner');

if (todayEntries.length >= totalFeedsForDay) {
  // ❗ HARD RULE: All feed rounds completed for today
  // Show status message and prepare for next day
  const nextDoc = doc + 1;
  let nextSuggestion = suggestion;
  let nextReason = reason;

  // If blind schedule applies to nextDoc, prefer its first feed
  if (isBlindMode && tank.blindSchedule) {
    const scheduleDoc = nextDoc === 0 ? 1 : nextDoc;
    const schedule = tank.blindSchedule.find(s => s.doc === scheduleDoc);
    if (schedule) {
      const feedsCount = schedule.feeds ? schedule.feeds.length : (this.state.settings.feedsPerDay || 4);
      nextSuggestion = schedule.feeds ? schedule.feeds[0] : parseFloat((schedule.amount / feedsCount).toFixed(2));
      nextReason = `Blind Schedule (Day ${nextDoc})`;
    }
  } else if (isTrayMode) {
    // Fallback: use strict feed calc for nextDoc
    const resNext = this.calculateStrictFeed(((lastEntry?.amount) ?? suggestion), (lastEntry?.trayResult) ?? 'pending', nextDoc);
    nextSuggestion = resNext.amount;
    nextReason = resNext.reason;
  }

  // Apply health reduction if applicable
  if (healthIssue) {
    nextSuggestion = parseFloat((nextSuggestion * 0.85).toFixed(1));
    nextReason = healthIssue.reason;
  }

  // Update UI to indicate next-day suggestion and set modal target date to tomorrow
  document.getElementById('logFeedTankName').innerHTML = `${this.sanitizeHTML(tank.name)} <i class="fas fa-chevron-down" style="font-size: 16px; opacity: 0.5;"></i>`;
  document.getElementById('logFeedContextText').innerHTML = `<span style="color: var(--success); font-weight: 600;">✅ Today's feeding completed</span><br><span style="font-size: 12px; color: var(--gray);">Next: Day ${nextDoc}</span>`;
  btnSugg.textContent = `Next Day: ${nextSuggestion}kg`;
  btnSugg.style.borderColor = healthIssue ? 'var(--warning)' : '';
  btnSugg.style.color = healthIssue ? 'var(--warning-dark)' : '';

  // Show health banner if relevant
  if (healthIssue) {
    healthWarningBanner.style.display = 'block';
    document.getElementById('healthWarningTitle').textContent = healthIssue.type === 'mortality' ? `⚠️ Mortality Reported` : `⚠️ Disease Detected`;
    document.getElementById('healthWarningText').textContent = healthIssue.reason.replace('⚠️ ', '').replace(' (-15% feed)', '');
  } else {
    healthWarningBanner.style.display = 'none';
  }

  // Set modal attribute so saveLogFeed knows to create the entry for the next calendar date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const feedModal = document.getElementById('feedRoundModal');
  if (feedModal) feedModal.setAttribute('data-target-date', tomorrowStr);

  document.getElementById('logFeedAmount').setAttribute('data-last', ((lastEntry?.amount) ?? 0));
  document.getElementById('logFeedAmount').setAttribute('data-sugg', nextSuggestion);
  document.getElementById('logFeedAmount').value = nextSuggestion;
} else {
  // Normal case: still feeds remaining today
  // Ensure modal target date cleared
  const feedModal = document.getElementById('feedRoundModal');
  if (feedModal) feedModal.removeAttribute('data-target-date');

  // Update UI based on BLIND MODE vs TRAY MODE
  document.getElementById('logFeedTankName').innerHTML = `${this.sanitizeHTML(tank.name)} <i class="fas fa-chevron-down" style="font-size: 16px; opacity: 0.5;"></i>`;
  const lastAmount = (lastEntry?.amount) ?? 0;
  
  // DIFFERENTIATED CONTEXT DISPLAY
  if (isBlindMode) {
    // 🌱 BLIND MODE: Show feed round number and planned amount
    document.getElementById('logFeedContextText').innerHTML = `
      <span style="background: var(--warning-light); color: var(--warning-dark); padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 4px;">
        🌱 BLIND MODE
      </span><br>
      <span style="color: var(--dark); font-weight: 600;">Round ${feedRoundNumber} of ${totalFeedsForDay}</span> • DOC ${doc}
    `;
    btnSugg.textContent = `Plan: ${suggestion}kg`;
  } else {
    // 🍽️ TRAY MODE: Show last round summary with tray status
    // Check if this is the first tray-based feed (no previous entries or all previous were blind-fed)
    const trayEntries = entries.filter(e => e.trayResult && e.trayResult !== 'blind-fed');
    const isFirstTrayFeed = trayEntries.length === 0;
    
    if (isFirstTrayFeed) {
      // First tray-based feed - no previous tray data to show
      document.getElementById('logFeedContextText').innerHTML = `
        <span style="background: var(--info-light); color: var(--info-dark); padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 4px;">
          🍽️ TRAY MODE
        </span><br>
        <span style="color: var(--dark); font-weight: 600;">First Tray-Based Feed</span><br>
        <span style="font-size: 12px; color: var(--gray);">Round ${feedRoundNumber} of ${totalFeedsForDay} • DOC ${doc} • Check trays after feeding</span>
      `;
    } else {
      // Show last tray status
      const lastTrayStatus = lastEntry?.trayResult || 'pending';
      let trayIcon = '⏳';
      let trayText = 'Pending';
      let trayColor = 'var(--warning)';
      
      if (lastTrayStatus === 'empty') {
        trayIcon = '✅';
        trayText = 'Empty';
        trayColor = 'var(--success)';
      } else if (lastTrayStatus === 'little') {
        trayIcon = '⚠️';
        trayText = 'Little';
        trayColor = 'var(--warning)';
      } else if (lastTrayStatus === 'half') {
        trayIcon = '◐';
        trayText = 'Half';
        trayColor = 'var(--error)';
      } else if (lastTrayStatus === 'too-much') {
        trayIcon = '❌';
        trayText = 'Too Much';
        trayColor = 'var(--error)';
      }
      
      document.getElementById('logFeedContextText').innerHTML = `
        <span style="background: var(--info-light); color: var(--info-dark); padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block; margin-bottom: 4px;">
          🍽️ TRAY MODE
        </span><br>
        <span style="color: var(--dark); font-weight: 600;">Last Round: ${lastAmount}kg</span> • Tray: <span style="color: ${trayColor};">${trayIcon} ${trayText}</span><br>
        <span style="font-size: 12px; color: var(--gray);">Round ${feedRoundNumber} of ${totalFeedsForDay} • DOC ${doc}</span>
      `;
    }
    btnSugg.textContent = `Sugg: ${suggestion}kg`;
  }

  // Show health warning if feed was reduced due to health issues
  if (healthIssue) {
    btnSugg.textContent = btnSugg.textContent + ' ⚠️';
    btnSugg.style.borderColor = 'var(--warning)';
    btnSugg.style.color = 'var(--warning-dark)';
    // Show health warning banner
    healthWarningBanner.style.display = 'block';
    document.getElementById('healthWarningTitle').textContent = healthIssue.type === 'mortality' ? `⚠️ Mortality Reported` : `⚠️ Disease Detected`;
    document.getElementById('healthWarningText').textContent = healthIssue.reason.replace('⚠️ ', '').replace(' (-15% feed)', '');
  } else {
    btnSugg.style.borderColor = '';
    btnSugg.style.color = '';
    healthWarningBanner.style.display = 'none';
  }

  document.getElementById('logFeedAmount').setAttribute('data-last', lastAmount);
  document.getElementById('logFeedAmount').setAttribute('data-sugg', suggestion);
  document.getElementById('logFeedAmount').value = suggestion;
}
}

// ===== TRAY ACTIVE MODE HELPERS =====

// Determine if tank is in Tray Active mode
isTrayActiveMode(tank) {
  if (!tank) return false;
  const doc = this.getDaysOld(tank.stockingDate);
  const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
  return doc > blindDuration || tank.hasTransitionedFromBlind;
}

// Get feed round number for a new feed entry
getFeedRoundNumber(tankId, date = this.currentDate) {
  const todayEntries = this.state.feedLogs.filter(e => 
    e.tankId === tankId && e.date === date
  ).sort((a, b) => a.id - b.id);
  return todayEntries.length + 1;
}

// Get last completed feed round for today
getLastCompletedRound(tankId, date = this.currentDate) {
  const todayEntries = this.state.feedLogs.filter(e => 
    e.tankId === tankId && e.date === date
  ).sort((a, b) => b.id - a.id);
  
  if (todayEntries.length === 0) return null;
  
  const lastEntry = todayEntries[0];
  return {
    entry: lastEntry,
    roundNumber: lastEntry.feed_round_number || todayEntries.length,
    hasTrayStatus: lastEntry.trayResult && lastEntry.trayResult !== 'pending',
    trayStatus: lastEntry.trayResult,
    trayResults: lastEntry.trayResults || [],
    amount: lastEntry.amount,
    supplements: lastEntry.supplements || [],
    time: lastEntry.time
  };
}

// Check if next feed suggestion can be shown (requires tray status update)
canShowNextFeedSuggestion(tankId, date = this.currentDate) {
  const tank = this.getTankById(tankId);
  if (!tank || !this.isTrayActiveMode(tank)) return true; // Blind mode always shows suggestion
  
  const lastRound = this.getLastCompletedRound(tankId, date);
  if (!lastRound) return true; // No previous round, can show first suggestion
  
  // In Tray Active mode, next suggestion requires tray status update
  return lastRound.hasTrayStatus;
}

// ===== TRAY MODE STATE MACHINE INTEGRATION =====
// Get current tray mode state for a tank
getTrayModeState(tankId, date = this.currentDate) {
  const tank = this.getTankById(tankId);
  if (!tank) return { state: null, isTrayMode: false };
  
  const doc = this.getDaysOld(tank.stockingDate);
  const feedsPerDay = this.state.settings.feedsPerDay || 4;
  
  // Use state machine from tray-mode-state-machine.js
  if (typeof getTrayModeState === 'function') {
    return getTrayModeState(tank, this.state.feedLogs, date, feedsPerDay);
  }
  
  // Fallback if state machine not loaded
  return { state: null, isTrayMode: false };
}

// Get planned feed amount for current round (Tray Mode)
getPlannedFeedAmount(tankId, roundNumber, date = this.currentDate) {
  const tank = this.getTankById(tankId);
  if (!tank) return 2.0;
  
  // Use state machine from tray-mode-state-machine.js
  if (typeof getPlannedFeedForRound === 'function') {
    return getPlannedFeedForRound(tank, this.state.feedLogs, date, roundNumber);
  }
  
  // Fallback
  return 2.0;
}

// Calculate next feed from tray results (Tray Mode)
calculateNextFeedFromTrayResults(currentAmount, trayResults) {
  // Use state machine from tray-mode-state-machine.js
  if (typeof calculateNextFeedFromTray === 'function') {
    return calculateNextFeedFromTray(currentAmount, trayResults);
  }
  
  // Fallback
  return {
    suggestedKg: currentAmount,
    reason: 'Maintaining current amount',
    adjustment: 0
  };
}

// Check if feed can be logged (Tray Mode state validation)
canLogFeedNow(tankId, date = this.currentDate) {
  const state = this.getTrayModeState(tankId, date);
  
  // Use state machine from tray-mode-state-machine.js
  if (typeof canLogFeed === 'function') {
    return canLogFeed(state);
  }
  
  // Fallback - allow if not in tray mode
  return { canLog: !state.isTrayMode || state.state === 'READY_TO_FEED', reason: '' };
}

// Check if all planned rounds are completed for today
areAllRoundsCompleted(tankId, date = this.currentDate) {
  const tank = this.getTankById(tankId);
  if (!tank) return false;
  
  const doc = this.getDaysOld(tank.stockingDate);
  const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
  
  let totalFeedsForDay = this.state.settings.feedsPerDay || 4;
  
  // Check blind schedule if applicable
  if (tank.blindSchedule && doc <= blindDuration && !tank.hasTransitionedFromBlind) {
    const scheduleDoc = doc === 0 ? 1 : doc;
    const schedule = tank.blindSchedule.find(s => s.doc === scheduleDoc);
    if (schedule && schedule.feeds) {
      totalFeedsForDay = schedule.feeds.length;
    }
  }
  
  const todayEntries = this.state.feedLogs.filter(e => 
    e.tankId === tankId && e.date === date
  );
  
  return todayEntries.length >= totalFeedsForDay;
}

// Render Last Feed Round Summary for Tray Active Mode
renderLastFeedRoundSummary(tankId, date = this.currentDate) {
  const lastRound = this.getLastCompletedRound(tankId, date);
  
  if (!lastRound) {
    return `
      <div style="background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; margin-bottom: 16px; text-align: center;">
        <i class="fas fa-info-circle" style="font-size: 24px; color: var(--gray); margin-bottom: 8px;"></i>
        <div style="font-size: 14px; color: var(--gray); font-weight: 500;">No feed round completed today</div>
        <div style="font-size: 12px; color: var(--gray-500); margin-top: 4px;">Start your first feed round below</div>
      </div>
    `;
  }
  
  const entry = lastRound.entry;
  const tank = this.getTankById(tankId);
  const doc = tank ? this.getDaysOld(tank.stockingDate) : 0;
  
  // Calculate tray feed per tray
  const traySettings = this.state.settings.trayCheckPercentages || { range1: 0.3, range2: 0.6, range3: 1.0 };
  let pct = traySettings.range1;
  if (doc >= 90) pct = traySettings.range3;
  else if (doc >= 60) pct = traySettings.range2;
  const trayFeedKg = entry.amount * (pct / 100);
  const trayFeedGrams = Math.round(trayFeedKg * 1000);
  
  // Tray status icons and colors
  const getTrayStatusDisplay = (status) => {
    const statusMap = {
      'empty': { icon: 'check', color: 'var(--success)', label: 'All Eaten', bg: '#e8f5e9' },
      'little': { icon: 'utensils', color: '#f59e0b', label: 'Little Left', bg: '#fef3c7' },
      'half': { icon: 'adjust', color: 'var(--warning)', label: 'Half Left', bg: '#fff3e0' },
      'too-much': { icon: 'exclamation-triangle', color: 'var(--danger)', label: 'Too Much', bg: '#ffebee' },
      'pending': { icon: 'clock', color: 'var(--gray)', label: 'Pending', bg: '#f5f5f5' }
    };
    return statusMap[status] || statusMap['pending'];
  };
  
  // Build tray results HTML
  let trayResultsHTML = '';
  if (lastRound.trayResults && lastRound.trayResults.length > 0) {
    trayResultsHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px; margin-top: 12px;">
        ${lastRound.trayResults.map((status, i) => {
          const display = getTrayStatusDisplay(status);
          return `
            <div style="background: ${display.bg}; border: 1px solid ${display.color}; border-radius: 8px; padding: 8px; text-align: center;">
              <div style="font-size: 10px; color: var(--gray); font-weight: 600; margin-bottom: 4px;">Tray ${i + 1}</div>
              <i class="fas fa-${display.icon}" style="font-size: 16px; color: ${display.color}; margin-bottom: 4px;"></i>
              <div style="font-size: 11px; color: ${display.color}; font-weight: 600;">${display.label}</div>
              <div style="font-size: 10px; color: var(--gray); margin-top: 2px;">${trayFeedGrams}g</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (lastRound.trayStatus && lastRound.trayStatus !== 'pending') {
    const display = getTrayStatusDisplay(lastRound.trayStatus);
    trayResultsHTML = `
      <div style="background: ${display.bg}; border: 1px solid ${display.color}; border-radius: 8px; padding: 12px; margin-top: 12px; display: flex; align-items: center; gap: 12px;">
        <i class="fas fa-${display.icon}" style="font-size: 24px; color: ${display.color};"></i>
        <div>
          <div style="font-size: 13px; font-weight: 600; color: ${display.color};">${display.label}</div>
          <div style="font-size: 11px; color: var(--gray); margin-top: 2px;">Overall tray status</div>
        </div>
      </div>
    `;
  } else {
    trayResultsHTML = `
      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin-top: 12px; display: flex; align-items: center; gap: 12px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 20px; color: #f59e0b;"></i>
        <div style="flex: 1;">
          <div style="font-size: 13px; font-weight: 600; color: #f59e0b;">Tray Status Not Updated</div>
          <div style="font-size: 11px; color: var(--gray); margin-top: 2px;">Update tray status to get next feed suggestion</div>
        </div>
        <button class="btn btn-sm btn-warning" onclick="app.openTrayCheckPopup('${tankId}', ${entry.id})" style="padding: 6px 12px; font-size: 12px; white-space: nowrap;">
          <i class="fas fa-edit"></i> Update
        </button>
      </div>
    `;
  }
  
  // Build supplements HTML
  let supplementsHTML = '';
  if (lastRound.supplements && lastRound.supplements.length > 0) {
    supplementsHTML = `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
        <div style="font-size: 11px; color: var(--gray); font-weight: 600; margin-bottom: 6px; text-transform: uppercase;">Supplements Used</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${lastRound.supplements.map(s => `
            <span style="background: #e3f2fd; color: #1565c0; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;">
              ${this.sanitizeHTML(s)}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  return `
    <div style="background: white; border: 2px solid #e3f2fd; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <div style="font-size: 12px; color: var(--primary); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Last Feed Round</div>
          <div style="font-size: 20px; font-weight: 800; color: var(--dark); margin-top: 4px;">Round ${lastRound.roundNumber}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 28px; font-weight: 800; color: var(--primary);">${entry.amount} <span style="font-size: 14px; color: var(--gray); font-weight: 600;">kg</span></div>
          <div style="font-size: 11px; color: var(--gray); margin-top: 2px;">${entry.time}</div>
        </div>
      </div>
      
      <div style="background: var(--light); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: var(--dark); margin-bottom: 8px;">Check Tray Details</div>
        ${trayResultsHTML}
      </div>
      
      ${supplementsHTML}
    </div>
  `;
}

// STRICT FEED ALGORITHM (Ticket: Save Feed Waste)

calculateStrictFeed(lastAmount, trayResult, doc) {
// Validate inputs to prevent NaN propagation
const amount = typeof lastAmount === 'number' && lastAmount > 0 ? lastAmount : 2.0; // Default to 2.0kg if invalid
const validTrayResult = typeof trayResult === 'string' ? trayResult.toLowerCase() : 'pending';
const validDoc = typeof doc === 'number' && doc >= 0 ? doc : 0;

let suggestion = amount;
let reason = "Maintain";
let color = "var(--info)";
// Strict Rules Matrix based on DOC & Tray Result
if (validTrayResult === 'empty') {
if (validDoc < 45) {
suggestion = amount * 1.08; // +8% Early Growth
reason = "Growth Phase (+8%)";
color = "var(--success)";
} else if (validDoc < 80) {
suggestion = amount * 1.04; // +4% Mid Growth
reason = "Standard (+4%)";
color = "var(--success)";
} else {
suggestion = amount * 1.02; // +2% Late Stage
reason = "Cautious (+2%)";
color = "var(--success)";
}
} else if (validTrayResult === 'little') {
if (validDoc < 60) {
suggestion = amount; // Keep same
reason = "Maintain";
color = "var(--info)";
} else {
suggestion = amount * 0.95; // -5%
reason = "Discipline (-5%)"; // Prevent sludge in later stages
color = "var(--warning)";
}
} else if (validTrayResult === 'half') {
suggestion = amount * 0.60; // -40% (Very strict)
reason = "Waste Cut (-40%)";
color = "var(--danger)";
} else if (validTrayResult === 'too-much') {
suggestion = amount * 0.30; // -70%
reason = "Severe Cut (-70%)";
color = "var(--danger)";
} else if (validTrayResult === 'blind-fed') {
suggestion = amount;
reason = "Transition from Blind Phase";
color = "var(--info)";
} else {
suggestion = amount;
reason = "Pending Check";
color = "var(--gray)";
}

// Ensure final amount is never NaN and never below reasonable minimum
const finalAmount = parseFloat(suggestion.toFixed(1));
return { amount: !isNaN(finalAmount) && finalAmount > 0 ? finalAmount : 2.0, reason, color };
}

// CHECK RECENT HEALTH ISSUES - Returns health issue info if found, null otherwise
checkRecentHealthIssues(tankId) {
const today = new Date();
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

// Check feed entries with logged mortality in last 24 hours
const recentFeedsWithMortality = (this.state.feedLogs || [])
.filter(e => e.tankId === tankId && e.mortality > 0)
.filter(e => {
  const entryDate = new Date(e.timestamp || 0);
  return entryDate >= yesterday;
});

if (recentFeedsWithMortality.length > 0) {
const totalMortality = recentFeedsWithMortality.reduce((sum, e) => sum + (e.mortality || 0), 0);
return {
  hasIssue: true,
  reason: `Health Alert: ${totalMortality} deaths reported (-15% feed)`,
  type: 'mortality',
  count: totalMortality
};
}

// Check disease logs in last 24 hours for this tank
const recentDiseases = (this.state.diseases || [])
.filter(d => d.tankId === tankId && d.outcome !== 'recovered')
.filter(d => {
  const noticeDate = new Date(d.dateNoticed);
  return noticeDate >= yesterday;
});

if (recentDiseases.length > 0) {
const diseaseNames = recentDiseases.map(d => d.diseaseName || d.diseaseType).join(', ');
return {
  hasIssue: true,
  reason: `⚠️ Active Disease Detected: ${diseaseNames} (-15% feed)`,
  type: 'disease',
  diseases: diseaseNames
};
}

return null; // No health issues
}

// NEW: Show Pending Modal
showPendingModal() {
const farmId = this.state.settings.farmId;
if (!farmId) return;

const farmTanks = this.state.tanks.filter(t => t.farmId === farmId);
const farmTankIds = farmTanks.map(t => t.id);
const pendingEntries = this.state.feedLogs.filter(e =>
farmTankIds.includes(e.tankId) && e.trayResult === 'pending'
);

// Workflow Improvement: If only 1 pending check, go directly to it
if (pendingEntries.length === 1) {
this.openTrayCheckPopup(pendingEntries[0].tankId, pendingEntries[0].id);
return;
}

const list = document.getElementById('pendingList');
list.innerHTML = '';

if (pendingEntries.length === 0) {
list.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle"></i><h3>No Pending Checks</h3><p>All tray checks have been completed.</p></div>`;
} else {
pendingEntries.forEach(entry => {
const tank = this.getTankById(entry.tankId);
const item = document.createElement('div');
item.className = 'pending-item';
item.innerHTML = `
<div class="pending-item-info">
<h4>${this.sanitizeHTML(tank.name)} (${tank.checkTrays || 2} trays)</h4>
<p>Fed ${entry.amount} kg @ ${entry.time}</p>
</div>
<button class="btn btn-primary btn-sm" onclick="app.openTrayCheckPopup('${entry.tankId}', ${entry.id})">
Update <i class="fas fa-arrow-right"></i>
</button>
`;
list.appendChild(item);
});
}
document.getElementById('pendingModal').classList.add('active');
}

// NEW: Open Tray Check Popup
openTrayCheckPopup(tankId, entryId) {
const tank = this.getTankById(tankId);
const entry = this.state.feedLogs.find(e => e.id === entryId);
if (!tank || !entry) return;

this.currentCheck = {
tankId,
entryId,
trays: Array(tank.checkTrays || 2).fill(null).map((_, i) => ({ trayId: i, status: null, observations: [] })),
activeTrayIndex: 0
};

    // Update header with tank and feed info
const feedTime = entry.time || '6:00 AM';
const feedAmount = entry.amount || 0;
const feedIndex = this.state.feedLogs.filter(e => e.tankId === tankId && e.date === entry.date).findIndex(e => e.id === entryId) + 1;
    const subtitleEl = document.getElementById('trayCheckSubtitle');
    if (subtitleEl) {
        const doc = this.getDaysOld(tank.stockingDate);
        const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
        let trayPhase = 'Tray Check';
        if (doc <= blindDuration && !tank.hasTransitionedFromBlind) trayPhase = 'Tray Training';
        else if (tank.hasTransitionedFromBlind) trayPhase = 'Tray Active';
        subtitleEl.textContent = `${this.sanitizeHTML(tank.name)} · Feed ${feedIndex} (${feedTime} · ${feedAmount} kg) · ${trayPhase} · ${tank.checkTrays || 2} trays`;
    }
this.renderTrayCheckTabs();

const saveBtn = document.getElementById('saveTrayResultsBtn');
if (saveBtn) {
saveBtn.disabled = true;
saveBtn.textContent = 'Select Status for All Trays';
}
this.closeAllModals();
const modal = document.getElementById('trayCheckModal');
if (modal) modal.classList.add('active');
}

renderTrayCheckTabs() {
const tabsContainer = document.getElementById('trayTabsContainer');
const body = document.getElementById('trayCheckBody');
if (!tabsContainer || !body) return;
tabsContainer.innerHTML = '';
body.innerHTML = '';
const entry = this.state.feedLogs.find(e => e.id === this.currentCheck.entryId);
const activeIndex = this.currentCheck.activeTrayIndex || 0;
const tray = this.currentCheck.trays[activeIndex];

// 1. Render Tray Tabs
this.currentCheck.trays.forEach((t, idx) => {
const isActive = idx === activeIndex;
const isDone = t.status !== null;
const tab = document.createElement('div');
tab.className = 'tray-tab';
if (isActive) tab.classList.add('active');
if (isDone && !isActive) tab.classList.add('done');
tab.textContent = `Tray ${idx + 1}`;
tab.onclick = () => this.switchTrayTab(idx);
tabsContainer.appendChild(tab);
});

// 2. Active Tray Content
const isSel = (s) => tray.status === s ? 'selected' : '';
const contentDiv = document.createElement('div');
contentDiv.innerHTML = `
<div class="section">
<h2 class="tray-section-title">Tray Status</h2>
<div class="tray-status-grid">
<div class="tray-status ok ${isSel('empty')}" onclick="app.selectTrayStatusNew(${activeIndex}, 'empty')">
✔<b>All Eaten</b>
</div>
<div class="tray-status little ${isSel('little')}" onclick="app.selectTrayStatusNew(${activeIndex}, 'little')">
●<b>Little Left</b>
</div>
<div class="tray-status half ${isSel('half')}" onclick="app.selectTrayStatusNew(${activeIndex}, 'half')">
◐<b>Half Left</b>
</div>
<div class="tray-status much ${isSel('too-much')}" onclick="app.selectTrayStatusNew(${activeIndex}, 'too-much')">
✖<b>Too Much</b>
</div>
</div>
</div>
<div class="section">
<h2 class="tray-section-title">Observations (Optional)</h2>
<div class="tray-obs-grid">
${['Red legs', 'White gut', 'Black gill', 'Soft shell', 'Weak movement', 'Moulting'].map(obs => `
<div class="tray-obs-tag ${tray.observations.includes(obs) ? 'selected' : ''}" onclick="app.toggleObservation(${activeIndex}, '${obs}', this)">${obs}</div>
`).join('')}
</div>
</div>
`;

body.appendChild(contentDiv);
// Update button text
const saveBtn = document.getElementById('saveTrayResultsBtn');
if (saveBtn) {
if (activeIndex < this.currentCheck.trays.length - 1) {
saveBtn.textContent = 'Save & Next Tray';
} else {
saveBtn.textContent = 'Save Tray Results';
}
}
}

switchTrayTab(index) {
this.currentCheck.activeTrayIndex = index;
this.renderTrayCheckTabs();
}

toggleObservation(trayIndex, observation, element) {
const tray = this.currentCheck.trays[trayIndex];
if (!tray) return;
const idx = tray.observations.indexOf(observation);
if (idx === -1) {
tray.observations.push(observation);
element.classList.add('selected');
} else {
tray.observations.splice(idx, 1);
element.classList.remove('selected');
}
}

selectTrayStatusNew(trayIndex, status) {
// Update state
this.currentCheck.trays[trayIndex].status = status;

// Re-render to update tabs
this.renderTrayCheckTabs();

// Validate
const allSelected = this.currentCheck.trays.every(t => t.status !== null);
const btn = document.getElementById('saveTrayResultsBtn');
if (btn) {
btn.disabled = !allSelected;
if (allSelected) {
if (trayIndex < this.currentCheck.trays.length - 1) {
btn.textContent = 'Save & Next Tray';
} else {
btn.textContent = 'Save Tray Results';
}
} else {
btn.textContent = 'Select Status for All Trays';
}
}
}

saveTrayResults() {
// Calculate worst case
const statusPriority = { 'empty': 0, 'little': 1, 'half': 2, 'too-much': 3 };
let worstStatus = 'empty';
this.currentCheck.trays.forEach(tray => {
if (statusPriority[tray.status] > statusPriority[worstStatus]) {
worstStatus = tray.status;
}
});

// Calculate suggestion using Strict Algorithm
const entry = this.state.feedLogs.find(e => e.id === this.currentCheck.entryId);
const tank = this.getTankById(this.currentCheck.tankId);
const doc = tank ? this.getDaysOld(tank.stockingDate) : 0;
const lastAmount = entry.amount;
const strictResult = this.calculateStrictFeed(lastAmount, worstStatus, doc);

this.currentCheck.finalResult = worstStatus;
this.currentCheck.suggestedFeed = strictResult.amount;

// Show Summary
const summary = document.getElementById('resultSummaryContent');
summary.innerHTML = `
<div class="result-summary">
<div class="result-badge">${worstStatus.toUpperCase().replace('-', ' ')}</div>
<p style="color: var(--gray-500); font-size: 14px;">Tray check results have been saved successfully.</p>
<div class="next-feed-suggestion">
<h3>Next Feed Suggestion</h3>
<div class="next-feed-amount">${strictResult.amount} kg</div>
<div class="next-feed-note">${strictResult.reason}</div>
</div>
<div style="background: var(--warning-light); border-left: 4px solid var(--warning); padding: 12px; border-radius: 8px; margin-top: 15px; font-size: 13px;">
<p style="margin: 0; color: var(--dark);"><strong>⚠️ Authority Rule:</strong> Farmer/Supervisor will set the final feed amount when logging. This is a suggestion based on tray response.</p>
</div>
</div>
`;

// Workflow Improvement: Check for next pending tank
const farmId = this.state.settings.farmId;
const farmTanks = this.state.tanks.filter(t => t.farmId === farmId);
const farmTankIds = farmTanks.map(t => t.id);
const otherPending = this.state.feedLogs.filter(e =>
farmTankIds.includes(e.tankId) && e.trayResult === 'pending' && e.id !== this.currentCheck.entryId
);

const confirmBtn = document.querySelector('#resultModal .btn-primary');
if (otherPending.length > 0) {
confirmBtn.innerHTML = `<i class="fas fa-arrow-right"></i> Save & Next (${otherPending.length} left)`;
} else {
confirmBtn.innerHTML = `<i class="fas fa-check-circle"></i> Confirm & Finish`;
}

this.closeAllModals();
document.getElementById('resultModal').classList.add('active');
}

    confirmAndFinish() {
        const entry = this.state.feedLogs.find(e => e.id === this.currentCheck.entryId);
        if (entry) {
            entry.trayResult = this.currentCheck.finalResult;
            entry.trayResults = this.currentCheck.trays.map(t => t.status);
            entry.trayObservations = this.currentCheck.trays.map(t => t.observations);
            
            // ===== TRAY MODE: Save decision for next round =====
            // This is critical for per-round workflow
            const suggestedKg = parseFloat(this.currentCheck.suggestedFeed);
            entry.decisionKgForNextRound = suggestedKg;
            
            this.saveFeedEntry(entry);
            
            // Also update tank's nextSuggestedFeed for backward compatibility
            const tank = this.getTankById(this.currentCheck.tankId);
            if (tank) {
                tank.nextSuggestedFeed = suggestedKg;
                this.saveTanks();
            }
        }
        // Updated workflow: handle ONE feed's tray results at a time.
        // Do not auto-open the next tank/entry; farmer will choose the next pending tray manually.
        this.closeAllModals();
        this.renderAll();
        this.showToast('Tray results saved. Next feed amount set.', 'success');
    }

applySuggestion(entryId, suggestedAmount) {
const entry = this.state.feedLogs.find(e => e.id === entryId);
if (!entry) return;

const tank = this.getTankById(entry.tankId);
if (!tank) return;

tank.nextSuggestedFeed = suggestedAmount;
this.saveTanks();

this.showToast(`Suggestion of ${suggestedAmount}kg applied for ${this.sanitizeHTML(tank.name)}`);

const suggDiv = document.getElementById(`next-feed-sugg-${entryId}`);
if (suggDiv) {
const btn = suggDiv.querySelector('button');
if (btn) {
btn.innerHTML = '<i class="fas fa-check"></i> Applied';
btn.className = 'btn btn-sm btn-success';
btn.disabled = true;
}
}
}

// ❗ AUTHORITY RULE: Farmer/Supervisor sets the final feed amount
// Worker executes exactly as set. The amount entered here becomes the FINAL FEED.
// In TRAY MODE: Planned kg shown (from previous decision), farmer confirms
// In BLIND MODE: Plan is shown but farmer can adjust if needed
// One pond at a time to avoid mistakes with wrong tanks
async saveLogFeed() {
const tankId = document.getElementById('logFeedTankSelect').value;
const amount = parseFloat(document.getElementById('logFeedAmount').value);
const reason = document.getElementById('logFeedReason').value;
const supplements = Array.from(document.querySelectorAll('#logFeedSupplements .supplement-option.selected'))
.map(el => el.textContent.trim());

// Prevent double submission
const saveBtn = document.querySelector('#feedRoundModal .btn-primary');
if (saveBtn && saveBtn.disabled) return; // Already saving
if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

try {
// Validate tank selection
if (!tankId) {
this.showToast('Please select a tank', 'error');
return;
}

// ===== TRAY MODE STATE VALIDATION =====
const tank = this.getTankById(tankId);
const doc = tank ? this.getDaysOld(tank.stockingDate) : 0;
const blindDuration = (tank && tank.blindDuration) || this.state.settings.blindFeedingDuration || 30;
const isTrayMode = doc > blindDuration && tank.hasTransitionedFromBlind;

if (isTrayMode) {
  // Check if feed can be logged in current state
  const stateCheck = this.canLogFeedNow(tankId);
  if (!stateCheck.canLog) {
    this.showToast(`Cannot log feed: ${stateCheck.reason}`, 'error', 5000);
    return;
  }
}

// Validate feed amount
if (isNaN(amount) || amount <= 0 || amount > 1000) {
this.showToast('Feed amount must be between 0.01 and 1000 kg', 'error');
return;
}

// Validate reason if provided
if (reason && reason.trim().length > 500) {
this.showToast('Reason must be less than 500 characters', 'error');
return;
}

// Read health/mortality inputs
const healthObserved = document.getElementById('logHealthObserved') ? document.getElementById('logHealthObserved').checked : false;
let mortality = 0;
let diseaseType = null;
if (healthObserved) {
  mortality = parseInt(document.getElementById('logMortalityCount')?.value || 0, 10) || 0;
  if (mortality < 0) mortality = 0;
  diseaseType = document.getElementById('logDiseaseType') ? document.getElementById('logDiseaseType').value || null : null;
}

// Check for feed jump (>20% increase)
// Check for feed jump (>20% increase)
const tankEntries = this.state.feedLogs.filter(e => e.tankId === tankId).sort((a, b) => b.id - a.id);
const lastEntry = tankEntries[0];
if (lastEntry && lastEntry.amount > 0) {
const increase = (amount - lastEntry.amount) / lastEntry.amount;
if (increase > 0.20) {
const proceedIncrease = await this.showConfirmModal(
`High Feed Increase\n\n${lastEntry.amount}kg → ${amount}kg (+${Math.round(increase * 100)}%)\n\nProceed?`,
'Confirm Action',
'Yes, Proceed',
'Cancel'
);
if (!proceedIncrease) return;
}
}

const currentStock = this.state.inventory.totalKg || 0;
if (amount > currentStock) {
// BUG FIX: Changed from blocking confirmation to warning toast - allow users to log feed even with low inventory
this.showToast(`⚠ Low Inventory: You have ${currentStock.toFixed(1)}kg in stock, feeding ${amount.toFixed(1)}kg.`, 'warning', 4000);
}

// Check if this is the first tray-based feed after blind transition
const isFirstTrayFeed = tank && tank.hasTransitionedFromBlind &&
!this.state.feedLogs.some(e => e.tankId === tankId && e.trayResult && e.trayResult !== 'blind-fed' && e.trayResult !== 'pending');

// Allow modal to override target date if we've moved to next day suggestion
const feedModalEl = document.getElementById('feedRoundModal');
const targetDateAttr = feedModalEl ? feedModalEl.getAttribute('data-target-date') : null;
const entryDate = targetDateAttr || this.currentDate;

const feedRoundNumber = this.getFeedRoundNumber(tankId, entryDate);
const feedingMode = doc <= blindDuration && !tank.hasTransitionedFromBlind ? 'BLIND' : 'TRAY';
const isExtraFeed = this.areAllRoundsCompleted(tankId, entryDate);

const previousInventory = this.state.inventory.totalKg || 0;
const newEntry = {
// COST-LOCKED V1: Minimal required fields only
id: Date.now(),
farmId: this.state.settings.farmId,
pondId: tankId, // Renamed from tankId for cost lock
doc: this.getDaysOld(tank.stockingDate),
round: feedRoundNumber,
feedKg: amount,
createdBy: this.userId,
createdAt: new Date().toISOString(),
// Legacy fields for migration compatibility
date: entryDate,
time: new Date().toLocaleTimeString(),
amount,
trayResult: feedingMode === 'BLIND' ? 'blind-fed' : 'pending',
supplements,
reason: reason || null,
healthObserved: !!healthObserved,
mortality: mortality || 0,
disease: diseaseType || null,
feed_round_number: feedRoundNumber,
feeding_mode: feedingMode,
is_extra_feed: isExtraFeed
};

this.state.feedLogs.push(newEntry);

// BUG #3 FIX: Validate inventory won't go negative before deducting
const newInventoryTotal = previousInventory - amount;
if (newInventoryTotal < 0) {
    this.state.feedLogs.pop(); // Remove the entry we just added
    this.showToast(`Cannot log ${amount}kg. Insufficient inventory. Current: ${previousInventory.toFixed(1)}kg`, 'error');
    return;
}

this.state.inventory.totalKg = newInventoryTotal;

    try {
        // Batch write: feedLogs document + farmDaily summary
        const batch = this.db.batch();
        
        // Add feed log
        const feedLogRef = this.db.collection('feedLogs').doc(String(newEntry.id));
        batch.set(feedLogRef, {
            farmId: newEntry.farmId,
            pondId: newEntry.pondId,
            doc: newEntry.doc,
            round: newEntry.round,
            feedKg: newEntry.feedKg,
            createdBy: newEntry.createdBy,
            createdAt: newEntry.createdAt
        });
        
        // Update farm daily summary
        const farmDailyId = `${newEntry.farmId}_${entryDate.replace(/-/g, '_')}`;
        const farmDailyRef = this.db.collection('farmDaily').doc(farmDailyId);
        
        // Get current daily data or create new
        const todayLogs = this.state.feedLogs.filter(e => e.date === entryDate);
        const totalFeedKg = todayLogs.reduce((sum, e) => sum + (e.feedKg || e.amount || 0), 0);
        const roundsDone = new Set(todayLogs.map(e => `${e.pondId || e.tankId}_${e.round || e.feed_round_number}`)).size;
        
        batch.set(farmDailyRef, {
            totalFeedKg,
            roundsDone,
            lastFeedKg: newEntry.feedKg,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        // Commit batch
        await batch.commit();
        
        // Update local state
        this.state.feedLogs.push(newEntry);
        await this.saveInventory();
        this.recalculateTankBiomass(tankId, true);
        this.updateTankLifecycleState(tankId);
        this.renderAll();

        // If modal had a target-date (we were logging next-day), clear it now
        try {
          const feedModalEl = document.getElementById('feedRoundModal');
          if (feedModalEl && feedModalEl.hasAttribute('data-target-date')) {
            feedModalEl.removeAttribute('data-target-date');
          }
        } catch (e) {
          // ignore
        }

        // Close log feed modal first
        this.closeAllModals();

    // If health reported, reduce next suggested feed by 15%
    if (healthObserved) {
      try {
        const tankObj = this.getTankById(tankId);
        if (tankObj) {
          const baseForNext = (tankObj.nextSuggestedFeed && typeof tankObj.nextSuggestedFeed === 'number') ? tankObj.nextSuggestedFeed : amount;
          tankObj.nextSuggestedFeed = parseFloat((baseForNext * 0.85).toFixed(1));
          await this.saveTanks();
          this.showToast('Health noted — next feed auto-reduced by 15%', 'info');
        }
      } catch (e) {
        console.error('Failed to apply health-based suggestion:', e);
      }
    }
        // If this is the first tray-based feed after transition, DO NOT force-open tray check.
        // Farmers usually check trays 1.5–2 hours later in real farms.
        // Instead, show a gentle reminder and let them use the normal "Check Trays" flow when ready.
        if (isFirstTrayFeed) {
            this.showToast('📋 Feed saved. Remember to check trays in ~2 hours and update results.', 'info', 5000);
            // Track feed logging with first_tray_feed flag
            this.trackEvent('log_feed', {
                pond_id: tankId,
                amount: amount,
                doc: this.getDaysOld(tank?.stockingDate),
                first_tray_feed: true
            });
            // Do NOT return – allow normal next-pond / success flow below
        }

        // Check if all feeds for this tank are completed for today
        const feedsPerDay = this.state.settings.feedsPerDay || 4;
        const todayEntries = this.state.feedLogs.filter(e => 
            e.tankId === tankId && e.date === this.currentDate
        );
        const completedFeeds = todayEntries.length;
        
        if (completedFeeds >= feedsPerDay) {
            // All feeds completed for this tank today
            const tankName = tank?.name || 'Tank';
            this.showAlertModal(
                `🎉 All ${feedsPerDay} feed rounds completed for ${tankName}!\n\nGreat work today. See you tomorrow! 🌅`,
                '✅ Daily Feeding Complete'
            );
            this.showToast(`${tankName}: All feeds done for today!`, 'success', 4000);
            return;
        }

        this.showToast('Feed logged successfully');

        this.trackEvent('log_feed', {
            pond_id: tankId,
            amount: amount,
            doc: this.getDaysOld(tank?.stockingDate)
        });

        this.detectFeedJump(tankId, amount);
    } catch (e) {
        console.error('Failed to log feed:', e);
        // ROLLBACK STATE ON FAILURE
        this.state.feedLogs.pop();
        this.state.inventory.totalKg = previousInventory;
        this.recalculateTankBiomass(tankId, true); 
        this.renderAll();
        this.showToast('Failed to save feed log', 'error');
    }
} finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-check"></i> Save Feed'; }
}
}

skipFeed(tankId) {

this.showConfirmModal('Skip this feed? It will be recorded as 0kg.', 'Skip Feed').then(confirmed => {
if (confirmed) {
const newEntry = {
id: Date.now(),
tankId,
date: this.currentDate,
time: new Date().toLocaleTimeString(),
amount: 0,
trayResult: 'skipped',
supplements: []
};
this.state.feedLogs.push(newEntry);
this.saveFeedEntry(newEntry);
this.renderAll();
this.showToast('Feed skipped');
}
});
}

quickLogFeed(tankId, amount) {

(async () => {
const tank = this.getTankById(tankId);
const doc = this.getDaysOld(tank.stockingDate);
const blindDuration = this.state.settings.blindFeedingDuration || 30;
const isTrayMode = doc > blindDuration || tank.hasTransitionedFromBlind;

// HARD LOCK: Check if previous round for today has pending tray status (Tray Mode only)
if (isTrayMode) {
    const todayEntries = this.state.feedLogs.filter(e => 
        e.tankId === tankId && e.date === this.currentDate
    ).sort((a, b) => a.id - b.id);

    if (todayEntries.length > 0) {
        const lastEntry = todayEntries[todayEntries.length - 1];
        if (lastEntry.trayResult === 'pending') {
            this.showToast('⚠️ Locked: Complete previous tray check first.', 'error');
            return;
        }
    }
}

const currentStock = this.state.inventory.totalKg || 0;
if (amount > currentStock) {
// BUG FIX: Changed from blocking confirmation to warning toast - allow users to log feed even with low inventory
this.showToast(`⚠ Low Inventory: You have ${currentStock.toFixed(1)}kg in stock, feeding ${amount.toFixed(1)}kg.`, 'warning', 4000);
}

const feedRoundNumber = this.getFeedRoundNumber(tankId, this.currentDate);
const feedingMode = doc <= blindDuration && !tank.hasTransitionedFromBlind ? 'BLIND' : 'TRAY';
const isExtraFeed = this.areAllRoundsCompleted(tankId, this.currentDate);

const newEntry = {
id: Date.now(),
tankId,
date: this.currentDate,
time: new Date().toLocaleTimeString(),
amount,
trayResult: doc <= blindDuration ? 'blind-fed' : 'pending', // Smart status: 'pending' for active tanks
supplements: [],
feed_round_number: feedRoundNumber,
feeding_mode: feedingMode,
is_extra_feed: isExtraFeed
};

this.state.feedLogs.push(newEntry);

// BUG #3 FIX: Validate inventory won't go negative before deducting
const currentInventory = this.state.inventory.totalKg || 0;
const newInventoryTotal = currentInventory - amount;
if (newInventoryTotal < 0) {
    this.state.feedLogs.pop(); // Remove the entry we just added
    this.showToast(`Cannot feed ${amount}kg. Insufficient inventory. Current: ${currentInventory.toFixed(1)}kg`, 'error');
    return;
}

this.state.inventory.totalKg = newInventoryTotal;

// BUG #2 FIX: Use async save with proper sequencing
try {
    await this.saveFeedEntry(newEntry);
    await this.saveInventory();
    this.recalculateTankBiomass(tankId, true); // Clear suggestion on log
    this.updateTankLifecycleState(tankId);
    this.renderAll();
    
    // Show appropriate toast based on whether this is extra feed
    if (isExtraFeed) {
        this.showToast(`⚠️ Extra feed logged: ${amount}kg to ${this.sanitizeHTML(tank.name)}. This may impact FCR.`, 'warning');
    } else {
        this.showToast(`Fed ${amount}kg to ${this.sanitizeHTML(tank.name)}`);
    }
} catch (e) {
    console.error('Failed to quick log feed:', e);
    this.showToast('Failed to save feed log', 'error');
}
})();
}

quickLogBlindFeed(tankId, amount, feedIndex) {
// Quick log for blind feed mode - similar to quickLogFeed but simpler
(async () => {
const tank = this.getTankById(tankId);
if (!tank) return;

const doc = this.getDaysOld(tank.stockingDate);
const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;

// Check inventory
const currentStock = this.state.inventory.totalKg || 0;
if (amount > currentStock) {
this.showToast(`⚠ Low Inventory: You have ${currentStock.toFixed(1)}kg in stock, feeding ${amount.toFixed(1)}kg.`, 'warning', 4000);
}

const feedRoundNumber = feedIndex + 1;
const todayEntries = this.state.feedLogs.filter(e => e.tankId === tankId && e.date === this.currentDate);
const isExtraFeed = todayEntries.length >= (tank.blindSchedule ? tank.blindSchedule.find(s => s.doc === (doc === 0 ? 1 : doc))?.feeds?.length || 4 : 4);

const newEntry = {
id: Date.now(),
tankId,
date: this.currentDate,
time: new Date().toLocaleTimeString(),
amount,
trayResult: 'blind-fed',
supplements: [],
feed_round_number: feedRoundNumber,
feeding_mode: 'BLIND',
is_extra_feed: isExtraFeed
};

this.state.feedLogs.push(newEntry);

// Validate inventory won't go negative before deducting
const currentInventory = this.state.inventory.totalKg || 0;
const newInventoryTotal = currentInventory - amount;
if (newInventoryTotal < 0) {
this.state.feedLogs.pop();
this.showToast(`Cannot feed ${amount}kg. Insufficient inventory. Current: ${currentInventory.toFixed(1)}kg`, 'error');
return;
}

this.state.inventory.totalKg = newInventoryTotal;

try {
await this.saveFeedEntry(newEntry);
await this.saveInventory();
this.recalculateTankBiomass(tankId, true);
this.updateTankLifecycleState(tankId);
this.renderAll();

if (isExtraFeed) {
this.showToast(`⚠️ Extra feed logged: ${amount}kg to ${this.sanitizeHTML(tank.name)}. This may impact FCR.`, 'warning');
} else {
this.showToast(`✓ Feed ${feedRoundNumber} logged: ${amount}kg to ${this.sanitizeHTML(tank.name)}`);
}
} catch (e) {
console.error('Failed to quick log blind feed:', e);
this.showToast('Failed to save feed log', 'error');
}
})();
}

recalculateTankBiomass(tankId, clearSuggestion = false) {
const tank = this.getTankById(tankId);
if (!tank) return;

if (clearSuggestion) {
tank.nextSuggestedFeed = null;
}


const entries = this.state.feedLogs.filter(e => e.tankId === tankId);
// Validate each feed entry amount before summing
const totalFeed = entries.reduce((sum, e) => {
const amount = typeof e.amount === 'number' && e.amount >= 0 ? e.amount : 0;
return sum + amount;
}, 0);

const tankHarvests = this.state.harvests.filter(h => h.tankId === tankId);
// Validate each harvest weight before summing
const totalHarvested = tankHarvests.reduce((sum, h) => {
const weight = typeof h.weight === 'number' && h.weight >= 0 ? h.weight : 0;
return sum + weight;
}, 0);

// Validate calculated values before using in FCR calculation
if (isNaN(totalFeed) || totalFeed < 0 || isNaN(totalHarvested) || totalHarvested < 0) {
// Log error but continue with safe defaults
console.warn(`Invalid biomass data for tank ${tankId}: feed=${totalFeed}, harvested=${totalHarvested}`);
tank.biomass = 0;
this.saveTanks();
return;
}

const estimatedFCR = 1.2;
const biomassBefore = (totalFeed / estimatedFCR) - totalHarvested;
// Ensure biomass is never negative and is a valid number
const calculatedBiomass = !isNaN(biomassBefore) ? biomassBefore : 0;
tank.biomass = Math.max(0, parseFloat(calculatedBiomass.toFixed(1)));
this.saveTank(tank);
}

openFeedSchedule(tankId) {
const tank = this.getTankById(tankId);
if (!tank || !tank.blindSchedule) {
this.showToast('No schedule available for this tank', 'error');
return;
}
const duration = this.state.settings.blindFeedingDuration || 30;
const titleEl = document.getElementById('blindScheduleTitle');
if (titleEl) titleEl.textContent = `Blind Feeding Phase (DOC 1-${duration})`;

this.editingScheduleTankId = tankId;
const list = document.getElementById('feedScheduleList');
const thead = document.querySelector('.schedule-table thead tr');
list.innerHTML = '';

// Determine current configuration from schedule
const currentDuration = tank.blindSchedule ? tank.blindSchedule.length : 30;
// Find max feeds count in schedule to determine columns
let maxFeeds = 0;
if (tank.blindSchedule) {
tank.blindSchedule.forEach(item => {
if (item.feeds && item.feeds.length > maxFeeds) maxFeeds = item.feeds.length;
});
}
const feedsCount = maxFeeds || (this.state.settings.feedsPerDay || 4);


// Update Header
let headerHTML = `<th>DOC</th><th>Date</th>`;
for(let i=0; i<feedsCount; i++) {
headerHTML += `<th>Feed ${i+1}</th>`;
}
headerHTML += `<th>Total (kg)</th>`;
thead.innerHTML = headerHTML;

const stockingDate = new Date(tank.stockingDate);
tank.blindSchedule.forEach((item, index) => {
const date = new Date(stockingDate);
date.setDate(date.getDate() + (item.doc - 1));
const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
// Polyfill feeds array if missing
if (!item.feeds) {
const perFeed = parseFloat((item.amount / feedsCount).toFixed(2)); // Use max feeds for polyfill
item.feeds = Array(feedsCount).fill(perFeed);
}

let feedsInputs = '';
// Render inputs up to feedsCount. If item has fewer feeds, pad with empty or 0?
// For simplicity, we assume uniform feeds per day for now, or we iterate up to feedsCount
for (let fIdx = 0; fIdx < feedsCount; fIdx++) {
const amt = item.feeds[fIdx] !== undefined ? item.feeds[fIdx] : 0;
feedsInputs += `<td><input type="number" class="schedule-input" value="${amt}" step="0.01" id="sched-amount-${index}-${fIdx}" style="width: 50px;"></td>`;
}

const manualIndicator = item.status === 'manual'
? ` <i class="fas fa-undo" style="color: var(--warning-dark); font-size: 10px; cursor: pointer;" title="Manually Edited - Click to Reset" onclick="app.resetScheduleRow(${index})"></i>`
: '';

const row = document.createElement('tr');
if (item.status === 'manual') {
row.style.background = '#fff3e0';
}
row.innerHTML = `
<td>${item.doc}${manualIndicator}</td>
<td>${dateStr}</td>
${feedsInputs}
<td style="font-weight:bold;">${item.amount.toFixed(2)}</td>
`;
list.appendChild(row);
});
document.getElementById('feedScheduleModal').classList.add('active');
}

saveFeedSchedule() {
if (!this.editingScheduleTankId) return;
const tank = this.getTankById(this.editingScheduleTankId);
if (!tank) return;
// We need to know how many columns were rendered.
// We can infer this from the table header count minus 3 (DOC, Date, Total)
const headerCells = document.querySelectorAll('.schedule-table thead th');
const feedsCount = Math.max(1, headerCells.length - 3);

tank.blindSchedule.forEach((item, index) => {
let total = 0;
const newFeeds = [];
let changed = false;

for(let i=0; i<feedsCount; i++) {
const input = document.getElementById(`sched-amount-${index}-${i}`);
if (input) {
const val = parseFloat(input.value) || 0;
newFeeds.push(val);
total += val;
if (val !== item.feeds[i]) changed = true;
}
}

if (changed) {
item.feeds = newFeeds;
item.amount = parseFloat(total.toFixed(2));
item.status = 'manual';
}
});
this.saveTanks();
this.closeAllModals();
this.showToast('Schedule updated successfully');
}

regenerateSchedule() {
if (!this.editingScheduleTankId) return;
const tank = this.getTankById(this.editingScheduleTankId);
if (!tank) return;
const duration = tank.blindDuration || 30;
const week1Freq = tank.blindWeek1 || 2;
const stdFreq = tank.blindStd || 4;


this.showConfirmModal('Reset schedule to defaults? Manual edits will be preserved.', 'Reset Schedule').then(confirmed => {
if (confirmed) {
const newSchedule = this.generateBlindFeedingSchedule(tank.initialSeed, tank.stockingDate, duration, week1Freq, stdFreq);
// Merge existing manual entries
if (tank.blindSchedule) {
newSchedule.forEach((newItem, i) => {
const existing = tank.blindSchedule.find(e => e.doc === newItem.doc);
if (existing && existing.status === 'manual') {
newSchedule[i] = existing;
}
});
}

tank.blindSchedule = newSchedule;
this.saveTanks();
this.openFeedSchedule(this.editingScheduleTankId);
this.showToast('Schedule regenerated');
}
});
}

resetScheduleRow(index) {
if (!this.editingScheduleTankId) return;
const tank = this.getTankById(this.editingScheduleTankId);
if (!tank || !tank.blindSchedule[index]) return;
const item = tank.blindSchedule[index];
const duration = Math.max(tank.blindDuration || 30, item.doc);
const week1Freq = tank.blindWeek1 || 2;
const stdFreq = tank.blindStd || 4;
const tempSchedule = this.generateBlindFeedingSchedule(tank.initialSeed, tank.stockingDate, duration, week1Freq, stdFreq);
const freshItem = tempSchedule.find(i => i.doc === item.doc);
if (freshItem) {
tank.blindSchedule[index] = freshItem;
this.saveTanks();
this.openFeedSchedule(this.editingScheduleTankId);
this.showToast('Row reset to auto');
}
}

checkBlindFeedingTransitions() {
if (document.querySelector('.modal-overlay.active')) return;

const currentFarmId = this.state.settings.currentFarmId;
if (!currentFarmId) return;

const tanks = this.state.tanks.filter(t => t.farmId === currentFarmId && t.status === 'active');

for (const tank of tanks) {
const doc = this.getDaysOld(tank.stockingDate);
const duration = tank.blindDuration || 30;
// Trigger modal if DOC is past blind duration and tank hasn't been transitioned yet
if (doc > duration && !tank.hasTransitionedFromBlind) {
this.openBlindTransitionModal(tank);
break; // Show one at a time
}
}
}

openBlindTransitionModal(tank) {
this.transitionTankId = tank.id;
const doc = this.getDaysOld(tank.stockingDate);
document.getElementById('blindTransitionText').innerHTML = `
<div style="text-align: center; margin-bottom: 20px;">
<div style="font-size: 48px; margin-bottom: 10px;">🍽️</div>
<h3 style="margin: 0 0 10px 0; color: var(--dark);">Ready for Tray-Based Feeding</h3>
<p style="color: var(--gray); margin: 0;">${this.sanitizeHTML(tank.name)} • DOC ${doc}</p>
</div>
<div style="background: var(--warning-light); border-left: 4px solid var(--warning); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
<p style="margin: 0 0 10px 0; font-weight: 600; color: var(--dark);">You are moving from Blind Feeding to Tray-Based Feeding.</p>
<p style="margin: 0; color: var(--gray); font-size: 14px;">Feed suggestions will now depend on tray response instead of the pre-set schedule.</p>
</div>
<div style="background: var(--info-light); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
<h4 style="margin: 0 0 10px 0; font-size: 14px; color: var(--dark);">What changes:</h4>
<ul style="margin: 0; padding-left: 20px; color: var(--gray); font-size: 13px; line-height: 1.8;">
<li>Tray checks required after each feed</li>
<li>Feed amounts adjust based on tray status</li>
<li>Blind schedule will be frozen</li>
<li>More precise feeding control</li>
</ul>
</div>
`;
document.getElementById('blindTransitionModal').classList.add('active');
}

ignoreBlindTransition() {
if (this.transitionTankId) {
// This will only ignore for the current session. A page refresh will show the prompt again.
this.ignoredBlindTransitions.add(this.transitionTankId);
}
this.closeAllModals();
}

confirmBlindTransition() {
if (this.transitionTankId) {
const tank = this.getTankById(this.transitionTankId);
if (tank) {
tank.hasTransitionedFromBlind = true;
this.saveTanks();
// Close transition modal first
this.closeAllModals();
// Show success message
this.showToast(`${this.sanitizeHTML(tank.name)} switched to tray-based feeding!`, 'success');
// Automatically open log feed modal for this tank
// This provides smooth workflow: transition → log first feed with tray check
setTimeout(() => {
this.openLogFeedModal(this.transitionTankId, null, null, true);
this.showToast(`📋 Tray check now required for ${this.sanitizeHTML(tank.name)}`, 'info', 5000);
}, 400);
}
}
this.renderAll();
}

openTankDetail(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

this.editingTankId = tankId;

document.getElementById('tankDetailTitle').textContent = this.sanitizeHTML(tank.name) || 'Tank Details';

const tabContainer = document.getElementById('tankDetailTabContainer');
let tabsHTML = `<div class="tank-detail-tabs">`;
tabsHTML += `<div class="tank-detail-tab active" onclick="app.switchTankDetailTab('${tankId}', 'overview')">Overview</div>`
tabsHTML += `<div class="tank-detail-tab" onclick="app.switchTankDetailTab('${tankId}', 'logs')">Logs</div>`;
tabsHTML += `<div class="tank-detail-tab" onclick="app.switchTankDetailTab('${tankId}', 'analytics')">Analytics</div>`;
tabsHTML += `<div class="tank-detail-tab" onclick="app.switchTankDetailTab('${tankId}', 'actions')">Actions</div>`
tabsHTML += `<div class="tank-detail-tab" onclick="app.switchTankDetailTab('${tankId}', 'settings')">Settings</div>`;
tabsHTML += `</div>`;
tabContainer.innerHTML = tabsHTML;

// Default to first visible tab
const firstTab = tabContainer.querySelector('.tank-detail-tab').textContent.toLowerCase();
this.switchTankDetailTab(tankId, firstTab);

document.getElementById('tankDetailModal').classList.add('active');
}

switchTankDetailTab(tankId, tabName) {
const tank = this.getTankById(tankId);
if (!tank) return;

// Clean up analytics charts when switching away from analytics tab
if (this.charts.tankGrowth) {
this.charts.tankGrowth.destroy();
delete this.charts.tankGrowth;
}
if (this.charts.tankFCR) {
this.charts.tankFCR.destroy();
delete this.charts.tankFCR;
}

// Update active tab
const tabContainer = document.getElementById('tankDetailTabContainer');
tabContainer.querySelectorAll('.tank-detail-tab').forEach(tab => {
if (tab.textContent.toLowerCase() === tabName) {
tab.classList.add('active');
} else {
tab.classList.remove('active');
}
});

const content = document.getElementById('tankDetailContent');
const footer = document.getElementById('tankDetailFooter');
content.innerHTML = '';
footer.innerHTML = '';
footer.style.display = 'none';

if (tabName === 'overview') {
this.renderTankDetailOverview(tank, content);
} else if (tabName === 'analytics') {
this.renderTankDetailAnalytics(tank, content);
} else if (tabName === 'logs') {
this.renderTankDetailLogs(tank, content);
} else if (tabName === 'actions') {
this.renderTankDetailActions(tank, content);
} else if (tabName === 'settings') {
this.renderTankDetailEdit(tankId);
}
}

renderTankDetailOverview(tank, container) {
const entries = this.state.feedLogs.filter(e => e.tankId == tank.id);
const totalFeed = entries.reduce((sum, e) => sum + e.amount, 0);
const todayFeed = entries.filter(e => e.date === this.currentDate).reduce((sum, e) => sum + e.amount, 0);
const doc = this.getDaysOld(tank.stockingDate);
const tankHarvests = this.state.harvests.filter(h => h.tankId === tank.id);
const totalHarvested = tankHarvests.reduce((sum, h) => sum + h.weight, 0);
const totalProduction = (tank.biomass || 0) + totalHarvested;
    const estimatedFCR = totalProduction > 0 ? (totalFeed / totalProduction).toFixed(2) : '0.00';

    // LIFECYCLE STATE INFO
    const lifecycleState = tank.lifecycleState || this.calculateLifecycleState(tank);
    const lifecycleInfo = this.getLifecycleStateInfo(lifecycleState);

    // Simple phase + tray mode text for context
    let phaseLabel = '';
    if (doc <= 3) phaseLabel = 'Phase 1 · Stocking';
    else if (doc <= 15) phaseLabel = 'Phase 2 · Stabilisation';
    else if (doc <= 30) phaseLabel = 'Phase 3 · Biomass';

    const blindDuration = tank.blindDuration || this.state.settings.blindFeedingDuration || 30;
    let trayPhase = '';
    if (doc <= blindDuration && !tank.hasTransitionedFromBlind) trayPhase = 'Blind Feed Mode';
    else if (doc > blindDuration && !tank.hasTransitionedFromBlind) trayPhase = 'Tray Training';
    else if (tank.hasTransitionedFromBlind) trayPhase = 'Tray Active';

// Latest water quality
const waterEntries = this.state.waterQuality.filter(w => w.tankId === tank.id).sort((a, b) => new Date(b.date) - new Date(a.date));
const lastWater = waterEntries[0];
let waterHTML = `<div class="text-muted text-center" style="padding: 20px 0;">No water quality logs.</div>`;
if (lastWater) {
waterHTML = `
<div class="tank-summary-card" style="border-left: 4px solid var(--info);">
<div class="tank-summary-header" style="margin-bottom: 8px;">
<div class="tank-summary-name" style="font-size: 14px;">Latest Water Quality</div>
<div style="font-size: 11px; color: var(--gray);">${new Date(lastWater.date).toLocaleDateString()}</div>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 8px; text-align: center;">
<div><div class="tank-summary-label">pH</div><div class="tank-summary-value">${lastWater.ph !== null ? lastWater.ph : '-'}</div></div>
<div><div class="tank-summary-label">Salinity</div><div class="tank-summary-value">${lastWater.salinity !== null ? lastWater.salinity : '-'}</div></div>
<div><div class="tank-summary-label">D.O.</div><div class="tank-summary-value">${lastWater.do !== null ? lastWater.do : '-'}</div></div>
<div><div class="tank-summary-label">Alkalinity</div><div class="tank-summary-value">${lastWater.alkalinity !== null ? lastWater.alkalinity : '-'}</div></div>
<div><div class="tank-summary-label" style="color: ${lastWater.ammonia > 0.25 ? 'var(--danger)' : 'var(--dark)'};">Ammonia</div><div class="tank-summary-value" style="color: ${lastWater.ammonia > 0.25 ? 'var(--danger)' : 'var(--dark)'};">${lastWater.ammonia !== null ? lastWater.ammonia : '-'}</div></div>
<div><div class="tank-summary-label" style="color: ${lastWater.nitrite > 0.2 ? 'var(--danger)' : 'var(--dark)'};">Nitrite</div><div class="tank-summary-value" style="color: ${lastWater.nitrite > 0.2 ? 'var(--danger)' : 'var(--dark)'};">${lastWater.nitrite !== null ? lastWater.nitrite : '-'}</div></div>
</div>
</div>
`;
}

// Latest application
const appEntries = (this.state.applications || []).filter(a => a.tankId === tank.id).sort((a, b) => new Date(b.date) - new Date(a.date));
const lastApp = appEntries[0];
let appHTML = `<div class="text-muted text-center" style="padding: 20px 0;">No applications logged.</div>`;
if (lastApp) {
appHTML = `
<div class="tank-summary-card" style="border-left: 4px solid var(--warning);">
<div class="tank-summary-header" style="margin-bottom: 8px;">
<div class="tank-summary-name" style="font-size: 14px;">Last Application</div>
<div style="font-size: 11px; color: var(--gray);">${new Date(lastApp.date).toLocaleDateString()}</div>
</div>
<div style="font-size: 14px; font-weight: 600; color: var(--dark);">${lastApp.itemName}</div>
<div style="font-size: 12px; color: var(--gray);">${lastApp.amount} ${lastApp.unit || ''}</div>
</div>
`;
}

// Prepare Chart Data (Last 14 Days)
const labels = [];
const dataPoints = [];
const today = new Date();
for (let i = 13; i >= 0; i--) {
const d = new Date(today);
d.setDate(d.getDate() - i);
const dateStr = this.getFormattedDate(d);
labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
const dayEntries = this.state.feedLogs.filter(e => e.tankId === tank.id && e.date === dateStr);
const dayTotal = dayEntries.reduce((sum, e) => sum + e.amount, 0);
dataPoints.push(dayTotal);
}

container.innerHTML = `
<div class="tank-detail-tab-content">
<!-- LIFECYCLE STATE BANNER -->
<div style="background: linear-gradient(135deg, ${lifecycleInfo.bgColor} 0%, ${lifecycleInfo.bgColor}dd 100%); border: 2px solid ${lifecycleInfo.color}; border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
<div style="font-size: 32px;">${lifecycleInfo.icon}</div>
<div style="flex: 1;">
<div style="font-size: 16px; font-weight: 700; color: ${lifecycleInfo.color}; margin-bottom: 4px;">${lifecycleInfo.label}</div>
<div style="font-size: 13px; color: ${lifecycleInfo.color}; opacity: 0.9;">${lifecycleInfo.description} • DOC ${doc}</div>
</div>
<div style="text-align: right; font-size: 12px; color: ${lifecycleInfo.color}; opacity: 0.8;">
${phaseLabel || trayPhase || ''}
</div>
</div>
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Feed History (14 Days)</h3>
</div>
<div style="background: white; padding: 10px; border-radius: 12px; border: 1px solid var(--border); height: 220px;">
<canvas id="feedHistoryChart"></canvas>
</div>
</div>
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Health & Mortality</h3>
</div>
<div class="tank-summary-card" style="display:flex; flex-direction:column; gap:12px;">
<div style="display: grid; grid-template-columns: 1fr 1fr; gap:12px;">
<div>
<div class="tank-summary-label">Dead Shrimp</div>
<div class="tank-summary-value" style="color: ${tank.deadCount > 0 ? 'var(--danger)' : 'var(--success)'};">${tank.deadCount || 0}</div>
</div>
<div>
<div class="tank-summary-label">Health Status</div>
<div class="tank-summary-value" style="color: ${
  (tank.healthStatus || 'healthy') === 'critical' ? 'var(--danger)' :
  (tank.healthStatus || 'healthy') === 'concerns' ? 'var(--warning)' :
  (tank.healthStatus || 'healthy') === 'normal' ? 'var(--info)' :
  'var(--success)'
}; font-weight: 600; text-transform: capitalize;">${(tank.healthStatus || 'healthy').replace('-', ' ')}</div>
</div>
</div>
${tank.healthNotes ? `<div style="padding: 8px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid var(--warning); font-size: 12px; color: var(--gray);">
<strong>Notes:</strong> ${this.sanitizeHTML(tank.healthNotes)}
</div>` : ''}
${tank.lastHealthUpdate ? `<div style="font-size: 11px; color: var(--gray);">Last updated: ${tank.lastHealthUpdate}</div>` : ''}
</div>
</div>
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Recent Activity</h3>
</div>
${waterHTML}
<br>
${appHTML}
</div>
</div>
`;

// Initialize Chart
if (this.feedChart) {
this.feedChart.destroy();
}
const canvas = document.getElementById('feedHistoryChart');
if (!canvas) return;
const ctx = canvas.getContext('2d');
this.feedChart = new Chart(ctx, {
type: 'bar',
data: {
labels: labels,
datasets: [{
label: 'Feed (kg)',
data: dataPoints,
backgroundColor: '#2196F3',
borderRadius: 4,
barThickness: 10
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { display: false }
},
scales: {
y: {
beginAtZero: true,
grid: { borderDash: [4, 4], drawBorder: false },
ticks: { font: { size: 10 } }
},
x: {
grid: { display: false },
ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 }
}
}
}
});
}

renderTankDetailAnalytics(tank, container) {
// Filter data for this specific tank
const tankEntries = this.state.feedLogs.filter(e => e.tankId === tank.id);
const tankHarvests = this.state.harvests.filter(h => h.tankId === tank.id);

// Calculate performance metrics
const totalFeed = tankEntries.reduce((sum, e) => sum + e.amount, 0);
const totalHarvested = tankHarvests.reduce((sum, h) => sum + h.weight, 0);
const totalProduction = (tank.biomass || 0) + totalHarvested;
const estimatedFCR = totalProduction > 0 ? (totalFeed / totalProduction).toFixed(2) : '0.00';
const doc = this.getDaysOld(tank.stockingDate);

container.innerHTML = `
<div class="tank-detail-tab-content">
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Performance Trends for ${this.sanitizeHTML(tank.name)}</h3>
</div>
<div class="chart-card" style="margin-bottom: 16px;">
<div class="chart-header">
<h3>Feed vs. Growth</h3>
</div>
<canvas id="tankGrowthChart" style="max-height: 250px;"></canvas>
</div>
<div class="chart-card">
<div class="chart-header">
<h3>FCR Trend</h3>
</div>
<canvas id="tankFCRChart" style="max-height: 250px;"></canvas>
</div>
</div>
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Performance Metrics</h3>
</div>
<div class="detail-stat-grid">
<div class="stat-card"><div class="stat-value">${doc}</div><div class="stat-label">Days of Culture</div></div>
<div class="stat-card"><div class="stat-value">${(tank.biomass || 0).toFixed(0)} <span class="unit">kg</span></div><div class="stat-label">Est. Biomass</div></div>
<div class="stat-card"><div class="stat-value">${estimatedFCR}</div><div class="stat-label">Est. FCR</div></div>
<div class="stat-card"><div class="stat-value">${totalFeed.toFixed(1)} <span class="unit">kg</span></div><div class="stat-label">Total Feed</div></div>
<div class="stat-card"><div class="stat-value">${totalHarvested.toFixed(1)} <span class="unit">kg</span></div><div class="stat-label">Total Harvested</div></div>
</div>
</div>
</div>`;
// Render charts after DOM is ready
setTimeout(() => {
this.renderTankGrowthChart(tank, tankEntries, tankHarvests);
this.renderTankFCRChart(tank, tankEntries, tankHarvests);
}, 100);
}

renderTankGrowthChart(tank, entries, harvests) {
const canvas = document.getElementById('tankGrowthChart');
if (!canvas) return;

// Calculate daily feed and biomass over time
const dailyData = {};
const allDates = [...new Set(entries.map(e => e.date))].sort();
// Initialize daily data
allDates.forEach(date => {
dailyData[date] = {
feed: 0,
biomass: 0
};
});

// Calculate cumulative feed
let cumulativeFeed = 0;
allDates.forEach(date => {
const dayEntries = entries.filter(e => e.date === date);
cumulativeFeed += dayEntries.reduce((sum, e) => sum + e.amount, 0);
dailyData[date].feed = cumulativeFeed;
});

// Calculate estimated biomass over time
// Start with initial seed, add growth based on feed
const stockingDate = tank.stockingDate || allDates[0];
const initialSeed = tank.initialSeed || 0;
allDates.forEach((date, index) => {
if (date < stockingDate) {
dailyData[date].biomass = 0;
} else {
// Simple growth estimation: assume 1.5 FCR (1.5kg feed = 1kg growth)
const daysSinceStocking = Math.floor((new Date(date) - new Date(stockingDate)) / (1000 * 60 * 60 * 24));
const feedSinceStocking = dailyData[date].feed;
const estimatedGrowth = feedSinceStocking / 1.5; // Using 1.5 as average FCR
dailyData[date].biomass = initialSeed + estimatedGrowth;
}
});

const dates = Object.keys(dailyData).sort();
const feedData = dates.map(date => dailyData[date].feed);
const biomassData = dates.map(date => dailyData[date].biomass);

// Destroy existing chart
if (this.charts.tankGrowth) {
this.charts.tankGrowth.destroy();
}

this.charts.tankGrowth = new Chart(canvas, {
type: 'line',
data: {
labels: dates.map(d => {
const date = new Date(d);
return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}),
datasets: [{
label: 'Cumulative Feed (kg)',
data: feedData,
borderColor: 'rgb(33, 150, 243)',
backgroundColor: 'rgba(33, 150, 243, 0.1)',
tension: 0.4,
fill: false,
borderWidth: 2,
pointRadius: 3,
yAxisID: 'y'
}, {
label: 'Estimated Biomass (kg)',
data: biomassData,
borderColor: 'rgb(76, 175, 80)',
backgroundColor: 'rgba(76, 175, 80, 0.1)',
tension: 0.4,
fill: false,
borderWidth: 2,
pointRadius: 3,
yAxisID: 'y1'
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
displayColors: true,
callbacks: {
label: function(context) {
if (context.datasetIndex === 0) {
return `Feed: ${context.parsed.y.toFixed(2)} kg`;
} else {
return `Biomass: ${context.parsed.y.toFixed(2)} kg`;
}
}
}
}
},
scales: {
y: {
type: 'linear',
position: 'left',
beginAtZero: true,
title: {
display: true,
text: 'Feed (kg)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
callback: function(value) {
return value.toFixed(1) + ' kg';
}
}
},
y1: {
type: 'linear',
position: 'right',
beginAtZero: true,
title: {
display: true,
text: 'Biomass (kg)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
drawOnChartArea: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
callback: function(value) {
return value.toFixed(1) + ' kg';
}
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderTankFCRChart(tank, entries, harvests) {
const canvas = document.getElementById('tankFCRChart');
if (!canvas) return;

// Calculate weekly FCR for this tank
const weeklyData = {};
const allDates = [...new Set(entries.map(e => e.date))].sort();
allDates.forEach(date => {
const weekStart = new Date(date);
weekStart.setDate(weekStart.getDate() - weekStart.getDay());
const weekKey = weekStart.toISOString().split('T')[0];
if (!weeklyData[weekKey]) {
weeklyData[weekKey] = { feed: 0, production: 0, dates: [] };
}
weeklyData[weekKey].dates.push(date);
});

// Calculate feed and production for each week
Object.keys(weeklyData).forEach(weekKey => {
const weekDates = weeklyData[weekKey].dates;
weeklyData[weekKey].feed = entries
.filter(e => weekDates.includes(e.date))
.reduce((sum, e) => sum + e.amount, 0);
const weekHarvests = harvests.filter(h => weekDates.includes(h.date));
const weekProduction = weekHarvests.reduce((sum, h) => sum + h.weight, 0);
// Add current biomass if tank is active
if (tank.status === 'active' && tank.biomass) {
weeklyData[weekKey].production = weekProduction + (tank.biomass / Object.keys(weeklyData).length);
} else {
weeklyData[weekKey].production = weekProduction;
}
});

const weeks = Object.keys(weeklyData).sort();
const fcrValues = weeks.map(week => {
const data = weeklyData[week];
return data.production > 0 ? parseFloat((data.feed / data.production).toFixed(2)) : null;
});

// Destroy existing chart
if (this.charts.tankFCR) {
this.charts.tankFCR.destroy();
}

this.charts.tankFCR = new Chart(canvas, {
type: 'line',
data: {
labels: weeks.map(w => {
const date = new Date(w);
return `Week ${date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
}),
datasets: [{
label: 'FCR',
data: fcrValues,
borderColor: 'rgb(76, 175, 80)',
backgroundColor: 'rgba(76, 175, 80, 0.1)',
tension: 0.4,
fill: true,
borderWidth: 2,
pointRadius: 5,
pointBackgroundColor: 'rgb(76, 175, 80)',
pointBorderColor: '#fff',
pointBorderWidth: 2
}, {
label: 'Target (1.2)',
data: weeks.map(() => 1.2),
borderColor: 'rgba(255, 152, 0, 0.5)',
borderDash: [5, 5],
borderWidth: 1,
pointRadius: 0,
fill: false
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
displayColors: true,
callbacks: {
label: function(context) {
if (context.datasetIndex === 0) {
if (context.parsed.y === null) return 'FCR: N/A';
return `FCR: ${context.parsed.y.toFixed(2)}`;
} else {
return `Target: ${context.parsed.y.toFixed(2)}`;
}
}
}
}
},
scales: {
y: {
beginAtZero: true,
title: {
display: true,
text: 'FCR',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderTankDetailLogs(tank, container) {
container.innerHTML = `
<div class="tank-detail-tab-content" style="padding-top: 10px;">
<div class="tank-detail-sub-tabs" id="tankLogSubTabs">
<button class="tank-detail-sub-tab active" onclick="app.switchTankLogSubTab('${tank.id}', 'feed')">Feed & Harvest</button>
<button class="tank-detail-sub-tab" onclick="app.switchTankLogSubTab('${tank.id}', 'water')">Water</button>
<button class="tank-detail-sub-tab" onclick="app.switchTankLogSubTab('${tank.id}', 'apps')">Applications</button>
<button class="tank-detail-sub-tab" onclick="app.switchTankLogSubTab('${tank.id}', 'disease')">Disease / Health</button>
</div>
<div id="tankLogSubTabContent">
<!-- Sub-tab content will be loaded here -->
</div>
</div>
`;
// Default to feed tab
this.renderTankLogFeed(tank, document.getElementById('tankLogSubTabContent'));
}

switchTankLogSubTab(tankId, subTabName) {
const tank = this.getTankById(tankId);
if (!tank) return;

// Update active tab
const subTabsContainer = document.getElementById('tankLogSubTabs');
subTabsContainer.querySelectorAll('.tank-detail-sub-tab').forEach(tab => {
if (tab.getAttribute('onclick').includes(`'${subTabName}'`)) {
tab.classList.add('active');
} else {
tab.classList.remove('active');
}
});

const contentContainer = document.getElementById('tankLogSubTabContent');
contentContainer.innerHTML = ''; // Clear previous content

if (subTabName === 'feed') {
this.renderTankLogFeed(tank, contentContainer);
} else if (subTabName === 'water') {
this.renderTankLogWater(tank, contentContainer);
} else if (subTabName === 'apps') {
this.renderTankLogApplications(tank, contentContainer);
} else if (subTabName === 'disease') {
this.renderTankLogDiseases(tank, contentContainer);
}
}

renderTankLogFeed(tank, container) {
const feedEntries = this.state.feedLogs.filter(e => e.tankId === tank.id).sort((a, b) => b.id - a.id).slice(0, 20);
const harvestEntries = this.state.harvests.filter(h => h.tankId === tank.id).sort((a, b) => b.id - a.id);

container.innerHTML = `
<div class="tank-detail-sub-tab-content">
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Recent Feed History</h3>
<button class="btn btn-sm btn-secondary" onclick="app.switchScreen('log'); app.switchLogTank('${this.escapeAttribute(tank.id)}'); app.closeAllModals();"><i class="fas fa-book"></i> Full Log</button>
</div>
${feedEntries.length > 0 ? feedEntries.map(e => `
<div class="settings-item" style="margin-bottom: 8px;">
<div>
<div style="font-weight: 600;">${new Date(e.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}: ${e.amount} kg</div>
<div style="font-size: 12px; color: var(--gray);">Tray: <span class="log-status ${e.trayResult}">${e.trayResult || 'pending'}</span></div>
</div>
<button class="btn-icon" onclick="app.editFeedEntry(${e.id})"><i class="fas fa-edit"></i></button>
</div>
`).join('') : '<p class="text-muted">No feed entries.</p>'}
</div>

<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Harvest History</h3>
<button class="btn btn-sm btn-secondary" onclick="app.openCropHistory('${this.escapeAttribute(tank.id)}')"><i class="fas fa-history"></i> Full History</button>
</div>
${harvestEntries.length > 0 ? harvestEntries.map(h => `
<div class="settings-item" style="margin-bottom: 8px;">
<div>
<div style="font-weight: 600;">${new Date(h.date).toLocaleDateString()}: ${h.weight} kg</div>
<div style="font-size: 12px; color: var(--gray);">Count: ${h.count || '-'}</div>
</div>
</div>
`).join('') : '<p class="text-muted">No harvests.</p>'}
</div>
</div>
`;
}

renderTankLogWater(tank, container) {
const waterEntries = this.state.waterQuality.filter(w => w.tankId == tank.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

container.innerHTML = `
<div class="tank-detail-sub-tab-content">
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Recent Water Quality</h3>
<button class="btn btn-sm btn-secondary" onclick="app.openWaterQualityHistory('${this.escapeAttribute(tank.id)}')"><i class="fas fa-history"></i> Full History</button>
</div>
${waterEntries.length > 0 ? waterEntries.map(entry => `
<div class="settings-item" style="margin-bottom: 8px;">
<div>
<div style="font-weight: 600;">${new Date(entry.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}</div>
<div style="font-size: 12px; color: var(--gray); display: flex; gap: 12px; margin-top: 4px;">
<span>pH: <strong>${entry.ph !== null ? entry.ph : '-'}</strong></span>
<span>Salinity: <strong>${entry.salinity !== null ? entry.salinity : '-'}</strong></span>
<span>D.O.: <strong>${entry.do !== null ? entry.do : '-'}</strong></span>
<span>Alkalinity: <strong>${entry.alkalinity !== null ? entry.alkalinity : '-'}</strong></span>
<span>NH₃: <strong>${entry.ammonia !== null ? entry.ammonia : '-'}</strong></span>
<span>NO₂: <strong>${entry.nitrite !== null ? entry.nitrite : '-'}</strong></span>
</div>
</div>
</div>
`).join('') : '<p class="text-muted">No water quality logs.</p>'}
</div>
</div>
`;
}

renderTankLogApplications(tank, container) {

const appEntries = (this.state.applications || []).filter(a => a.tankId == tank.id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

container.innerHTML = `
<div class="tank-detail-sub-tab-content">
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Recent Applications</h3>
<button class="btn btn-sm btn-secondary" onclick="app.openApplicationHistory('${this.escapeAttribute(tank.id)}')"><i class="fas fa-history"></i> Full History</button>
</div>
${appEntries.length > 0 ? appEntries.map(entry => `
<div class="settings-item" style="margin-bottom: 8px;">
<div>
<div style="font-weight: 600;">${this.sanitizeHTML(entry.itemName)}</div>
<div style="font-size: 12px; color: var(--gray); margin-top: 4px;">
${new Date(entry.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})} &bull; ${entry.amount} ${entry.unit || ''}
</div>
</div>
<button class="btn-icon" onclick="app.deleteApplication(${entry.id}, '${this.escapeAttribute(tank.id)}')"><i class="fas fa-trash"></i></button>
</div>
`).join('') : '<p class="text-muted">No applications logged.</p>'}
</div>
</div>
`;
}

renderTankLogDiseases(tank, container) {
const diseaseEntries = (this.state.diseases || []).filter(d => d.tankId === tank.id).sort((a, b) => new Date(b.dateNoticed) - new Date(a.dateNoticed));

container.innerHTML = `
<div class="tank-detail-sub-tab-content">
<div class="detail-section">
<div class="detail-section-header">
<h3 class="detail-section-title">Disease / Health History</h3>
<button class="btn btn-sm btn-secondary" onclick="app.openDiseaseModal('${this.escapeAttribute(tank.id)}')"><i class="fas fa-notes-medical"></i> Log Disease</button>
</div>
${diseaseEntries.length > 0 ? diseaseEntries.map(entry => `
<div class="settings-item" style="border-left: 4px solid ${entry.outcome === 'recovered' ? 'var(--success)' : entry.outcome === 'culled' ? 'var(--danger)' : 'var(--warning)'}; padding-left: 12px; margin-bottom: 12px;">
<div style="flex: 1;">
<div style="font-weight: 600;">${this.sanitizeHTML(entry.diseaseName || entry.diseaseType)} <span style="background: #e3f2fd; color: #1565C0; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${this.sanitizeHTML(entry.outcome || 'ongoing')}</span></div>
<div style="font-size: 12px; color: var(--gray); margin-top: 4px;">
<strong>Date:</strong> ${new Date(entry.dateNoticed).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}<br>
<strong>Symptoms:</strong> ${this.sanitizeHTML(entry.symptoms || '-') }<br>
<strong>Treatment:</strong> ${this.sanitizeHTML(entry.treatment || '-') } ${entry.dose ? `(${this.sanitizeHTML(String(entry.dose))})` : ''}<br>
${entry.duration ? `<strong>Duration:</strong> ${this.sanitizeHTML(String(entry.duration))} days<br>` : ''}
${entry.cost ? `<strong>Cost:</strong> ₹${this.sanitizeHTML(String(entry.cost))}<br>` : ''}
</div>
</div>
<button class="btn-icon" onclick="app.deleteDiseaseLog(${entry.id}, '${this.escapeAttribute(tank.id)}')"><i class="fas fa-trash"></i></button>
</div>
`).join('') : '<p class="text-muted">No disease logs. Tank appears healthy!</p>'}
</div>
</div>
`;
}


renderTankDetailActions(tank, container) {
const isInactive = tank.status === 'inactive';
let actionsHTML = '';

if (isInactive) {
actionsHTML = `
<button class="btn btn-success" style="width: 100%;" onclick="app.startNewCrop('${this.escapeAttribute(tank.id)}')">
<i class="fas fa-sync-alt"></i> Start New Crop
</button>
`;
} else {
const ownerActions = this.hasPermission('manage_tanks') ? `
<hr style="border: 0; border-top: 1px solid var(--border); margin: 10px 0;">
<button class="btn btn-secondary" onclick="app.openPartialHarvestModal('${this.escapeAttribute(tank.id)}')"><i class="fas fa-fish"></i> Partial Harvest</button>
<button class="btn btn-danger" onclick="app.endCrop('${this.escapeAttribute(tank.id)}')"><i class="fas fa-flag-checkered"></i> End Crop Cycle</button>
` : '';

actionsHTML = `
<div style="display: flex; flex-direction: column; gap: 12px;">
<button class="btn btn-primary" onclick="app.openLogFeedModal('${this.escapeAttribute(tank.id)}')"><i class="fas fa-plus"></i> Log Feed</button>
<button class="btn btn-info" style="background-color: var(--info); color: white;" onclick="app.openWaterQualityModal('${this.escapeAttribute(tank.id)}')"><i class="fas fa-flask"></i> Log Water Quality</button>
<button class="btn btn-info" style="background-color: var(--warning); color: white;" onclick="app.openApplicationModal('${this.escapeAttribute(tank.id)}')"><i class="fas fa-syringe"></i> Log Application</button>
${ownerActions}
</div>
`;
}

container.innerHTML = `
<div class="tank-detail-tab-content">
${actionsHTML}
</div>
`;
}

openCropHistory(tankId) {
// Find archived tanks that start with tankId + '_crop_'
const history = this.state.tanks.filter(t => t.id.startsWith(tankId + '_crop_'));
const list = document.getElementById('cropHistoryList');
list.innerHTML = '';
if (history.length === 0) {
list.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No history found for this tank.</p></div>';
} else {
// Sort by creation date (descending) - inferred from ID timestamp suffix
history.sort((a, b) => {
const timeA = parseInt(a.id.split('_crop_')[1]) || 0;
const timeB = parseInt(b.id.split('_crop_')[1]) || 0;
return timeB - timeA;
});

history.forEach(crop => {
// Calculate stats for this crop
const entries = this.state.feedLogs.filter(e => e.tankId === crop.id);
const totalFeed = entries.reduce((sum, e) => sum + e.amount, 0);
const harvests = this.state.harvests.filter(h => h.tankId === crop.id);
const totalHarvest = harvests.reduce((sum, h) => sum + h.weight, 0);
const fcr = totalHarvest > 0 ? (totalFeed / totalHarvest).toFixed(2) : '0.00';
const div = document.createElement('div');
div.className = 'tank-summary-card'; // Reuse styling
div.style.marginBottom = '12px';
div.innerHTML = `
<div class="tank-summary-header">
<div class="tank-summary-name" style="font-size: 14px;">${this.sanitizeHTML(crop.name)}</div>
</div>
<div class="tank-summary-stats">
<div class="tank-summary-stat">
<span class="tank-summary-label">Total Feed</span>
<span class="tank-summary-value">${totalFeed.toFixed(1)} kg</span>
</div>
<div class="tank-summary-stat">
<span class="tank-summary-label">Total Harvest</span>
<span class="tank-summary-value">${totalHarvest.toFixed(1)} kg</span>
</div>
</div>
<div style="margin-top:8px; font-size:12px; text-align:right; color: var(--dark);">
<strong>FCR: ${fcr}</strong>
</div>
`;
list.appendChild(div);
});
}
document.getElementById('cropHistoryModal').classList.add('active');
}

openPartialHarvestModal(tankId) {
this.editingTankId = tankId;
document.getElementById('harvestDate').value = this.currentDate;
document.getElementById('harvestWeight').value = '';
document.getElementById('harvestCount').value = '';
document.getElementById('harvestPrice').value = '';
document.getElementById('partialHarvestModal').classList.add('active');
}

saveHarvest() {
const tankId = this.editingTankId;
const date = document.getElementById('harvestDate').value;
const weight = parseFloat(document.getElementById('harvestWeight').value);
const count = parseFloat(document.getElementById('harvestCount').value);
const price = parseFloat(document.getElementById('harvestPrice').value) || 0;

if (!weight || weight <= 0) {
this.showToast('Please enter valid weight', 'error');
return;
}

const newHarvest = {
id: Date.now(),
tankId,
date,
weight,
count,
price
};

this.state.harvests.push(newHarvest);
this.saveHarvest(newHarvest);
this.recalculateTankBiomass(tankId);
this.closeAllModals();
this.renderAll();
this.showToast(`Harvest of ${weight}kg recorded`);
}

endCrop(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

// Calculate metrics for summary
const entries = this.state.feedLogs.filter(e => e.tankId == tankId);
const totalFeed = entries.reduce((sum, e) => sum + e.amount, 0);
const harvests = this.state.harvests.filter(h => h.tankId === tankId);
const totalHarvest = harvests.reduce((sum, h) => sum + h.weight, 0);
const fcr = totalHarvest > 0 ? (totalFeed / totalHarvest).toFixed(2) : '0.00';
const doc = this.getDaysOld(tank.stockingDate);
// Estimate Survival
let survival = '0%';
if (tank.initialSeed > 0) {
let totalHarvestCount = 0;
let hasCountData = false;
harvests.forEach(h => {
if (h.count && h.weight) {
totalHarvestCount += (h.weight * h.count);
hasCountData = true;
}
});
if (hasCountData) {
survival = ((totalHarvestCount / tank.initialSeed) * 100).toFixed(1) + '%';
} else {
// Fallback estimate
const estSurvivalRate = Math.max(0, 100 - ((doc/100) * 15));
survival = '~' + estSurvivalRate.toFixed(0) + '%';
}
}

// Populate Modal
document.getElementById('endCropTankName').textContent = this.sanitizeHTML(tank.name);
document.getElementById('endCropDoc').textContent = `DOC: ${doc}`;
document.getElementById('endCropTotalFeed').textContent = `${totalFeed.toFixed(1)} kg`;
document.getElementById('endCropTotalHarvest').textContent = `${totalHarvest.toFixed(1)} kg`;
document.getElementById('endCropFCR').textContent = fcr;
document.getElementById('endCropSurvival').textContent = survival;
// Bind Confirm Button
document.getElementById('confirmEndCropBtn').onclick = () => this.executeEndCrop(tankId);
this.closeAllModals();
document.getElementById('endCropModal').classList.add('active');
}

executeEndCrop(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

tank.status = 'inactive';
this.saveTanks();
this.closeAllModals();
this.renderAll();
this.showToast('Crop cycle ended', 'success');
}

openWaterQualityHistory(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

const modal = document.getElementById('applicationHistoryModal');
modal.querySelector('h3').innerHTML = '<i class="fas fa-history"></i> Water Quality History';
const list = modal.querySelector('#applicationHistoryList');
const entries = this.state.waterQuality.filter(w => w.tankId === tankId).sort((a, b) => new Date(b.date) - new Date(a.date));

if (entries.length === 0) {
list.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No water quality logs found.</p></div>';
} else {
list.innerHTML = entries.map(entry => `
<div class="settings-item" style="align-items: center; margin-bottom: 8px;">
<div style="flex: 1;">
<div style="font-weight: 600;">${new Date(entry.date).toLocaleDateString()}</div>
<div style="font-size: 12px; color: var(--gray);">
pH: ${entry.ph || '-'} | Salinity: ${entry.salinity || '-'} | DO: ${entry.do || '-'} | NH3: ${entry.ammonia || '-'}
</div>
</div>
</div>
`).join('');
}
modal.classList.add('active');
}

renderTankDetailEdit(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;

this.editingTankId = tankId;

const content = document.getElementById('tankDetailContent');
const footer = document.getElementById('tankDetailFooter');
const farm = this.getFarmById(tank.farmId);

content.innerHTML = `
<div class="tank-detail-tab-content">
<div class="form-group">
<label>Farm</label>
<div class="form-control" style="background: #f8f9fa;">${farm ? farm.name : 'Unknown'}</div>
<small class="text-muted">To change farm, edit the tank from the main screen.</small>
</div>
<div class="form-group">
<label>Tank Name</label>
<input type="text" id="detailTankNameInput" class="form-control" value="${tank.name}">
</div>
<div class="form-group">
<label>Size (acres)</label>
<input type="number" id="detailTankSize" class="form-control" value="${tank.size || ''}" step="0.1" min="0.1">
</div>
<div class="form-group">
<label>Stocking Date</label>
<input type="date" id="detailStockingDate" class="form-control" value="${tank.stockingDate}" required>
</div>
<div class="form-group">
<label>Initial Seed Count</label>
<input type="number" id="detailInitialSeed" class="form-control" value="${tank.initialSeed || ''}" min="0">
</div>
<div class="form-group">
<label>Number of Check Trays</label>
<select id="detailTankCheckTrays" class="form-control">
<option value="1">1 Tray</option>
<option value="2">2 Trays</option>
<option value="3">3 Trays</option>
<option value="4">4 Trays</option>
</select>
</div>
<div class="form-group">
<label>Blind Duration (Days)</label>
<input type="number" id="detailTankBlindDuration" class="form-control" value="${tank.blindDuration || 30}">
</div>
<div class="form-group">
<label>Dead Shrimp (Count)</label>
<input type="number" id="detailTankDeadCount" class="form-control" value="${tank.deadCount || 0}" min="0" placeholder="Number of dead shrimp observed">
</div>
<div class="form-group">
<label>Health Status</label>
<select id="detailTankHealthStatus" class="form-control">
<option value="healthy" ${(tank.healthStatus || 'healthy') === 'healthy' ? 'selected' : ''}>Healthy</option>
<option value="normal" ${(tank.healthStatus || 'healthy') === 'normal' ? 'selected' : ''}>Normal (Minor issues)</option>
<option value="concerns" ${(tank.healthStatus || 'healthy') === 'concerns' ? 'selected' : ''}>Health Concerns</option>
<option value="critical" ${(tank.healthStatus || 'healthy') === 'critical' ? 'selected' : ''}>Critical</option>
</select>
</div>
<div class="form-group">
<label>Health Notes (Optional)</label>
<textarea id="detailTankHealthNotes" class="form-control" rows="2" placeholder="e.g., Diseased gills, weak swimmers, unusual behavior..."></textarea>
</div>
<div class="form-group">
<label>Week 1 Feeds</label>
<select id="detailTankBlindWeek1" class="form-control">
<option value="2" ${tank.blindWeek1 == 2 ? 'selected' : ''}>2 Feeds</option>
<option value="3" ${tank.blindWeek1 == 3 ? 'selected' : ''}>3 Feeds</option>
<option value="4" ${tank.blindWeek1 == 4 ? 'selected' : ''}>4 Feeds</option>
</select>
</div>
<div class="form-group">
<label>Std Feeds (After Week 1)</label>
<select id="detailTankBlindStd" class="form-control">
<option value="3" ${tank.blindStd == 3 ? 'selected' : ''}>3 Feeds</option>
<option value="4" ${tank.blindStd == 4 ? 'selected' : ''}>4 Feeds</option>
<option value="5" ${tank.blindStd == 5 ? 'selected' : ''}>5 Feeds</option>
</select>
</div>
</div>
`;
document.getElementById('detailTankCheckTrays').value = tank.checkTrays || 2;
document.getElementById('detailTankHealthNotes').value = tank.healthNotes || '';

footer.style.display = 'flex';
footer.innerHTML = `
<button class="btn btn-secondary" onclick="app.switchTankDetailTab('${tankId}', 'overview')">Cancel</button>
<button class="btn btn-success" onclick="app.saveTankFromDetail()"><i class="fas fa-save"></i> Save Changes</button>
`;
}

saveTankFromDetail() {
if (!this.editingTankId) return;

const tank = this.getTankById(this.editingTankId);
if (!tank) return;

const name = document.getElementById('detailTankNameInput').value;
if (!name) {
this.showToast('Tank name is required', 'error');
return;
}

const newInitialSeed = parseInt(document.getElementById('detailInitialSeed').value) || 0;
const newStockingDate = document.getElementById('detailStockingDate').value;
const blindDuration = parseInt(document.getElementById('detailTankBlindDuration').value) || 30;
const blindWeek1 = parseInt(document.getElementById('detailTankBlindWeek1').value) || 2;
const blindStd = parseInt(document.getElementById('detailTankBlindStd').value) || 4;

if (!newStockingDate) {
 this.showToast('Stocking date is required', 'error');
 return;
}

// Regenerate blind schedule if critical parameters change
if (tank.initialSeed !== newInitialSeed || tank.stockingDate !== newStockingDate ||
tank.blindDuration !== blindDuration || tank.blindWeek1 !== blindWeek1 || tank.blindStd !== blindStd) {
tank.blindSchedule = this.generateBlindFeedingSchedule(newInitialSeed, newStockingDate, blindDuration, blindWeek1, blindStd);
this.showToast('Schedule updated for new density');
} else {
this.showToast('Tank updated successfully');
}

tank.name = name;
tank.size = parseFloat(document.getElementById('detailTankSize').value);
tank.stockingDate = newStockingDate;
tank.initialSeed = newInitialSeed;
tank.checkTrays = parseInt(document.getElementById('detailTankCheckTrays').value) || 2;
tank.blindDuration = blindDuration;
tank.deadCount = parseInt(document.getElementById('detailTankDeadCount').value) || 0;
tank.healthStatus = document.getElementById('detailTankHealthStatus').value;
tank.healthNotes = document.getElementById('detailTankHealthNotes').value || '';
tank.lastHealthUpdate = this.currentDate;
tank.blindWeek1 = blindWeek1;
tank.blindStd = blindStd;
this.saveTanks();
// Re-render detail view to show changes
this.openTankDetail(this.editingTankId);
this.renderFarmsList();
this.renderOverallStats();
}

startNewCrop(tankId) {
const tank = this.getTankById(tankId);
if (!tank) return;


this.showConfirmModal(`Start new crop cycle for ${this.sanitizeHTML(tank.name)}? This will reset all data.`, 'Start New Crop').then(confirmed => {
if (confirmed) {
// Archive old data
const archiveId = `${tank.id}_crop_${Date.now()}`;
// Create archived tank record
const archivedTank = JSON.parse(JSON.stringify(tank));
archivedTank.id = archiveId;
archivedTank.status = 'archived';
archivedTank.farmId = `${tank.farmId}_archive`; // Hide from current farm lists
archivedTank.name = `${this.sanitizeHTML(tank.name)} (Ended ${new Date().toLocaleDateString()})`;
this.state.tanks.push(archivedTank);

// Move feed entries to archive
const entriesToUpdate = [];
this.state.feedLogs.forEach(e => {
if (e.tankId === tank.id) {
e.tankId = archiveId;
entriesToUpdate.push(e);
}
});

// Move harvests to archive
const harvestsToUpdate = [];
this.state.harvests.forEach(h => {
if (h.tankId === tank.id) {
h.tankId = archiveId;
harvestsToUpdate.push(h);
}
});

tank.status = 'active';
tank.stockingDate = this.currentDate;
tank.initialSeed = 0;
tank.currentSeed = 0;
tank.biomass = 0;
this.saveTank(tank);
this.saveTank(archivedTank);
entriesToUpdate.forEach(e => this.saveFeedEntry(e));
harvestsToUpdate.forEach(h => this.saveHarvest(h));
this.closeAllModals();
this.renderAll();
this.showToast('New crop cycle started. Old data archived.', 'success');
}
});
}

openSettingsModal() {
const settingsBody = document.getElementById('settingsModal').querySelector('.modal-body');
// Clear and rebuild
settingsBody.innerHTML = `
        <h4 style="margin-bottom: 12px; color: var(--dark);">General</h4>
        <div class="form-group">
            <label>Farm Type</label>
            <select id="settingFarmType" class="form-control" onchange="app.updateFarmType(this.value)">
                <option value="extensive">Extensive (Low Intensity)</option>
                <option value="semi">Semi-Intensive</option>
                <option value="intensive">Intensive / Super-Intensive</option>
            </select>
            <small style="font-size: 11px; color: var(--gray);">Used to pre-fill blind duration, feeds per day and tray start point.</small>
        </div>
<div class="form-group">
<label>Feeds per Day</label>
<select id="settingFeedsPerDay" class="form-control" onchange="app.updateFeedsPerDay(this.value)"></select>
</div>
<div class="form-group">
<label>Feed Price (₹/kg)</label>
<input type="number" id="settingFeedPrice" class="form-control" onchange="app.updateFeedPrice(this.value)">
</div>
<div class="form-group">
<label>Blind Feeding Duration (days)</label>
<input type="number" id="settingBlindDuration" class="form-control" onchange="app.updateBlindDuration(this.value)">
</div>
<div class="form-group">
<label>Feed Jump Detection Threshold (%)</label>
<input type="number" id="feedJumpThreshold" class="form-control" value="30" onchange="app.updateFeedJumpThreshold(this.value)">
</div>
<div class="form-group" id="feedTimesContainer">
<!-- Populated by JS -->
</div>
<hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">
<h4 style="margin-bottom: 12px; color: var(--dark);">Tray Check Calibration (% of Feed)</h4>
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
<div class="form-group"><label style="font-size: 11px;">DOC 30-60</label><input type="number" id="trayPctRange1" class="form-control" step="0.1" onchange="app.updateTrayPercentage('range1', this.value)"></div>
<div class="form-group"><label style="font-size: 11px;">DOC 60-90</label><input type="number" id="trayPctRange2" class="form-control" step="0.1" onchange="app.updateTrayPercentage('range2', this.value)"></div>
<div class="form-group"><label style="font-size: 11px;">DOC 90+</label><input type="number" id="trayPctRange3" class="form-control" step="0.1" onchange="app.updateTrayPercentage('range3', this.value)"></div>
</div>
<hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">
<h4 style="margin-bottom: 12px; color: var(--dark);">Manage Supplements</h4>
<div class="form-group" style="display: flex; gap: 8px;">
<input type="text" id="newSupplementInput" class="form-control" placeholder="New supplement name">
<button class="btn btn-primary" onclick="app.addNewSupplement()">Add</button>
</div>
<div class="settings-list" id="settingsSupplementsList"></div>
<hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;">
<h4 style="margin-bottom: 12px; color: var(--dark);">Data Management</h4>
<div class="alert-card" style="background: #e3f2fd; border-left-color: var(--info); margin-bottom: 15px;"><div style="font-size: 12px; color: var(--dark);"><i class="fas fa-info-circle"></i> Your data is stored on this device. Backup regularly to avoid data loss.</div></div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
<button class="btn btn-secondary" onclick="app.exportData()"><i class="fas fa-download"></i> Backup Data</button>
<button class="btn btn-secondary" onclick="document.getElementById('importFile').click()"><i class="fas fa-upload"></i> Restore Data</button>
<input type="file" id="importFile" style="display: none;" accept=".json" onchange="app.importData(this)">
</div>
`;

this.renderSettingsSupplements();

        const farmTypeSelect = document.getElementById('settingFarmType');
        if (farmTypeSelect) {
            farmTypeSelect.value = this.state.settings.farmType || 'semi';
        }

        const feedsPerDaySelect = document.getElementById('settingFeedsPerDay');
feedsPerDaySelect.innerHTML = [1,2,3,4,5,6].map(i => `<option value="${i}">${i} Feed${i > 1 ? 's' : ''}</option>`).join('');
feedsPerDaySelect.value = this.state.settings.feedsPerDay || 4;

document.getElementById('settingFeedsPerDay').value = this.state.settings.feedsPerDay || 4;
document.getElementById('settingFeedPrice').value = this.state.settings.feedPrice || 90;
document.getElementById('settingBlindDuration').value = this.state.settings.blindFeedingDuration || 30;
document.getElementById('feedJumpThreshold').value = this.state.settings.feedJumpThreshold || 30;
const traySettings = this.state.settings.trayCheckPercentages || { range1: 0.4, range2: 0.6, range3: 0.8 };
document.getElementById('trayPctRange1').value = traySettings.range1;
document.getElementById('trayPctRange2').value = traySettings.range2;
document.getElementById('trayPctRange3').value = traySettings.range3;
document.getElementById('settingsModal').classList.add('active');
this.renderFeedTimeInputs();
}

renderFeedTimeInputs() {
const container = document.getElementById('feedTimesContainer');
if (!container) return;
const feedsCount = this.state.settings.feedsPerDay || 4;
let html = `<label>Feed Times (Schedule)</label><div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px;">`;
if (!Array.isArray(this.state.settings.feedTimes) || this.state.settings.feedTimes.length !== feedsCount) {
const start = 6;
const interval = 16 / Math.max(1, feedsCount);
this.state.settings.feedTimes = Array.from({length: feedsCount}, (_, i) => Math.floor(start + (i * interval)));
}
this.state.settings.feedTimes.forEach((time, index) => {
html += `
<div style="display: flex; flex-direction: column; gap: 4px;">
<span style="font-size: 11px; color: var(--gray);">Feed ${index + 1}</span>
<select class="form-control" style="padding: 4px;" onchange="app.updateFeedTime(${index}, this.value)">
${Array.from({length: 24}, (_, i) => {
const display = i === 0 ? '12 AM' : i === 12 ? '12 PM' : i > 12 ? `${i-12} PM` : `${i} AM`;
return `<option value="${i}" ${time == i ? 'selected' : ''}>${display}</option>`;
}).join('')}
</select>
</div>
`;
});
html += `</div>`;
container.innerHTML = html;
}

updateFeedTime(index, value) {
if (!this.state.settings.feedTimes) this.state.settings.feedTimes = [];
this.state.settings.feedTimes[index] = parseInt(value);
this.saveSettings();
}

    updateFarmType(type) {
        this.state.settings.farmType = type || 'semi';

        // Apply lightweight presets for first 30 days only.
        // These presets only adjust: feedsPerDay, blindFeedingDuration and an implicit tray-start DOC.
        if (type === 'extensive') {
            this.state.settings.feedsPerDay = 3;
            this.state.settings.blindFeedingDuration = 20;
            this.state.settings.trayStartDoc = 25;
        } else if (type === 'semi') {
            this.state.settings.feedsPerDay = 4;
            this.state.settings.blindFeedingDuration = 25;
            this.state.settings.trayStartDoc = 25;
        } else if (type === 'intensive') {
            this.state.settings.feedsPerDay = 5;
            this.state.settings.blindFeedingDuration = 18;
            this.state.settings.trayStartDoc = 18;
        }

        this.saveSettings();
        // Re-render dependent UI (feed times and summary views) to reflect new defaults.
        this.renderFeedTimeInputs();
        this.renderAll();
        this.showToast('Farm type preset applied', 'info');
    }

openComparisonModal() {
const grid = document.getElementById('comparisonGrid');
grid.innerHTML = '';
const farmId = this.state.settings.farmId;
const tanks = this.state.tanks.filter(t => t.farmId === farmId && t.status !== 'inactive');
tanks.slice(0, 4).forEach(tank => {
const entries = this.state.feedLogs.filter(e => e.tankId == tank.id);
const totalFeed = entries.reduce((sum, e) => sum + e.amount, 0);
const todayFeed = entries.filter(e => e.date === this.currentDate).reduce((sum, e) => sum + e.amount, 0);
const card = document.createElement('div');
card.className = 'comparison-card';
card.innerHTML = `
<h4 style="margin-bottom: 12px;">${this.sanitizeHTML(tank.name)}</h4>
<div style="font-size: 24px; font-weight: 700; color: var(--primary); margin-bottom: 8px;">${todayFeed.toFixed(1)}kg</div>
<div style="font-size: 12px; color: var(--gray);">Today's Feed</div>
<div style="margin-top: 12px; font-size: 11px; color: var(--gray);">
Total: ${totalFeed.toFixed(1)}kg • DOC: ${this.getDaysOld(tank.stockingDate)}
</div>
`;
grid.appendChild(card);
});
document.getElementById('comparisonModal').classList.add('active');
// Track comparison click
this.trackEvent('click_compare_ponds');
}


openExportModal() {
this.exportReportData();
}

exportReport() {
this.openExportModal();
}

exportReportData() {
// Generate report data
const reportData = {
farm: this.state.farm,
tanks: this.state.tanks.filter(t => t.farmId === this.state.settings.farmId),
feedEntries: this.state.feedLogs.filter(e => {
const tank = this.getTankById(e.tankId);
return tank && tank.farmId === this.state.settings.farmId;
}),
harvests: this.state.harvests.filter(h => {
const tank = this.getTankById(h.tankId);
return tank && tank.farmId === this.state.settings.farmId;
}),
generatedDate: new Date().toISOString(),
reportType: 'efficiency_analysis'
};
// Create downloadable JSON file
const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
const downloadAnchorNode = document.createElement('a');
downloadAnchorNode.setAttribute("href", dataStr);
downloadAnchorNode.setAttribute("download", `aquarythu_report_${this.currentDate}.json`);
document.body.appendChild(downloadAnchorNode);
downloadAnchorNode.click();
downloadAnchorNode.remove();
this.showToast('Report exported successfully');
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

updateFeedsPerDay(val) {
this.state.settings.feedsPerDay = parseInt(val);
this.saveSettings();
this.renderLogBook();
this.renderFeedTimeInputs();
}

updateFeedPrice(val) {
this.state.settings.feedPrice = parseFloat(val) || 90;
this.saveSettings();
this.renderFeedWasteSummary();
this.renderPerformanceScreen();
}

updateBlindDuration(val) {
this.state.settings.blindFeedingDuration = parseInt(val) || 30;
this.saveSettings();
this.renderAll();
}

updateMarketPrice(val) {
this.state.settings.marketPrice = parseFloat(val) || 0;
this.saveSettings();
this.renderPerformanceScreen();
}

updateFirstFeedTime(val) {
this.state.settings.firstFeedTime = parseInt(val) || 6;
this.saveSettings();
this.renderLogBook();
}
updateTrayPercentage(range, value) {
if (!this.state.settings.trayCheckPercentages) this.state.settings.trayCheckPercentages = { range1: 0.4, range2: 0.6, range3: 0.8 };
this.state.settings.trayCheckPercentages[range] = parseFloat(value) || 0;
this.saveSettings();
}

updateFeedJumpThreshold(val) {
this.state.settings.feedJumpThreshold = parseFloat(val) || 30;
this.saveSettings();
this.showToast(`Feed jump threshold updated to ${val}%`);
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

exportData() {
const data = {
farm: this.state.farm,
tanks: this.state.tanks,
feedEntries: this.state.feedLogs,
harvests: this.state.harvests,
inventory: this.state.inventory,
medicineInventory: this.state.medicineInventory,
settings: this.state.settings,
analyticsEvents: this.analyticsEvents,
exportDate: new Date().toISOString(),
version: '2.0'
};

// Update backup timestamp
this.state.settings.lastBackupDate = new Date().toISOString();
this.saveSettings();
localStorage.setItem('aquabook_last_backup', this.state.settings.lastBackupDate);
this.checkBackupStatus(); // Hide banner immediately

const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const downloadAnchorNode = document.createElement('a');
downloadAnchorNode.setAttribute("href", url);
downloadAnchorNode.setAttribute("download", "aquarythu_backup_" + this.getFormattedDate() + ".json");
document.body.appendChild(downloadAnchorNode);
downloadAnchorNode.click();
downloadAnchorNode.remove();
URL.revokeObjectURL(url);
this.showToast('Backup file downloaded successfully');
}

importData(input) {
const file = input.files[0];
if (!file) return;

const reader = new FileReader();
reader.onload = (e) => {
try {
const data = JSON.parse(e.target.result);

if (!data.farms || !data.tanks) {
throw new Error("Invalid backup file format");
}


this.showConfirmModal(`Restore data from ${new Date(data.exportDate).toLocaleDateString()}? This will overwrite current data.`, 'Restore Data').then(confirmed => {
if (confirmed) {
localStorage.setItem('aquabook_farms', JSON.stringify(data.farms));
localStorage.setItem('aquabook_tanks', JSON.stringify(data.tanks));
localStorage.setItem('aquabook_entries', JSON.stringify(data.feedEntries));
localStorage.setItem('aquabook_harvests', JSON.stringify(data.harvests || []));
localStorage.setItem('aquabook_inventory', JSON.stringify(data.inventory || { totalKg: 0 }));
localStorage.setItem('aquabook_medicine', JSON.stringify(data.medicineInventory || []));
localStorage.setItem('aquabook_settings', JSON.stringify(data.settings || this.state.settings));
if (data.analyticsEvents) {
localStorage.setItem('aquabook_analytics', JSON.stringify(data.analyticsEvents));
}

this.showAlertModal('Data restored successfully! The app will now reload.', 'Restore Complete');
window.location.reload();
}
});
} catch (err) {
console.error(err);
this.showToast('Failed to restore data. Invalid file.', 'error');
}
input.value = '';
};
reader.readAsText(file);
}

setViewMode(mode) {
this.viewMode = mode;
document.querySelectorAll('.range-tab').forEach(t => {
if (t.dataset.range === mode) t.classList.add('active');
else t.classList.remove('active');
});
this.renderLogBook();
}

setupEventListeners() {
document.querySelectorAll('.nav-btn').forEach(btn => {
btn.addEventListener('click', () => this.switchScreen(btn.dataset.screen));
});

document.getElementById('addFirstFarmBtn').addEventListener('click', () => {
this.openFarmModal();
});

document.getElementById('farmSelector').addEventListener('click', () => {
this.openFarmSelector();
});

document.getElementById('addFarmFromSelector').addEventListener('click', () => {
this.openFarmModal();
});

document.querySelectorAll('.close-modal').forEach(btn => {
btn.addEventListener('click', () => this.closeAllModals());
});

document.getElementById('saveFarmBtn').addEventListener('click', () => this.saveFarm());
document.getElementById('saveHarvestBtn').addEventListener('click', () => this.saveHarvest());

document.querySelectorAll('.range-tab').forEach(tab => {
tab.addEventListener('click', () => this.setViewMode(tab.dataset.range));
});

document.getElementById('saveStockBtn').addEventListener('click', () => this.saveStock());

document.addEventListener('click', (e) => {
if (!e.target.closest('.tank-action-menu')) {
document.querySelectorAll('.tank-menu-dropdown').forEach(el => el.classList.remove('show'));
}
// Hide pond comparison tooltip
if (!e.target.closest('.farm-selector')) {
const tooltip = document.getElementById('pondComparisonTooltip');
if (tooltip) tooltip.style.display = 'none';
}
});

document.querySelectorAll('.modal-overlay').forEach(modal => {
const closeBtn = modal.querySelector('.close-modal');
if (closeBtn) {
closeBtn.addEventListener('click', () => this.closeAllModals());
}
});

const farmSelector = document.getElementById('farmSelector');
if (farmSelector) {
farmSelector.addEventListener('click', () => {
// Open farm selector functionality
});
}

['tankBlindDuration', 'initialSeed', 'tankSize', 'tankBlindWeek1', 'tankBlindStd'].forEach(id => {
const el = document.getElementById(id);
if (el) {
el.addEventListener('input', () => this.updateBlindFeedPreview());
}
});
}

// ===== CHART RENDERING FUNCTIONS =====
switchChartTab(tabName) {
this.currentChartTab = tabName;
// Update tab buttons
document.querySelectorAll('.chart-tab').forEach(tab => {
if (tab.dataset.chart === tabName) {
tab.classList.add('active');
} else {
tab.classList.remove('active');
}
});
// Show/hide chart containers
const containerMap = {
'feed': 'chartFeed',
'fcr': 'chartFcr',
'waste': 'chartWaste',
'water': 'chartWater',
'growth': 'chartGrowth',
'comparison': 'chartComparison'
};
Object.keys(containerMap).forEach(key => {
const container = document.getElementById(containerMap[key]);
if (container) {
container.style.display = key === tabName ? 'block' : 'none';
}
});
// Render the selected chart
this.renderCharts();
}

updateCharts() {
const rangeSelect = document.getElementById('chartDateRange');
if (rangeSelect) {
this.chartDateRange = rangeSelect.value === 'all' ? null : parseInt(rangeSelect.value);
}
this.renderCharts();
}

renderCharts() {
const farmId = this.state.settings.farmId;
if (!farmId) return;

const farmTanks = this.state.tanks.filter(t => t.farmId === farmId && t.status !== 'inactive');
const farmTankIds = farmTanks.map(t => t.id);
const farmFeedEntries = this.state.feedLogs.filter(e => farmTankIds.includes(e.tankId));
const farmWaterQuality = this.state.waterQuality.filter(w => farmTankIds.includes(w.tankId));
const farmHarvests = this.state.harvests.filter(h => farmTankIds.includes(h.tankId));

// Calculate date range
const endDate = new Date();
const startDate = this.chartDateRange ? new Date(endDate.getTime() - (this.chartDateRange * 24 * 60 * 60 * 1000)) : null;

// Filter data by date range
const filterByDate = (entries) => {
if (!startDate) return entries;
return entries.filter(e => {
const entryDate = new Date(e.date);
return entryDate >= startDate && entryDate <= endDate;
});
};

const filteredFeedEntries = filterByDate(farmFeedEntries);
const filteredWaterQuality = filterByDate(farmWaterQuality);

// Render active chart
switch(this.currentChartTab) {
case 'feed':
this.renderFeedConsumptionChart(filteredFeedEntries);
break;
case 'fcr':
this.renderFCRTrendChart(filteredFeedEntries, farmHarvests, farmTanks);
break;
case 'waste':
this.renderWasteTrendChart(filteredFeedEntries);
break;
case 'water':
this.renderWaterQualityChart(filteredWaterQuality);
break;
case 'growth':
this.renderGrowthChart(farmTanks, filteredFeedEntries, farmHarvests);
break;
case 'comparison':
this.renderComparisonChart(farmTanks, filteredFeedEntries, farmHarvests);
break;
}
}

renderFeedConsumptionChart(entries) {
const canvas = document.getElementById('feedConsumptionChart');
if (!canvas) return;

// Group by date
const dailyFeed = {};
entries.forEach(entry => {
if (!dailyFeed[entry.date]) {
dailyFeed[entry.date] = 0;
}
dailyFeed[entry.date] += entry.amount;
});

// Sort dates
const dates = Object.keys(dailyFeed).sort();
const feedAmounts = dates.map(date => dailyFeed[date]);

// Destroy existing chart
if (this.charts.feedConsumption) {
this.charts.feedConsumption.destroy();
}

this.charts.feedConsumption = new Chart(canvas, {
type: 'line',
data: {
labels: dates.map(d => {
const date = new Date(d);
return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}),
datasets: [{
label: 'Feed Consumption (kg)',
data: feedAmounts,
borderColor: 'rgb(33, 150, 243)',
backgroundColor: 'rgba(33, 150, 243, 0.1)',
tension: 0.4,
fill: true,
borderWidth: 2,
pointRadius: 4,
pointBackgroundColor: 'rgb(33, 150, 243)',
pointBorderColor: '#fff',
pointBorderWidth: 2
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
displayColors: false,
callbacks: {
label: function(context) {
return `Feed: ${context.parsed.y.toFixed(2)} kg`;
}
}
}
},
scales: {
y: {
beginAtZero: true,
title: {
display: true,
text: 'Feed (kg)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
callback: function(value) {
return value + ' kg';
}
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderFCRTrendChart(entries, harvests, tanks) {
const canvas = document.getElementById('fcrTrendChart');
if (!canvas) return;

// Calculate weekly FCR
const weeklyData = {};
const allDates = [...new Set(entries.map(e => e.date))].sort();
allDates.forEach(date => {
const weekStart = new Date(date);
weekStart.setDate(weekStart.getDate() - weekStart.getDay());
const weekKey = weekStart.toISOString().split('T')[0];
if (!weeklyData[weekKey]) {
weeklyData[weekKey] = { feed: 0, production: 0, dates: [] };
}
weeklyData[weekKey].dates.push(date);
});

// Calculate feed and production for each week
Object.keys(weeklyData).forEach(weekKey => {
const weekDates = weeklyData[weekKey].dates;
weeklyData[weekKey].feed = entries
.filter(e => weekDates.includes(e.date))
.reduce((sum, e) => sum + e.amount, 0);
const weekHarvests = harvests.filter(h => weekDates.includes(h.date));
const weekProduction = weekHarvests.reduce((sum, h) => sum + h.weight, 0);
// Add biomass for active tanks
const activeTanks = tanks.filter(t => t.status === 'active');
const totalBiomass = activeTanks.reduce((sum, t) => sum + (t.biomass || 0), 0);
weeklyData[weekKey].production = weekProduction + (totalBiomass / Object.keys(weeklyData).length);
});

const weeks = Object.keys(weeklyData).sort();
const fcrValues = weeks.map(week => {
const data = weeklyData[week];
return data.production > 0 ? (data.feed / data.production).toFixed(2) : 0;
});

if (this.charts.fcrTrend) {
this.charts.fcrTrend.destroy();
}

this.charts.fcrTrend = new Chart(canvas, {
type: 'line',
data: {
labels: weeks.map(w => {
const date = new Date(w);
return `Week ${date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
}),
datasets: [{
label: 'FCR',
data: fcrValues,
borderColor: 'rgb(76, 175, 80)',
backgroundColor: 'rgba(76, 175, 80, 0.1)',
tension: 0.4,
fill: true,
borderWidth: 2,
pointRadius: 5,
pointBackgroundColor: 'rgb(76, 175, 80)',
pointBorderColor: '#fff',
pointBorderWidth: 2
}, {
label: 'Target (1.2)',
data: weeks.map(() => 1.2),
borderColor: 'rgba(255, 152, 0, 0.5)',
borderDash: [5, 5],
borderWidth: 1,
pointRadius: 0,
fill: false
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
callbacks: {
label: function(context) {
if (context.datasetIndex === 0) {
return `FCR: ${context.parsed.y}`;
}
return 'Target: 1.2';
}
}
}
},
scales: {
y: {
beginAtZero: false,
min: 0.8,
max: 2.0,
title: {
display: true,
text: 'FCR',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderWasteTrendChart(entries) {
const canvas = document.getElementById('wasteTrendChart');
if (!canvas) return;

// Group by date and calculate waste percentage
const dailyWaste = {};
entries.forEach(entry => {
if (!entry.date) return;
if (!dailyWaste[entry.date]) {
dailyWaste[entry.date] = { total: 0, waste: 0 };
}
dailyWaste[entry.date].total++;
if (entry.trayResult === 'half' || entry.trayResult === 'too-much') {
dailyWaste[entry.date].waste++;
}
});

const dates = Object.keys(dailyWaste).sort();
const wastePercentages = dates.map(date => {
const data = dailyWaste[date];
return data.total > 0 ? ((data.waste / data.total) * 100).toFixed(1) : 0;
});

if (this.charts.wasteTrend) {
this.charts.wasteTrend.destroy();
}

this.charts.wasteTrend = new Chart(canvas, {
type: 'bar',
data: {
labels: dates.map(d => {
const date = new Date(d);
return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}),
datasets: [{
label: 'Feed Waste %',
data: wastePercentages,
backgroundColor: function(context) {
const value = context.parsed.y;
if (value > 30) return 'rgba(244, 67, 54, 0.8)';
if (value > 15) return 'rgba(255, 152, 0, 0.8)';
return 'rgba(76, 175, 80, 0.8)';
},
borderColor: function(context) {
const value = context.parsed.y;
if (value > 30) return 'rgb(244, 67, 54)';
if (value > 15) return 'rgb(255, 152, 0)';
return 'rgb(76, 175, 80)';
},
borderWidth: 1,
borderRadius: 4
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
displayColors: false,
callbacks: {
label: function(context) {
return `Waste: ${context.parsed.y}%`;
}
}
}
},
scales: {
y: {
beginAtZero: true,
max: 100,
title: {
display: true,
text: 'Waste Percentage (%)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
callback: function(value) {
return value + '%';
}
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderWaterQualityChart(waterEntries) {
const canvas = document.getElementById('waterQualityChart');
if (!canvas) return;

// Sort by date
const sorted = waterEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
const dates = sorted.map(w => {
const date = new Date(w.date);
return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
});

if (this.charts.waterQuality) {
this.charts.waterQuality.destroy();
}

this.charts.waterQuality = new Chart(canvas, {
type: 'line',
data: {
labels: dates,
datasets: [
{
label: 'pH',
data: sorted.map(w => w.ph || null),
borderColor: 'rgb(33, 150, 243)',
backgroundColor: 'rgba(33, 150, 243, 0.1)',
tension: 0.4,
borderWidth: 2,
pointRadius: 3,
yAxisID: 'y'
},
{
label: 'DO (mg/L)',
data: sorted.map(w => w.do || null),
borderColor: 'rgb(76, 175, 80)',
backgroundColor: 'rgba(76, 175, 80, 0.1)',
tension: 0.4,
borderWidth: 2,
pointRadius: 3,
yAxisID: 'y1'
},
{
label: 'Ammonia (ppm)',
data: sorted.map(w => w.ammonia || null),
borderColor: 'rgb(255, 152, 0)',
backgroundColor: 'rgba(255, 152, 0, 0.1)',
tension: 0.4,
borderWidth: 2,
pointRadius: 3,
yAxisID: 'y2'
},
{
label: 'Nitrite (ppm)',
data: sorted.map(w => w.nitrite || null),
borderColor: 'rgb(156, 39, 176)',
backgroundColor: 'rgba(156, 39, 176, 0.1)',
tension: 0.4,
borderWidth: 2,
pointRadius: 3,
yAxisID: 'y2'
}
]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
interaction: {
mode: 'index',
intersect: false,
},
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 }
}
},
scales: {
y: {
type: 'linear',
display: true,
position: 'left',
title: {
display: true,
text: 'pH',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
},
y1: {
type: 'linear',
display: true,
position: 'right',
title: {
display: true,
text: 'DO (mg/L)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
drawOnChartArea: false,
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
},
y2: {
type: 'linear',
display: true,
position: 'right',
title: {
display: true,
text: 'Ammonia/Nitrite (ppm)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
drawOnChartArea: false,
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderGrowthChart(tanks, entries, harvests) {
const canvas = document.getElementById('growthChart');
if (!canvas) return;

// Calculate biomass over time
const dates = [...new Set(entries.map(e => e.date))].sort();
const biomassData = dates.map(date => {
let totalBiomass = 0;
tanks.forEach(tank => {
if (tank.status === 'active') {
const tankEntries = entries.filter(e => e.tankId === tank.id && e.date <= date);
const tankHarvests = harvests.filter(h => h.tankId === tank.id && h.date <= date);
const totalFeed = tankEntries.reduce((sum, e) => sum + e.amount, 0);
const totalHarvested = tankHarvests.reduce((sum, h) => sum + h.weight, 0);
const estimatedFCR = 1.2;
const biomass = Math.max(0, (totalFeed / estimatedFCR) - totalHarvested);
totalBiomass += biomass;
}
});
return totalBiomass;
});

if (this.charts.growth) {
this.charts.growth.destroy();
}

this.charts.growth = new Chart(canvas, {
type: 'line',
data: {
labels: dates.map(d => {
const date = new Date(d);
return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}),
datasets: [{
label: 'Total Biomass (kg)',
data: biomassData,
borderColor: 'rgb(156, 39, 176)',
backgroundColor: 'rgba(156, 39, 176, 0.1)',
tension: 0.4,
fill: true,
borderWidth: 2,
pointRadius: 3,
pointBackgroundColor: 'rgb(156, 39, 176)',
pointBorderColor: '#fff',
pointBorderWidth: 2
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
displayColors: false,
callbacks: {
label: function(context) {
return `Biomass: ${context.parsed.y.toFixed(1)} kg`;
}
}
}
},
scales: {
y: {
beginAtZero: true,
title: {
display: true,
text: 'Biomass (kg)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
callback: function(value) {
return value + ' kg';
}
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 },
maxRotation: 45,
minRotation: 0
}
}
}
}
});
}

renderComparisonChart(tanks, entries, harvests) {
const canvas = document.getElementById('comparisonChart');
if (!canvas) return;

// Calculate metrics for each tank
const tankMetrics = tanks.map(tank => {
const tankEntries = entries.filter(e => e.tankId === tank.id);
const tankHarvests = harvests.filter(h => h.tankId === tank.id);
const totalFeed = tankEntries.reduce((sum, e) => sum + e.amount, 0);
const totalHarvested = tankHarvests.reduce((sum, h) => sum + h.weight, 0);
const biomass = tank.biomass || 0;
const totalProduction = biomass + totalHarvested;
const fcr = totalProduction > 0 ? (totalFeed / totalProduction).toFixed(2) : 0;
const validChecks = tankEntries.filter(e => ['empty', 'little', 'half', 'too-much'].includes(e.trayResult));
const wasteChecks = validChecks.filter(e => ['half', 'too-much'].includes(e.trayResult));
const efficiency = validChecks.length > 0 ? (100 - ((wasteChecks.length / validChecks.length) * 100)).toFixed(0) : 0;
return {
name: tank.name,
fcr: parseFloat(fcr),
efficiency: parseFloat(efficiency),
feed: totalFeed
};
});

if (this.charts.comparison) {
this.charts.comparison.destroy();
}

this.charts.comparison = new Chart(canvas, {
type: 'bar',
data: {
labels: tankMetrics.map(t => t.name),
datasets: [
{
label: 'FCR',
data: tankMetrics.map(t => t.fcr),
backgroundColor: 'rgba(33, 150, 243, 0.8)',
borderColor: 'rgb(33, 150, 243)',
borderWidth: 1,
borderRadius: 4,
yAxisID: 'y'
},
{
label: 'Efficiency (%)',
data: tankMetrics.map(t => t.efficiency),
backgroundColor: 'rgba(76, 175, 80, 0.8)',
borderColor: 'rgb(76, 175, 80)',
borderWidth: 1,
borderRadius: 4,
yAxisID: 'y1'
}
]
},
options: {
responsive: true,
maintainAspectRatio: true,
aspectRatio: 2,
plugins: {
legend: {
display: true,
position: 'top',
labels: {
font: { family: 'Roboto', size: 12 },
padding: 15
}
},
tooltip: {
backgroundColor: 'rgba(0, 0, 0, 0.8)',
padding: 12,
titleFont: { family: 'Roboto', size: 13, weight: 'bold' },
bodyFont: { family: 'Roboto', size: 12 },
callbacks: {
label: function(context) {
if (context.datasetIndex === 0) {
return `FCR: ${context.parsed.y}`;
}
return `Efficiency: ${context.parsed.y}%`;
}
}
}
},
scales: {
y: {
beginAtZero: true,
position: 'left',
title: {
display: true,
text: 'FCR',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
color: 'rgba(0, 0, 0, 0.05)',
drawBorder: false
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
},
y1: {
beginAtZero: true,
max: 100,
position: 'right',
title: {
display: true,
text: 'Efficiency (%)',
font: { family: 'Roboto', size: 12, weight: '600' }
},
grid: {
drawOnChartArea: false,
},
ticks: {
font: { family: 'Roboto', size: 11 },
callback: function(value) {
return value + '%';
}
}
},
x: {
grid: {
display: false
},
ticks: {
font: { family: 'Roboto', size: 11 }
}
}
}
}
});
}

exportCharts() {
// Export chart data as JSON
const farmId = this.state.settings.farmId;
if (!farmId) return;

const farmTanks = this.state.tanks.filter(t => t.farmId === farmId);
const farmTankIds = farmTanks.map(t => t.id);
const farmFeedEntries = this.state.feedLogs.filter(e => farmTankIds.includes(e.tankId));
const farmWaterQuality = this.state.waterQuality.filter(w => farmTankIds.includes(w.tankId));
const farmHarvests = this.state.harvests.filter(h => farmTankIds.includes(h.tankId));

const chartData = {
feedConsumption: this.getFeedConsumptionData(farmFeedEntries),
fcrTrend: this.getFCRTrendData(farmFeedEntries, farmHarvests, farmTanks),
wasteTrend: this.getWasteTrendData(farmFeedEntries),
waterQuality: farmWaterQuality,
exportDate: new Date().toISOString()
};

const blob = new Blob([JSON.stringify(chartData, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const downloadAnchorNode = document.createElement('a');
downloadAnchorNode.setAttribute("href", url);
downloadAnchorNode.setAttribute("download", `aquarythu_charts_${this.getFormattedDate()}.json`);
document.body.appendChild(downloadAnchorNode);
downloadAnchorNode.click();
downloadAnchorNode.remove();
URL.revokeObjectURL(url);
this.showToast('Chart data exported successfully');
}

getFeedConsumptionData(entries) {
const dailyFeed = {};
entries.forEach(entry => {
if (!dailyFeed[entry.date]) {
dailyFeed[entry.date] = 0;
}
dailyFeed[entry.date] += entry.amount;
});
return dailyFeed;
}

getFCRTrendData(entries, harvests, tanks) {
// Simplified - return weekly FCR data
return { message: 'FCR trend data calculated weekly' };
}

getWasteTrendData(entries) {
const dailyWaste = {};
entries.forEach(entry => {
if (!entry.date) return;
if (!dailyWaste[entry.date]) {
dailyWaste[entry.date] = { total: 0, waste: 0 };
}
dailyWaste[entry.date].total++;
if (entry.trayResult === 'half' || entry.trayResult === 'too-much') {
dailyWaste[entry.date].waste++;
}
});
return dailyWaste;
}

toggleHistoryDetails(entryId) {
const details = document.getElementById('historyDetails' + entryId);
if (!details) return;

const isVisible = details.style.display !== 'none';
details.style.display = isVisible ? 'none' : 'block';

const row = details.parentElement;
const chevron = row.querySelector('.fa-chevron-down');
if (chevron) {
chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
chevron.style.transition = 'transform 0.2s';
}
}

// ===== TRAY FEED LOG BOOK HELPERS =====

adjustTrayFeed(delta) {
    const amountEl = document.getElementById('trayFeedAmount');
    if (!amountEl) return;
    
    let current = 0;
    if (amountEl.tagName === 'INPUT') {
        current = parseFloat(amountEl.value) || 0;
    } else {
        current = parseFloat(amountEl.textContent) || 0;
    }
    
    current = Math.max(0, +(current + delta).toFixed(1));
    
    if (amountEl.tagName === 'INPUT') {
        amountEl.value = current.toFixed(2);
    } else {
        amountEl.innerHTML = `${current.toFixed(2)} <span class="unit">kg</span>`;
    }
}

async logTrayFeed(tankId, roundNumber) {
    const amountEl = document.getElementById('trayFeedAmount');
    if (!amountEl) return;
    
    let amount = 0;
    if (amountEl.tagName === 'INPUT') {
        amount = parseFloat(amountEl.value) || 0;
    } else {
        amount = parseFloat(amountEl.textContent) || 0;
    }

    if (amount <= 0) {
        this.showToast('Please enter a valid feed amount', 'error');
        return;
    }

    // HARD LOCK: Check if previous round for today has pending tray status
    const tank = this.getTankById(tankId);
    if (!tank) return;

    const now = new Date();
    const dateStr = this.getFormattedDate(now);
    
    const todayEntries = this.state.feedLogs.filter(e => 
        e.tankId === tankId && e.date === dateStr
    ).sort((a, b) => a.id - b.id);

    if (todayEntries.length > 0) {
        const lastEntry = todayEntries[todayEntries.length - 1];
        if (lastEntry.trayResult === 'pending') {
            this.showToast('⚠️ Locked: Complete previous tray check first.', 'error');
            // Refresh UI to show lock card
            const planContainer = document.getElementById('logFeedPlanContainer');
            if (planContainer) {
                const doc = this.getDaysOld(tank.stockingDate);
                planContainer.innerHTML = this.renderTrayFeedLogBookSimple(tankId, tank, doc);
            }
            return;
        }
    }

    const currentStock = this.state.inventory.totalKg || 0;
    if (amount > currentStock) {
         this.showToast(`⚠ Low Inventory: You have ${currentStock.toFixed(1)}kg in stock.`, 'warning', 4000);
    }
    
    const newInventoryTotal = currentStock - amount;
    if (newInventoryTotal < 0) {
        this.showToast(`Cannot feed ${amount}kg. Insufficient inventory.`, 'error');
        return;
    }

    const confirmed = await this.showConfirmModal(
        `Log ${amount.toFixed(2)} kg for Round ${roundNumber}?`,
        'Confirm Feed',
        'Log Feed',
        'Cancel'
    );

    if (!confirmed) return;

    const doc = this.getDaysOld(tank.stockingDate);

    const newEntry = {
        id: Date.now(),
        tankId: tankId,
        pondId: tankId,
        farmId: this.state.settings.farmId,
        date: dateStr,
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        amount: amount,
        feedKg: amount,
        doc: doc,
        round: roundNumber,
        feed_round_number: roundNumber,
        trayResult: 'pending',
        trayResults: [],
        supplements: [],
        feeding_mode: 'TRAY',
        createdBy: this.userId,
        createdAt: now.toISOString(),
        is_extra_feed: false
    };

    this.state.feedLogs.push(newEntry);
    this.state.inventory.totalKg = newInventoryTotal;

    const logBtn = document.getElementById('logTrayFeedBtn');
    if (logBtn) {
        logBtn.disabled = true;
        logBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    document.querySelectorAll('.btn-stepper-sm').forEach(btn => btn.disabled = true);

    try {
        if (this.db && this.userId) {
            const batch = this.db.batch();
            const feedLogRef = this.db.collection('feedLogs').doc(String(newEntry.id));
            
            const firestoreEntry = {
                farmId: newEntry.farmId,
                pondId: newEntry.pondId,
                doc: newEntry.doc,
                round: newEntry.round,
                feedKg: newEntry.feedKg,
                createdBy: newEntry.createdBy,
                createdAt: newEntry.createdAt,
                date: newEntry.date,
                time: newEntry.time,
                amount: newEntry.amount,
                trayResult: newEntry.trayResult,
                feeding_mode: newEntry.feeding_mode,
                feed_round_number: newEntry.feed_round_number
            };
            
            batch.set(feedLogRef, firestoreEntry);

            const farmDailyId = `${newEntry.farmId}_${dateStr.replace(/-/g, '_')}`;
            const farmDailyRef = this.db.collection('farmDaily').doc(farmDailyId);
            
            const todayLogs = this.state.feedLogs.filter(e => e.date === dateStr);
            const totalFeedKg = todayLogs.reduce((sum, e) => sum + (e.feedKg || e.amount || 0), 0);
            const roundsDone = new Set(todayLogs.map(e => `${e.pondId || e.tankId}_${e.round || e.feed_round_number}`)).size;

            batch.set(farmDailyRef, {
                totalFeedKg,
                roundsDone,
                lastFeedKg: newEntry.feedKg,
                updatedAt: now.toISOString()
            }, { merge: true });

            const inventoryRef = this.db.collection('inventory').doc(this.state.settings.farmId);
            batch.set(inventoryRef, { totalKg: newInventoryTotal }, { merge: true });

            await batch.commit();
        } else {
            this.saveFeedEntry(newEntry);
            this.saveInventory();
        }

        this.recalculateTankBiomass(tankId, true);
        this.updateTankLifecycleState(tankId);
        this.detectFeedJump(tankId, amount);
        
        this.showToast('Feed logged successfully', 'success');
        
        if (logBtn) logBtn.style.display = 'none';
        const statusEl = document.getElementById('feedLoggedStatus');
        if (statusEl) statusEl.style.display = 'block';

        setTimeout(() => {
            const planContainer = document.getElementById('logFeedPlanContainer');
            if (planContainer) {
                planContainer.innerHTML = this.renderTrayFeedLogBookSimple(tankId, tank, doc);
            }
        }, 1000);

    } catch (e) {
        console.error('Failed to log tray feed:', e);
        this.state.feedLogs.pop();
        this.state.inventory.totalKg = currentStock;
        this.showToast('Failed to save feed. Please try again.', 'error');
        if (logBtn) {
            logBtn.disabled = false;
            logBtn.textContent = 'Log';
        }
        document.querySelectorAll('.btn-stepper-sm').forEach(btn => btn.disabled = false);
    }
}

switchHistoryTab(tab, clickedEl) {
    document.querySelectorAll('.history-tab').forEach(t => {
        t.classList.remove('active');
    });
    if (clickedEl) clickedEl.classList.add('active');
    
    document.querySelectorAll('.history-content').forEach(c => c.style.display = 'none');
    
    const contentId = tab === 'today' ? 'historyToday' : 
                      tab === 'yesterday' ? 'historyYesterday' : 'historyLast7Days';
    const content = document.getElementById(contentId);
    if (content) content.style.display = 'block';
}

// ===== SIMPLIFIED TRAY FEED LOG BOOK (Matching User Design) =====

renderTrayFeedLogBookSimple(tankId, tank, doc) {
const todayEntries = this.state.feedLogs.filter(e => 
e.tankId === tankId && e.date === this.currentDate
).sort((a, b) => a.id - b.id);

const totalRounds = this.state.settings.feedsPerDay || 4;
const currentRound = todayEntries.length + 1;
const lastTodayEntry = todayEntries[todayEntries.length - 1];

// Get the LAST entry from ANY day for this tank (for calculating suggestion)
const allEntries = this.state.feedLogs.filter(e => e.tankId === tankId).sort((a, b) => b.id - a.id);
const lastEntryEver = allEntries[0];

// For UI locking, only check today's last entry
const hasTrayStatus = lastTodayEntry && (
(lastTodayEntry.trayResults && lastTodayEntry.trayResults.length > 0) ||
lastTodayEntry.trayResult !== 'pending'
);
const canShowNextFeed = !lastTodayEntry || hasTrayStatus;
const isLocked = lastTodayEntry && !hasTrayStatus && currentRound <= totalRounds;

// Calculate suggested feed based on LAST tray results (from any day)
let suggestedAmount = 2.0;
let reasonText = 'Starting amount';

// Use the most recent entry with tray results for calculation
const entryForSuggestion = lastEntryEver;

if (entryForSuggestion) {
const lastAmount = entryForSuggestion.amount;
const trayResults = entryForSuggestion.trayResults || [];
const trayStatus = entryForSuggestion.trayResult;

// Check if this entry has valid tray results
const hasValidTrayResult = (trayResults.length > 0) || 
(trayStatus && trayStatus !== 'pending' && trayStatus !== 'blind-fed');

if (trayResults.length > 0) {
// Count tray results
const tooMuchCount = trayResults.filter(r => r === 'too-much').length;
const halfCount = trayResults.filter(r => r === 'half').length;
const emptyCount = trayResults.filter(r => r === 'empty').length;
const littleCount = trayResults.filter(r => r === 'little').length;
const totalTrays = trayResults.length;

if (tooMuchCount > 0) {
suggestedAmount = +(lastAmount * 0.8).toFixed(1);
reasonText = '⬇ Reduced 20% – leftover feed detected';
} else if (halfCount / totalTrays > 0.5) {
suggestedAmount = +(lastAmount * 0.9).toFixed(1);
reasonText = '⬇ Reduced 10% – half feed left in majority';
} else if (emptyCount === totalTrays) {
suggestedAmount = +(lastAmount * 1.1).toFixed(1);
reasonText = '⬆ Increased 10% – all trays empty';
} else if (emptyCount + littleCount === totalTrays) {
suggestedAmount = lastAmount;
reasonText = '➡ Same – good consumption';
} else {
suggestedAmount = lastAmount;
reasonText = '➡ Same – mixed tray results';
}
} else if (trayStatus === 'too-much') {
suggestedAmount = +(lastAmount * 0.8).toFixed(1);
reasonText = '⬇ Reduced 20% – leftover feed';
} else if (trayStatus === 'half') {
suggestedAmount = +(lastAmount * 0.9).toFixed(1);
reasonText = '⬇ Reduced 10% – half feed left';
} else if (trayStatus === 'little') {
suggestedAmount = lastAmount;
reasonText = '➡ Same – little left is OK';
} else if (trayStatus === 'empty') {
suggestedAmount = +(lastAmount * 1.1).toFixed(1);
reasonText = '⬆ Increased 10% – all eaten';
} else if (trayStatus === 'blind-fed') {
suggestedAmount = lastAmount;
reasonText = '➡ Transition from Blind Phase';
} else {
// No tray result yet or pending - use same amount
suggestedAmount = lastAmount;
reasonText = '➡ Continue with previous amount';
}
}

suggestedAmount = Math.max(0.1, suggestedAmount);

// Get suggested time for next feed
const feedTimes = this.state.settings.feedTimes || [6, 10, 14, 18];
const nextFeedHour = feedTimes[currentRound - 1] || 12;
const nextTime = new Date();
nextTime.setHours(nextFeedHour, 0, 0);
const timeStr = nextTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

let html = '';

// LAST FEED ROUND CARD - show today's last entry
if (lastTodayEntry) {
html += this.renderLastFeedRoundCardSimple(lastTodayEntry, todayEntries.length);
}

// NEXT FEED SUGGESTION CARD
if (currentRound <= totalRounds) {
if (canShowNextFeed) {
html += this.renderNextFeedCardSimple(tankId, currentRound, suggestedAmount, reasonText, timeStr);
} else {
html += this.renderTrayCheckRequiredCardSimple(tankId, lastTodayEntry);
}
} else {
html += this.renderAllRoundsCompletedCardSimple(totalRounds);
}

// FEED HISTORY
html += this.renderFeedHistorySimple(tankId);

return html;
}

renderLastFeedRoundCardSimple(entry, roundNumber) {
// Format time
const timeStr = entry.time || '--:--';

// Build supplements text
let supplementsText = 'None';
if (entry.supplements && entry.supplements.length > 0) {
supplementsText = entry.supplements.join(' · ');
}

// Build tray chips
let trayChipsHTML = '';
if (entry.trayResults && entry.trayResults.length > 0) {
entry.trayResults.forEach((status, i) => {
let chipClass = 'ok';
let chipText = `✓`;
if (status === 'half') { chipClass = 'half'; chipText = '◔'; }
else if (status === 'too-much') { chipClass = 'left'; chipText = '✕'; }
else if (status === 'little') { chipClass = 'half'; chipText = '●'; }

trayChipsHTML += `<div class="tray-chip ${chipClass}">Tray ${i + 1} ${chipText}</div>`;
});
} else if (entry.trayResult && entry.trayResult !== 'pending') {
let chipClass = 'ok';
let chipText = '✓';
if (entry.trayResult === 'half') { chipClass = 'half'; chipText = '◔'; }
else if (entry.trayResult === 'too-much') { chipClass = 'left'; chipText = '✕'; }
else if (entry.trayResult === 'little') { chipClass = 'half'; chipText = '●'; }
trayChipsHTML = `<div class="tray-chip ${chipClass}">Tray ${chipText}</div>`;
}

return `
<div class="feed-card">
<h3 class="card-title">Last Feed Round</h3>
<div class="feed-row">
<span>⏰ ${timeStr}</span>
<strong>${entry.amount} kg</strong>
</div>
<div class="muted">Supplements: ${supplementsText}</div>
<div class="tray-chips">
${trayChipsHTML}
</div>
</div>
`;
}

renderNextFeedCardSimple(tankId, roundNumber, suggestedAmount, reasonText, timeStr) {
return `
<div class="feed-card">
<div class="feed-round-header">
<div class="feed-round-info">Feed ${roundNumber} · ${timeStr}</div>
<div class="feed-round-action-row">
<div style="display:flex; align-items:baseline; gap:4px;">
    <input type="number" id="trayFeedAmount" value="${suggestedAmount.toFixed(2)}" step="0.1" min="0" onfocus="this.select()"
           style="font-size: 24px; font-weight: 800; color: var(--primary); width: 100px; border: none; border-bottom: 2px solid var(--border); text-align: right; padding: 0; background: transparent; -moz-appearance: textfield;">
    <span class="unit" style="font-size: 14px; color: var(--gray); font-weight: 600;">kg</span>
</div>
<button class="btn-log-compact" id="logTrayFeedBtn" onclick="app.logTrayFeed('${this.escapeAttribute(String(tankId))}', ${roundNumber})">
Log
</button>
</div>
</div>
<div class="feed-stepper-row">
<button class="btn-stepper-sm" onclick="app.adjustTrayFeed(-0.1)">−</button>
<div class="muted" id="reasonText">${reasonText}</div>
<button class="btn-stepper-sm" onclick="app.adjustTrayFeed(0.1)">+</button>
</div>
<div class="status-text" id="feedLoggedStatus" style="display: none;">
✔ Feed logged. Waiting for tray check
</div>
</div>
`;
}

renderTrayCheckRequiredCardSimple(tankId, lastEntry) {
return `
<div class="feed-card locked">
<h3 class="card-title">Next Feed Locked 🔒</h3>
<div class="locked-message">
<i class="fas fa-lock" style="font-size: 32px; color: #f59e0b; margin-bottom: 12px;"></i>
<p>Update tray status for the last feed before proceeding.</p>
<button class="btn-warning-feed" onclick="app.openTrayCheckPopup('${this.escapeAttribute(String(tankId))}', ${lastEntry.id})">
Update Tray Status
</button>
</div>
</div>
`;
}

renderAllRoundsCompletedCardSimple(totalRounds) {
return `
<div class="feed-card completed">
<h3 class="card-title">All Rounds Completed ✓</h3>
<div class="completed-message">
<i class="fas fa-check-circle" style="font-size: 32px; color: var(--success); margin-bottom: 12px;"></i>
<p>You have completed all ${totalRounds} feeding rounds for today.</p>
</div>
</div>
`;
}

renderFeedHistorySimple(tankId) {
// Get entries for different time periods
const today = this.currentDate;
const yesterday = this.getFormattedDate(new Date(Date.now() - 86400000));

const todayEntries = this.state.feedLogs.filter(e => 
e.tankId === tankId && e.date === today
).sort((a, b) => b.id - a.id);

const yesterdayEntries = this.state.feedLogs.filter(e => 
e.tankId === tankId && e.date === yesterday
).sort((a, b) => b.id - a.id);

const last7DaysEntries = this.state.feedLogs.filter(e => {
if (e.tankId !== tankId) return false;
const entryDate = new Date(e.date);
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
return entryDate >= sevenDaysAgo;
}).sort((a, b) => b.id - a.id);

// Build history rows for today (default view)
let todayRowsHTML = '';
if (todayEntries.length === 0) {
todayRowsHTML = '<div class="history-empty">No feeds logged today</div>';
} else {
todayEntries.forEach(entry => {
todayRowsHTML += `
<div class="history-row">
<span>${entry.time || '--:--'}</span>
<span>${entry.amount} kg</span>
<span class="muted">${entry.feeding_mode === 'TRAY' ? 'Tray' : 'Blind'}</span>
</div>
`;
});
}

// Build yesterday rows
let yesterdayRowsHTML = '';
if (yesterdayEntries.length === 0) {
yesterdayRowsHTML = '<div class="history-empty">No feeds yesterday</div>';
} else {
yesterdayEntries.forEach(entry => {
yesterdayRowsHTML += `
<div class="history-row">
<span>${entry.time || '--:--'}</span>
<span>${entry.amount} kg</span>
<span class="muted">${entry.feeding_mode === 'TRAY' ? 'Tray' : 'Blind'}</span>
</div>
`;
});
}

// Build last 7 days rows
let last7RowsHTML = '';
if (last7DaysEntries.length === 0) {
last7RowsHTML = '<div class="history-empty">No feeds in last 7 days</div>';
} else {
last7DaysEntries.slice(0, 20).forEach(entry => {
const dateDisplay = new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
last7RowsHTML += `
<div class="history-row">
<span>${dateDisplay} ${entry.time || '--:--'}</span>
<span>${entry.amount} kg</span>
<span class="muted">${entry.feeding_mode === 'TRAY' ? 'Tray' : 'Blind'}</span>
</div>
`;
});
}

return `
<div class="feed-card">
<h3 class="card-title">Feed History</h3>
<div class="history-tabs">
<div class="history-tab active" onclick="app.switchHistoryTab('today', this)">Today</div>
<div class="history-tab" onclick="app.switchHistoryTab('yesterday', this)">Yesterday</div>
<div class="history-tab" onclick="app.switchHistoryTab('7days', this)">Last 7 Days</div>
</div>
<div class="history-content" id="historyToday" style="display: block;">
${todayRowsHTML}
</div>
<div class="history-content" id="historyYesterday" style="display: none;">
${yesterdayRowsHTML}
</div>
<div class="history-content" id="historyLast7Days" style="display: none;">
${last7RowsHTML}
</div>
</div>
`;
}

}

document.addEventListener('DOMContentLoaded', () => {
window.app = new AquaRythu();
});

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('Service Worker registered'))
      .catch(error => console.log('Service Worker registration failed:', error));
  });
}

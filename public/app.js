/**************************************
 * Firebase Phone OTP Login – STEP 2
 * AquaBook Pro
 **************************************/

/* 1️⃣ Firebase SDKs (Compat for simplicity) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js";

/* 2️⃣ Firebase Configuration
   👉 REPLACE with YOUR Firebase project config
   (Firebase Console → Project Settings → General → Web App)
*/
const firebaseConfig = {
  apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw",
  authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
  projectId: "coastal-fresh---sea-foods",
  storageBucket: "coastal-fresh---sea-foods.firebasestorage.app",
  messagingSenderId: "782759620106",
  appId: "1:782759620106:web:960ec7c125faa30675f9f3",
  measurementId: "G-468VYWGBHM"
};

/* 3️⃣ Initialize Firebase */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
auth.useDeviceLanguage();

/* 4️⃣ DOM Elements */
const phoneInput = document.getElementById("phone");
const otpInput = document.getElementById("otp");
const sendOtpBtn = document.getElementById("sendOtpBtn");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const otpSection = document.getElementById("otpSection");
const logoutBtn = document.getElementById("logoutBtn");

let failedAttempts = 0;
const MAX_ATTEMPTS = 3;
let countdownInterval;
const RESEND_DELAY = 60;

/* VIEW ELEMENTS */
const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");

/* AUTH STATE LISTENER */
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginView.style.display = "none";
    dashboardView.style.display = "block";
    
    // Cleanup previous instance if exists to prevent data leaks
    if (window.app) window.app.destroy();
    
    // Initialize Dashboard App with Firestore
    window.app = new DashboardApp(user);
  } else {
    if (window.app) {
      window.app.destroy();
      window.app = null;
    }
    loginView.style.display = "flex";
    dashboardView.style.display = "none";
  }
});

/* NEW: Real-time Phone Number Validation */
phoneInput.addEventListener("input", () => {
  // Regex for E.164 format: starts with '+', followed by 11 to 14 digits.
  // This covers formats like +919876543210.
  const phoneRegex = /^\+\d{11,14}$/;
  const phoneNumber = phoneInput.value.trim();
  const isValid = phoneRegex.test(phoneNumber);
  // Enable the button only if the phone number is valid
  sendOtpBtn.disabled = !isValid;
});

/* 5️⃣ Setup reCAPTCHA */
document.addEventListener("DOMContentLoaded", () => {
  window.recaptchaVerifier = new RecaptchaVerifier(
    "recaptcha-container",
    {
      size: "normal",
      callback: () => {
        console.log("reCAPTCHA solved");
      }
    },
    auth
  );

  window.recaptchaVerifier.render();
});

/* 6️⃣ Send OTP */
sendOtpBtn.addEventListener("click", () => {
  const phoneNumber = phoneInput.value.trim();

  sendOtpBtn.disabled = true;
  sendOtpBtn.innerText = "Sending...";

  signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier)
    .then((confirmationResult) => {
      window.confirmationResult = confirmationResult;
      failedAttempts = 0;

      // Show OTP section
      if (otpSection) {
        otpSection.classList.remove("hidden");
        otpSection.style.display = "block";
        setTimeout(() => otpInput.focus(), 0);
      }
      startResendTimer();

      alert("OTP sent successfully");
    })
    .catch((error) => {
      console.error(error);
      alert(error.message);
      sendOtpBtn.disabled = false;
      sendOtpBtn.innerText = "Send OTP";
    });
});

/* 7️⃣ Verify OTP */
verifyOtpBtn.addEventListener("click", () => {
  const otp = otpInput.value.trim();

  if (!otp) {
    alert("Please enter OTP");
    return;
  }

  window.confirmationResult
    .confirm(otp)
    .then((result) => {
      clearInterval(countdownInterval);
      sendOtpBtn.innerText = "Send OTP";
      sendOtpBtn.classList.remove("resend-active");
      
      // Reset UI
      otpInput.value = "";
      sendOtpBtn.disabled = false;

      const user = result.user;
      console.log("Login success:", user.phoneNumber);

      alert("Login successful 🎉");
    })
    .catch((error) => {
      console.error(error);
      failedAttempts++;

      if (failedAttempts >= MAX_ATTEMPTS) {
        alert("Too many failed attempts. Please request a new OTP.");
        clearInterval(countdownInterval);
        sendOtpBtn.innerText = "Send OTP";
        sendOtpBtn.classList.remove("resend-active");
        // Reset UI to allow requesting a new OTP
        if (otpSection) {
          otpSection.classList.add("hidden");
          otpSection.style.display = "none";
        }
        sendOtpBtn.disabled = false;
        otpInput.value = "";
      } else {
        alert(`Invalid OTP. ${MAX_ATTEMPTS - failedAttempts} attempts remaining.`);
      }
    });
});

/* 8️⃣ Handle Enter Key in OTP Input */
otpInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    verifyOtpBtn.click();
  }
});

function startResendTimer() {
  let timeLeft = RESEND_DELAY;
  sendOtpBtn.disabled = true;
  sendOtpBtn.classList.remove("resend-active");
  sendOtpBtn.innerText = `Resend in ${timeLeft}s`;

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      sendOtpBtn.disabled = false;
      sendOtpBtn.innerText = "Resend OTP";
      sendOtpBtn.classList.add("resend-active");
    } else {
      sendOtpBtn.innerText = `Resend in ${timeLeft}s`;
    }
  }, 1000);
}

/* 9️⃣ Logout Logic */
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to logout?")) {
      signOut(auth).catch((error) => {
        console.error("Logout error", error);
      });
    }
  });
}

/* =========================================
   DASHBOARD APP LOGIC (Firestore Backed)
   ========================================= */
class DashboardApp {
  constructor(user) {
    this.user = user;
    this.state = {
      tanks: [],
      feedEntries: [],
      trayChecks: []
    };
    this.listeners = []; // Track Firestore listeners
    this.currentDate = this.getFormattedDate();
    this.selectedTrayStatus = null;
    
    this.init();
  }

  getFormattedDate(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getTimeString() {
    const d = new Date();
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  init() {
    this.updateDateDisplay();
    this.setupEventListeners();
    this.subscribeToData();
  }

  updateDateDisplay() {
    const date = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const el = document.getElementById('currentDate');
    if(el) el.textContent = date.toLocaleDateString('en-IN', options);
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const screen = e.currentTarget.dataset.screen;
        this.switchScreen(screen);
      });
    });

    // Close modals
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeAllModals();
      });
    });
  }

  subscribeToData() {
    // 1. Subscribe to Tanks
    const tanksQuery = query(collection(db, "tanks"), where("uid", "==", this.user.uid));
    this.listeners.push(onSnapshot(tanksQuery, (snapshot) => {
      this.state.tanks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.renderHomeScreen();
    }));

    // 2. Subscribe to Feed Logs
    // Removed orderBy to avoid "Missing Index" error. Sorting is handled in render functions.
    const feedQuery = query(collection(db, "feedLogs"), where("uid", "==", this.user.uid));
    this.listeners.push(onSnapshot(feedQuery, (snapshot) => {
      this.state.feedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.renderHomeScreen();
      this.renderLogScreen();
    }));

    // 3. Subscribe to Tray Checks
    const trayQuery = query(collection(db, "trayChecks"), where("uid", "==", this.user.uid));
    this.listeners.push(onSnapshot(trayQuery, (snapshot) => {
      this.state.trayChecks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this.renderHomeScreen();
      this.renderLogScreen();
    }));
  }

  destroy() {
    // Unsubscribe from all Firestore listeners
    this.listeners.forEach(unsub => unsub());
    this.listeners = [];
  }

  switchScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${screenName}Screen`).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.dataset.screen === screenName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    if (screenName === 'log') {
      this.renderLogScreen();
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.selectedTrayStatus = null;
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const messageEl = document.getElementById('toastMessage');

    messageEl.textContent = message;
    toast.className = 'toast';
    toast.classList.add(type);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ===== HOME SCREEN RENDERING =====
  renderHomeScreen() {
    this.updateStats();
    this.renderTanksList();
    this.updateRecommendation();
  }

  updateStats() {
    const today = this.currentDate;
    const allEntries = this.state.feedEntries;

    // Total Feed
    const totalFeed = allEntries.reduce((sum, entry) => sum + entry.amount, 0);
    document.getElementById('totalFeed').textContent = totalFeed.toFixed(1);

    // Feed Today
    const feedToday = allEntries
      .filter(e => e.date === today)
      .reduce((sum, e) => sum + e.amount, 0);
    document.getElementById('feedToday').textContent = feedToday.toFixed(1);

    // FCR Calculations
    let totalBiomass = 0;
    this.state.tanks.forEach(tank => {
      // Simple biomass estimation: 80% survival, 20g average weight
      const estimatedBiomass = (tank.stock * 0.8 * 0.02) / 1000; // Convert to kg
      totalBiomass += estimatedBiomass;
    });

    // Overall FCR
    const overallFCR = totalBiomass > 0 ? (totalFeed / totalBiomass) : 0;
    document.getElementById('fcrValue').textContent = overallFCR.toFixed(2);
    document.getElementById('avgFCR').textContent = overallFCR.toFixed(2);

    // Feed Waste Percentage
    const trayChecks = this.state.trayChecks;
    const wasteChecks = trayChecks.filter(t => t.result === 'half' || t.result === 'too-much').length;
    const wastePercent = trayChecks.length > 0 ? ((wasteChecks / trayChecks.length) * 100) : 0;
    document.getElementById('feedWaste').textContent = wastePercent.toFixed(0) + '%';
  }

  renderTanksList() {
    const container = document.getElementById('tanksList');
    const today = this.currentDate;

    if (this.state.tanks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-water"></i>
            <h3>No Tanks Yet</h3>
            <p>Add your first tank to start tracking</p>
            <button class="btn btn-primary mt-20" onclick="app.openTankModal()">
                <i class="fas fa-plus"></i> Add Tank
            </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.tanks.map(tank => {
      const tankEntries = this.state.feedEntries.filter(e => e.tankId === tank.id);
      const todayEntries = tankEntries.filter(e => e.date === today);
      const todayFeed = todayEntries.reduce((sum, e) => sum + e.amount, 0);

      // Get latest tray check status
      const latestCheck = this.state.trayChecks
        .filter(t => this.state.feedEntries.find(e => e.id === t.entryId && e.tankId === tank.id))
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

      let status = 'good';
      let statusText = 'Good';
      if (latestCheck) {
        if (latestCheck.result === 'too-much') { status = 'danger'; statusText = 'Waste'; }
        else if (latestCheck.result === 'half') { status = 'warning'; statusText = 'Overfed'; }
      }

      return `
        <div class="tank-card ${status}">
            <div class="tank-header">
                <div class="tank-name">${tank.name}</div>
                <div class="tank-doc">${tank.size} ac</div>
            </div>
            
            <div class="tank-stats">
                <div class="tank-stat">
                    <div class="tank-stat-label">Stock</div>
                    <div class="tank-stat-value">${(tank.stock/1000).toFixed(0)}K</div>
                </div>
                <div class="tank-stat">
                    <div class="tank-stat-label">Feed Today</div>
                    <div class="tank-stat-value">${todayFeed.toFixed(1)} kg</div>
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                <div style="font-size: 12px; color: var(--gray);">
                    Status: <span style="font-weight: 600; color: var(--${status});">${statusText}</span>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="app.logFeedForTank('${tank.id}')" style="padding: 4px 12px;">
                    <i class="fas fa-plus"></i> Feed
                </button>
            </div>
        </div>
      `;
    }).join('');
  }

  updateRecommendation() {
    const today = this.currentDate;
    const yesterday = this.getFormattedDate(new Date(Date.now() - 86400000));
    const recommendationEl = document.getElementById('recommendationCard');
    const textEl = document.getElementById('recommendationText');
    const actionEl = document.getElementById('recommendationAction');

    if (this.state.trayChecks.length === 0) {
      textEl.textContent = "Start logging feed and checking trays to get smart recommendations.";
      actionEl.textContent = "Add your first feed entry";
      return;
    }

    const recentChecks = this.state.trayChecks.filter(t => t.date === today || t.date === yesterday);

    if (recentChecks.length === 0) {
      textEl.textContent = "No recent tray checks. Check your feed trays after feeding.";
      actionEl.textContent = "Check trays now";
      return;
    }

    const emptyCount = recentChecks.filter(t => t.result === 'empty').length;
    const wasteCount = recentChecks.filter(t => t.result === 'half' || t.result === 'too-much').length;

    if (wasteCount > 0) {
      textEl.textContent = `${wasteCount} tray(s) showed overfeeding (Half/Too Much).`;
      actionEl.textContent = "Reduce next feed by 10-20%";
      recommendationEl.style.background = '#ffebee';
      recommendationEl.style.borderColor = 'var(--danger)';
    } else if (emptyCount >= 2) {
      textEl.textContent = `${emptyCount} tray(s) were completely empty.`;
      actionEl.textContent = "Increase next feed by 5-10%";
      recommendationEl.style.background = '#e8f5e9';
      recommendationEl.style.borderColor = 'var(--success)';
    } else {
      textEl.textContent = "Feed consumption looks balanced. Continue current feeding schedule.";
      actionEl.textContent = "Maintain current amounts";
      recommendationEl.style.background = '#fff3e0';
      recommendationEl.style.borderColor = 'var(--warning)';
    }
  }

  // ===== LOG BOOK RENDERING =====
  renderLogScreen() {
    this.renderTodayLog();
    this.renderRecentLog();
  }

  renderTodayLog() {
    const today = this.currentDate;
    const todayEntries = this.state.feedEntries
      .filter(e => e.date === today)
      .sort((a, b) => {
        // Handle Firestore Timestamp or fallback to time string comparison
        if (a.timestamp && b.timestamp) return b.timestamp.seconds - a.timestamp.seconds;
        return b.time.localeCompare(a.time);
      });

    const container = document.getElementById('todayLogRows');

    if (todayEntries.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: var(--gray);">
            <i class="fas fa-utensils" style="font-size: 36px; opacity: 0.5; margin-bottom: 12px;"></i>
            <p>No feed entries today</p>
        </div>
      `;
      return;
    }

    container.innerHTML = todayEntries.map(entry => {
      const tank = this.state.tanks.find(t => t.id === entry.tankId);
      const trayCheck = this.state.trayChecks.find(t => t.entryId === entry.id);

      let trayBadge = '<span style="color: var(--gray); font-size: 12px;">Pending</span>';
      if (trayCheck) {
        const badgeClass = `tray-${trayCheck.result.replace(' ', '-')}`;
        trayBadge = `<span class="tray-badge ${badgeClass}">${trayCheck.result}</span>`;
      }

      return `
        <div class="log-row">
            <div>${entry.time}</div>
            <div>${tank ? tank.name : 'Unknown'}</div>
            <div style="font-weight: 600;">${entry.amount} kg</div>
            <div>${trayBadge}</div>
        </div>
      `;
    }).join('');
  }

  renderRecentLog() {
    // Sort by timestamp descending
    const recentEntries = [...this.state.feedEntries]
      .sort((a, b) => {
        if (a.timestamp && b.timestamp) return b.timestamp.seconds - a.timestamp.seconds;
        return new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time);
      })
      .slice(0, 10);
      
    const container = document.getElementById('recentLogRows');

    if (recentEntries.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: var(--gray);">
            <i class="fas fa-history" style="font-size: 36px; opacity: 0.5; margin-bottom: 12px;"></i>
            <p>No feed history</p>
        </div>
      `;
      return;
    }

    container.innerHTML = recentEntries.map(entry => {
      const tank = this.state.tanks.find(t => t.id === entry.tankId);
      const trayCheck = this.state.trayChecks.find(t => t.entryId === entry.id);

      // Format date
      const dateObj = new Date(entry.date);
      const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      let result = '-';
      if (trayCheck) {
        result = trayCheck.result;
      }

      return `
        <div class="log-row">
            <div>${dateStr}</div>
            <div>${tank ? tank.name : 'Unknown'}</div>
            <div style="font-weight: 600;">${entry.amount} kg</div>
            <div>${result}</div>
        </div>
      `;
    }).join('');
  }

  // ===== MODAL FUNCTIONS =====
  openTankModal() {
    document.getElementById('tankName').value = '';
    document.getElementById('tankSize').value = '';
    document.getElementById('tankStock').value = '';
    document.getElementById('tankModal').classList.add('active');
  }

  async saveTank() {
    const name = document.getElementById('tankName').value;
    const size = parseFloat(document.getElementById('tankSize').value);
    const stock = parseInt(document.getElementById('tankStock').value);

    if (!name || !size || !stock) {
      this.showToast('Please fill all fields', 'error');
      return;
    }

    try {
      await addDoc(collection(db, "tanks"), {
        uid: this.user.uid,
        name,
        size,
        stock,
        createdAt: serverTimestamp()
      });
      this.closeAllModals();
      this.showToast('Tank added successfully');
    } catch (error) {
      console.error("Error adding tank: ", error);
      this.showToast('Error adding tank', 'error');
    }
  }

  openLogFeedModal() {
    const select = document.getElementById('feedTankSelect');
    select.innerHTML = '';

    this.state.tanks.forEach(tank => {
      const option = document.createElement('option');
      option.value = tank.id;
      option.textContent = tank.name;
      select.appendChild(option);
    });

    // Set default time-based round
    const hour = new Date().getHours();
    let defaultRound = 'morning';
    if (hour >= 12 && hour < 17) defaultRound = 'afternoon';
    else if (hour >= 17) defaultRound = 'evening';

    document.getElementById('feedRound').value = defaultRound;
    document.getElementById('feedAmount').value = '';

    document.getElementById('logFeedModal').classList.add('active');
  }

  logFeedForTank(tankId) {
    this.openLogFeedModal();
    document.getElementById('feedTankSelect').value = tankId;
  }

  async saveFeedEntry() {
    const tankId = document.getElementById('feedTankSelect').value;
    const round = document.getElementById('feedRound').value;
    const amount = parseFloat(document.getElementById('feedAmount').value);
    const feedType = document.getElementById('feedType').value;

    if (!tankId || !amount || amount <= 0) {
      this.showToast('Please enter valid amount', 'error');
      return;
    }

    try {
      await addDoc(collection(db, "feedLogs"), {
        uid: this.user.uid,
        tankId,
        date: this.currentDate,
        time: this.getTimeString(),
        round,
        amount,
        feedType,
        timestamp: serverTimestamp()
      });
      this.closeAllModals();
      this.showToast(`Logged ${amount}kg feed`);
    } catch (error) {
      console.error("Error logging feed: ", error);
      this.showToast('Error logging feed', 'error');
    }
  }

  openTrayCheckModal() {
    const select = document.getElementById('checkEntrySelect');
    select.innerHTML = '';

    // Get pending checks (entries without tray checks from today)
    const today = this.currentDate;
    const pendingEntries = this.state.feedEntries.filter(entry => {
      if (entry.date !== today) return false;
      const hasCheck = this.state.trayChecks.some(t => t.entryId === entry.id);
      return !hasCheck;
    });

    if (pendingEntries.length === 0) {
      this.showToast('No pending tray checks found', 'warning');
      return;
    }

    pendingEntries.forEach(entry => {
      const tank = this.state.tanks.find(t => t.id === entry.tankId);
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = `${tank ? tank.name : 'Tank'} - ${entry.round} (${entry.amount}kg)`;
      select.appendChild(option);
    });

    // Clear previous selections
    document.querySelectorAll('.tray-option').forEach(opt => opt.classList.remove('active'));
    document.getElementById('trayNotes').value = '';
    this.selectedTrayStatus = null;

    document.getElementById('trayCheckModal').classList.add('active');
  }

  selectTrayStatus(value, element) {
    document.querySelectorAll('.tray-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
    this.selectedTrayStatus = value;
  }

  async saveTrayCheck() {
    const entryId = document.getElementById('checkEntrySelect').value;
    const notes = document.getElementById('trayNotes').value;

    if (!entryId) {
      this.showToast('Please select a feed entry', 'error');
      return;
    }

    if (!this.selectedTrayStatus) {
      this.showToast('Please select tray status', 'error');
      return;
    }

    const entry = this.state.feedEntries.find(e => e.id === entryId);
    if (!entry) {
      this.showToast('Feed entry not found', 'error');
      return;
    }

    try {
      await addDoc(collection(db, "trayChecks"), {
        uid: this.user.uid,
        entryId,
        date: entry.date,
        result: this.selectedTrayStatus,
        notes,
        timestamp: serverTimestamp()
      });
      this.closeAllModals();
      this.showToast(`Tray marked as ${this.selectedTrayStatus}`);
    } catch (error) {
      console.error("Error saving tray check: ", error);
      this.showToast('Error saving tray check', 'error');
    }
  }
}

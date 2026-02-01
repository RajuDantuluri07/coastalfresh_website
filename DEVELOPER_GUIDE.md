# AquaRythu Developer Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Features](#core-features)
4. [User Journeys](#user-journeys)
5. [Code Structure](#code-structure)
6. [Key Functions Reference](#key-functions-reference)
7. [Data Models](#data-models)
8. [Adding New Features](#adding-new-features)
9. [Bug Fixes Applied](#bug-fixes-applied)
10. [Development Workflow](#development-workflow)

---

## 🎯 Overview

**AquaRythu** is a Progressive Web App (PWA) for aquaculture farm management, designed specifically for shrimp farmers. It helps farmers track multiple farms, manage tanks/ponds, log feed, monitor water quality, and optimize feed conversion ratios (FCR).

### Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Storage**: LocalStorage (client-side persistence)
- **Charts**: Chart.js
- **Icons**: Font Awesome
- **Hosting**: Firebase Hosting
- **Architecture**: Single-page application (SPA) with modal-based UI

### Key Characteristics
- **Offline-first**: Works without internet using localStorage
- **Mobile-optimized**: Responsive design with touch-friendly UI
- **Single HTML file**: All code in `/public/index.html`
- **No backend**: Pure client-side application

---

## 🏗 Architecture

### Application Structure

```
AquaRythu (Main Class)
├── State Management (this.state)
│   ├── farms[]
│   ├── tanks[]
│   ├── feedEntries[]
│   ├── waterQuality[]
│   ├── harvests[]
│   ├── diseaseLog[]
│   ├── applications[]
│   ├── inventory{}
│   ├── medicineInventory[]
│   └── settings{}
│
├── Core Systems
│   ├── Save Queue (prevents race conditions)
│   ├── Date/Timezone handling
│   ├── HTML Sanitization (XSS prevention)
│   └── Error reporting
│
└── UI Screens
    ├── Overview (Home)
    ├── Log Book
    └── Analytics
```

### Data Flow

```
User Action → Event Handler → State Update → Save Queue → LocalStorage → Re-render UI
```

### Screen Navigation

The app has 3 main screens controlled by navigation tabs:
1. **Overview** (`data-screen="home"`) - Dashboard, tanks, feed plans
2. **Log Book** (`data-screen="log"`) - Feed history, water quality logs
3. **Analytics** (`data-screen="analytics"`) - Charts, performance metrics

---

## 🎨 Core Features

### 1. Multi-Farm Management
- Create/edit multiple farms
- Switch between farms via dropdown
- Farm-level settings (feeds per day, blind feeding duration, etc.)

### 2. Tank/Pond Management
- Add tanks with stocking details (date, count, weight)
- Track Days of Culture (DOC) automatically
- Manage tank status (active/inactive)
- Start new crop cycles

### 3. Feed Management
- **Blind Feeding Phase**: Auto-calculated feed schedule for early growth (DOC 1-30)
- **Tray-Based Feeding**: Manual tray checks with 4 status levels
  - Empty (increase feed)
  - Little (maintain)
  - Half (reduce 40%)
  - Too Much (reduce 70%)
- **Feed Logging**: Quick log with stepper UI
- **Feed Recommendations**: AI-like suggestions based on tray results and DOC
- **Daily Completion**: Celebration message when all feeds logged

### 4. Water Quality Tracking
- Log pH, DO, Salinity, Ammonia, Nitrite, Temperature
- Historical charts
- Alert system for out-of-range values

### 5. Performance Analytics
- **FCR (Feed Conversion Ratio)**: Total feed / Total production
- **Efficiency Score**: Composite metric
- **Growth Rate**: Biomass increase over time
- **Survival Rate**: Estimated based on harvests
- **Profit/Loss Projections**

### 6. Inventory Management
- Track feed stock (bags → kg conversion)
- Auto-deduct on feed logging
- Low stock alerts

### 7. Disease & Health Logging
- Record disease incidents
- Track treatments/applications
- Health-based feed adjustments (auto-reduce 15%)

---

## 👤 User Journeys

### Journey 1: First-Time Setup
```
1. User opens app → Sees "First Time Lock" screen
2. Click "Add Your First Farm"
3. Fill farm details (name, location, contact)
4. Click "Add New Tank"
5. Enter stocking details (date, PL count, weight)
6. System calculates DOC and generates blind feeding schedule
7. User sees Overview screen with tank card
```

### Journey 2: Daily Feed Logging (Blind Phase)
```
1. User navigates to Overview
2. Sees "Today's Feed Plan" card with scheduled amounts
3. Clicks "Confirm [X] kg" on a feed round
4. Feed logged instantly (no tray check needed)
5. Inventory auto-deducts
6. Next feed round appears
7. After 4th feed → "🎉 All feeds completed! See you tomorrow!"
```

### Journey 3: Tray-Based Feeding (After DOC 30)
```
1. System detects DOC > blind duration (30 days)
2. Shows "Transition to Tray Feeding" modal
3. User confirms transition
4. Logs first feed → Reminder to check trays in 2 hours
5. User clicks "Check Trays" button
6. Selects tray status per feed round (Empty/Little/Half/Too Much)
7. System calculates next feed amount based on tray result
8. Feed plan updates automatically
```

### Journey 4: Adding Water Quality Data
```
1. User opens tank detail modal
2. Clicks "Log Water Quality"
3. Enters pH, DO, Salinity, etc.
4. Saves → Data appears in water quality chart
5. If values out of range → Alert shown
```

### Journey 5: Viewing Performance
```
1. User navigates to Analytics screen
2. Sees farm-level metrics:
   - FCR (e.g., 1.45)
   - Efficiency Score (e.g., 87%)
   - Growth Rate
   - Survival Rate
3. Views charts:
   - Feed Waste Trend
   - Water Quality History
   - Biomass Growth
   - Tank Comparison
4. Exports report as JSON
```

### Journey 6: Harvest & New Crop
```
1. User opens tank detail → Actions tab
2. Clicks "Partial Harvest" or "End Crop"
3. Enters harvest weight
4. System calculates final FCR
5. For "End Crop":
   - Shows crop summary modal
   - Archives data
   - Resets tank for new cycle
6. User can start new crop with fresh stocking date
```

---

## 📂 Code Structure

### File Organization
All code is in `/public/index.html`:

```
Lines 1-2800:    CSS Styles
Lines 2800-4070: HTML Structure & Modals
Lines 4070-10560: JavaScript (AquaRythu class)
```

### JavaScript Class Structure

```javascript
class AquaRythu {
  constructor() { /* Initialize state */ }
  
  // === CORE SYSTEMS ===
  init()                    // App initialization
  loadAllData()             // Load from localStorage
  enqueueSave()             // Queue-based save system
  processSaveQueue()        // Prevent race conditions
  
  // === DATA PERSISTENCE ===
  saveFarms()
  saveTanks()
  saveFeedEntries()
  saveWaterQuality()
  saveSettings()
  // ... etc
  
  // === UI RENDERING ===
  renderAll()               // Re-render entire UI
  renderHomeScreen()        // Overview tab
  renderLogBook()           // Log book tab
  renderAnalyticsScreen()   // Analytics tab
  renderPerformanceScreen() // Performance metrics
  
  // === FEED MANAGEMENT ===
  openLogFeedModal()        // Open feed logging modal
  saveLogFeed()             // Save feed entry
  quickLogFeed()            // One-click feed logging
  calculateStrictFeed()     // Calculate next feed amount
  checkRecentHealthIssues() // Adjust feed for health
  
  // === TRAY CHECKS ===
  openTrayCheckPopup()      // Open tray check UI
  saveTrayResults()         // Save tray status
  checkBlindFeedingTransitions() // Auto-detect transition
  
  // === TANK MANAGEMENT ===
  openTankModal()           // Add/edit tank
  saveTank()                // Save tank data
  recalculateTankBiomass()  // Update biomass estimate
  openTankDetail()          // Tank detail modal
  
  // === UTILITIES ===
  getFormattedDate()        // Timezone-aware date formatting
  getDaysOld()              // Calculate DOC
  sanitizeHTML()            // XSS prevention
  showToast()               // Notification system
  showAlertModal()          // Alert dialogs
  showConfirmModal()        // Confirmation dialogs
}
```

### Key State Properties

```javascript
this.state = {
  farms: [
    { id, name, location, contact, phone, createdAt }
  ],
  tanks: [
    { 
      id, farmId, name, status, stockingDate, plCount, 
      avgWeight, biomass, nextSuggestedFeed, blindFeedingSchedule 
    }
  ],
  feedEntries: [
    { 
      id, tankId, date, time, amount, trayResult, 
      supplements, reason, healthObserved 
    }
  ],
  waterQuality: [
    { id, tankId, date, ph, do, salinity, ammonia, nitrite, temp }
  ],
  settings: {
    currentFarmId,
    feedsPerDay: 4,
    feedPrice: 90,
    marketPrice: 350,
    blindFeedingDuration: 30,
    feedTimes: [6, 11, 16, 21],
    supplements: ['Probiotic', 'Mineral Mix', 'Vitamin C']
  }
}
```

---

## 🔑 Key Functions Reference

### Feed Management

#### `calculateStrictFeed(lastAmount, trayResult, doc)`
**Purpose**: Calculate next feed amount based on tray check results and DOC

**Logic**:
- **Empty tray**: Increase feed (8% early, 4% mid, 2% late growth)
- **Little**: Maintain or reduce 5% (late stage)
- **Half**: Reduce 40% (waste detected)
- **Too Much**: Reduce 70% (severe waste)

**Returns**: `{ amount, reason, color }`

```javascript
// Example
const result = this.calculateStrictFeed(5.0, 'empty', 45);
// Returns: { amount: 5.2, reason: "Standard (+4%)", color: "var(--success)" }
```

#### `saveLogFeed(loadNext)`
**Purpose**: Save feed entry and handle post-save logic

**Flow**:
1. Validate input
2. Create feed entry object
3. Add to state.feedEntries
4. Deduct from inventory
5. Save to localStorage (queued)
6. Check if all feeds completed for today
7. If yes → Show completion message
8. If no → Load next tank (if `loadNext = true`)

#### `checkBlindFeedingTransitions()`
**Purpose**: Auto-detect when tank should transition from blind to tray feeding

**Trigger**: Called on every render
**Condition**: `DOC > blindFeedingDuration && status === 'blind-fed'`
**Action**: Show transition modal

### Tray Check System

#### `openTrayCheckPopup(tankId, feedIndex)`
**Purpose**: Open tray check modal for a specific feed round

**UI**: 
- Shows all feed rounds as tabs
- Each tab has 4 status buttons (Empty/Little/Half/Too Much)
- Visual feedback with icons and colors

#### `saveTrayResults()`
**Purpose**: Save tray check results and update feed entries

**Flow**:
1. Collect tray status for each feed round
2. Find corresponding feed entries for today
3. Update `trayResult` field
4. Calculate next feed amounts
5. Update tank's `nextSuggestedFeed`
6. Re-render UI

### Date & Time Handling

#### `getFormattedDate(date)`
**Purpose**: Get date string in YYYY-MM-DD format (timezone-aware)

**Bug Fix #10**: Uses local date methods instead of UTC to prevent timezone errors

```javascript
// Correct implementation
const year = d.getFullYear();
const month = String(d.getMonth() + 1).padStart(2, '0');
const day = String(d.getDate()).padStart(2, '0');
return `${year}-${month}-${day}`;
```

#### `getDaysOld(dateStr)`
**Purpose**: Calculate days between date and today (for DOC calculation)

**Returns**: Integer (never negative)

### Data Persistence

#### `enqueueSave(saveFn)`
**Purpose**: Queue save operations to prevent race conditions

**Bug Fix #2**: Prevents concurrent localStorage writes

```javascript
// Usage
await this.enqueueSave(() => {
  localStorage.setItem('key', JSON.stringify(data));
});
```

#### `processSaveQueue()`
**Purpose**: Process queued save operations sequentially

**Pattern**:
```javascript
while (this.saveQueue.length > 0) {
  this.isSaving = true;
  const { fn, resolve, reject } = this.saveQueue.shift();
  await fn();
  this.isSaving = false;
}
```

### Security

#### `sanitizeHTML(str)`
**Purpose**: Prevent XSS attacks by escaping HTML entities

**Bug Fix #5**: All user input is sanitized before rendering

```javascript
sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

### UI Helpers

#### `showToast(message, type, duration)`
**Purpose**: Show temporary notification

**Types**: `'success'`, `'error'`, `'info'`, `'warning'`

#### `showAlertModal(message, title)`
**Purpose**: Show alert dialog (returns Promise)

#### `showConfirmModal(message, title)`
**Purpose**: Show confirmation dialog (returns Promise<boolean>)

---

## 📊 Data Models

### Farm
```javascript
{
  id: "farm_1234567890",
  name: "Coastalfresh Farm",
  location: "Nellore, Andhra Pradesh",
  contact: "Raju Dantuluri",
  phone: "+91 9876543210",
  createdAt: "2026-01-15"
}
```

### Tank
```javascript
{
  id: "tank_1234567890",
  farmId: "farm_1234567890",
  name: "Tank A",
  status: "active", // or "blind-fed", "inactive"
  stockingDate: "2026-01-01",
  plCount: 100000,
  avgWeight: 0.001, // kg
  biomass: 100, // kg (calculated)
  nextSuggestedFeed: 5.2,
  blindFeedingSchedule: [
    { doc: 1, amount: 2.0, feeds: [0.5, 0.5, 0.5, 0.5] },
    // ... up to DOC 30
  ]
}
```

### Feed Entry
```javascript
{
  id: 1738425600000, // timestamp
  tankId: "tank_1234567890",
  date: "2026-02-01",
  time: "06:30:00",
  amount: 5.2, // kg
  trayResult: "empty", // or "little", "half", "too-much", "pending", "skipped"
  supplements: ["Probiotic", "Vitamin C"],
  reason: "Normal feeding",
  healthObserved: false
}
```

### Water Quality
```javascript
{
  id: 1738425600000,
  tankId: "tank_1234567890",
  date: "2026-02-01",
  ph: 8.2,
  do: 6.5, // mg/L
  salinity: 15, // ppt
  ammonia: 0.1, // ppm
  nitrite: 0.05, // ppm
  temp: 28 // °C
}
```

---

## 🛠 Adding New Features

### Step-by-Step Guide

#### 1. Add State Property (if needed)
```javascript
// In constructor()
this.state = {
  // ... existing properties
  myNewFeature: [] // Add your new data array/object
}
```

#### 2. Add Save/Load Functions
```javascript
saveMyNewFeature() {
  return this.enqueueSave(() => {
    try {
      localStorage.setItem('aquabook_mynewfeature', 
        JSON.stringify(this.state.myNewFeature));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        this.showToast('Storage full!', 'error');
      }
    }
  });
}

loadMyNewFeature() {
  const data = this.safeParse(
    localStorage.getItem('aquabook_mynewfeature')
  );
  this.state.myNewFeature = data || [];
}
```

#### 3. Add HTML Modal (if UI needed)
```html
<!-- Add before closing </div> of modals section -->
<div class="modal-overlay" id="myFeatureModal">
  <div class="modal-content">
    <div class="modal-header">
      <h3><i class="fas fa-icon"></i> My Feature</h3>
      <button class="close-modal" onclick="app.closeAllModals()">&times;</button>
    </div>
    <div class="modal-body">
      <!-- Your form fields -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="app.saveMyFeature()">
        Save
      </button>
    </div>
  </div>
</div>
```

#### 4. Add Event Handler
```javascript
openMyFeatureModal() {
  const modal = document.getElementById('myFeatureModal');
  if (modal) modal.classList.add('active');
}

saveMyFeature() {
  // Get form values
  const value = document.getElementById('myInput').value;
  
  // Validate
  if (!value) {
    this.showToast('Please enter a value', 'error');
    return;
  }
  
  // Create entry
  const entry = {
    id: Date.now(),
    value: this.sanitizeHTML(value),
    date: this.currentDate
  };
  
  // Add to state
  this.state.myNewFeature.push(entry);
  
  // Save
  this.saveMyNewFeature();
  
  // Re-render
  this.renderAll();
  
  // Close modal
  this.closeAllModals();
  
  // Notify
  this.showToast('Saved successfully!', 'success');
}
```

#### 5. Add Render Function (if displaying data)
```javascript
renderMyFeature() {
  const container = document.getElementById('myFeatureContainer');
  if (!container) return;
  
  const items = this.state.myNewFeature;
  
  if (items.length === 0) {
    container.innerHTML = '<p>No data yet</p>';
    return;
  }
  
  container.innerHTML = items.map(item => `
    <div class="item-card">
      <div>${item.value}</div>
      <div>${item.date}</div>
    </div>
  `).join('');
}
```

#### 6. Call in renderAll()
```javascript
renderAll() {
  // ... existing renders
  this.renderMyFeature(); // Add your render
}
```

### Example: Adding "Feed Notes" Feature

```javascript
// 1. State
this.state.feedNotes = [];

// 2. Save/Load
saveFeedNotes() {
  return this.enqueueSave(() => {
    localStorage.setItem('aquabook_feednotes', 
      JSON.stringify(this.state.feedNotes));
  });
}

// 3. Add note
addFeedNote(tankId, note) {
  const entry = {
    id: Date.now(),
    tankId,
    date: this.currentDate,
    note: this.sanitizeHTML(note)
  };
  this.state.feedNotes.push(entry);
  this.saveFeedNotes();
  this.showToast('Note added', 'success');
}

// 4. Display in tank detail
renderTankNotes(tank) {
  const notes = this.state.feedNotes.filter(n => n.tankId === tank.id);
  return notes.map(n => `
    <div class="note-card">
      <div>${n.note}</div>
      <small>${n.date}</small>
    </div>
  `).join('');
}
```

---

## 🐛 Bug Fixes Applied

### Bug #1: Duplicate Nested Close Buttons
**Issue**: Malformed HTML with nested `<button>` tags
**Fix**: Removed nested buttons, kept single close button
**Impact**: Fixed 19 modals

### Bug #2: Missing onclick Handler
**Issue**: Tray check modal close button had no onclick
**Fix**: Added `onclick="app.closeAllModals()"`

### Bug #3: Null Reference Error
**Issue**: Code accessed `classList` on potentially null `efficiencyCard`
**Fix**: Added null checks before accessing properties

### Bug #4: Missing Canvas Null Check
**Issue**: Called `getContext('2d')` on null canvas element
**Fix**: Added null check and early return

### Bug #5: Incorrect Timezone Calculation
**Issue**: `getFormattedDate()` incorrectly applied timezone offset
**Fix**: Use local date methods directly instead of UTC with offset

### Race Condition Prevention (Bug #2 Fix)
**Issue**: Concurrent localStorage writes causing data loss
**Fix**: Implemented queue-based save system with `enqueueSave()`

### XSS Prevention (Bug #5 Fix)
**Issue**: User input rendered without sanitization
**Fix**: All user input passed through `sanitizeHTML()`

---

## 💻 Development Workflow

### Local Development

1. **Setup**
```bash
cd coastalfresh_website
npm install -g firebase-tools
firebase login
```

2. **Local Server**
```bash
firebase serve
# Open http://localhost:5000
```

3. **Make Changes**
- Edit `/public/index.html`
- Refresh browser to see changes
- Use browser DevTools for debugging

4. **Testing**
- Test on mobile viewport (Chrome DevTools)
- Test offline mode (disable network in DevTools)
- Clear localStorage to test first-time flow:
  ```javascript
  localStorage.clear()
  location.reload()
  ```

### Deployment

```bash
# Stage changes
git add -A
git commit -m "Description of changes"
git push origin main

# Deploy to Firebase
firebase deploy --only hosting

# Verify at:
# https://coastal-fresh---sea-foods.web.app
```

### Debugging Tips

1. **Check Console**: All errors logged to console
2. **Inspect State**: In browser console:
   ```javascript
   app.state // View entire state
   app.state.tanks // View tanks
   app.state.feedEntries // View feed logs
   ```
3. **Clear Data**: 
   ```javascript
   localStorage.clear()
   ```
4. **Export Data**: Use "Export Report" feature to download JSON

### Code Style Guidelines

1. **Naming**:
   - Functions: camelCase (`renderHomeScreen`)
   - Classes: PascalCase (`AquaRythu`)
   - Constants: UPPER_SNAKE_CASE
   - IDs: kebab-case (`log-feed-modal`)

2. **Comments**:
   - Add comments for complex logic
   - Mark bug fixes: `// BUG FIX #X: Description`
   - Document function purpose

3. **Error Handling**:
   - Always wrap localStorage in try-catch
   - Show user-friendly error messages
   - Log errors to console

4. **Security**:
   - Sanitize all user input
   - Use `this.sanitizeHTML()` for text
   - Use `this.escapeAttribute()` for attributes

---

## 📚 Additional Resources

### Key Concepts

**DOC (Days of Culture)**: Number of days since stocking date
**FCR (Feed Conversion Ratio)**: Total feed / Total production (lower is better)
**Blind Feeding**: Early growth phase without tray checks (DOC 1-30)
**Tray Feeding**: Manual tray checks to optimize feed (DOC 31+)
**PL (Post Larvae)**: Baby shrimp count at stocking

### Common Tasks

**Add a new modal**:
1. Copy existing modal HTML structure
2. Change ID and content
3. Add open/close functions
4. Add button to trigger modal

**Add a new chart**:
1. Add canvas element: `<canvas id="myChart"></canvas>`
2. Use Chart.js in render function
3. Destroy old chart before creating new: `if (this.myChart) this.myChart.destroy()`

**Add a new setting**:
1. Add to `this.state.settings` in constructor
2. Add input in settings modal HTML
3. Add update function: `updateMySetting(value)`
4. Call `this.saveSettings()` after update

### Performance Optimization

1. **Minimize Re-renders**: Only call `renderAll()` when necessary
2. **Lazy Load**: Don't render hidden screens
3. **Debounce Input**: For real-time calculations
4. **Limit Chart Data**: Show last 30 days by default

---

## 🎓 Learning Path for New Developers

### Week 1: Understanding the Basics
- [ ] Read this entire guide
- [ ] Explore the UI as a user
- [ ] Review HTML structure (lines 2800-4070)
- [ ] Understand state management
- [ ] Test localStorage operations in console

### Week 2: Core Features
- [ ] Study feed logging flow
- [ ] Understand tray check system
- [ ] Review date/timezone handling
- [ ] Explore chart rendering

### Week 3: Advanced Features
- [ ] Study blind feeding algorithm
- [ ] Review FCR calculations
- [ ] Understand save queue system
- [ ] Explore modal system

### Week 4: Practice
- [ ] Fix a small bug
- [ ] Add a simple feature (e.g., notes)
- [ ] Improve existing UI
- [ ] Write tests for key functions

---

## 🚀 Quick Start Checklist

- [ ] Clone repository
- [ ] Install Firebase CLI
- [ ] Run local server
- [ ] Create test farm
- [ ] Add test tank
- [ ] Log test feeds
- [ ] Check tray results
- [ ] View analytics
- [ ] Export data
- [ ] Clear localStorage and repeat

---

## 📞 Support

For questions or issues:
1. Check browser console for errors
2. Review this guide
3. Search codebase for similar implementations
4. Test in isolation (create minimal reproduction)

---

**Last Updated**: February 1, 2026
**Version**: 1.0
**Maintainer**: Development Team

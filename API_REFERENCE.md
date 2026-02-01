# AquaRythu API Reference

## Core Class Methods

### Initialization & Lifecycle

#### `constructor()`
Initializes the AquaRythu application with default state.

**State Structure**:
```javascript
{
  farms: [],
  tanks: [],
  feedEntries: [],
  waterQuality: [],
  harvests: [],
  diseaseLog: [],
  applications: [],
  inventory: { totalKg: 0, lastUpdated: null },
  medicineInventory: [],
  settings: {
    currentFarmId: null,
    feedsPerDay: 4,
    feedPrice: 90,
    marketPrice: 350,
    blindFeedingDuration: 30,
    feedTimes: [6, 11, 16, 21],
    supplements: ['Probiotic', 'Mineral Mix', 'Vitamin C']
  }
}
```

#### `init()`
**Purpose**: Initialize application on page load  
**Flow**:
1. Load all data from localStorage
2. Set up event listeners
3. Render initial UI
4. Check for first-time user
5. Register service worker (PWA)

**Usage**:
```javascript
const app = new AquaRythu();
app.init();
```

---

## Data Persistence

### Save Methods

All save methods use the queue system to prevent race conditions.

#### `enqueueSave(saveFn)`
**Purpose**: Queue a save operation  
**Parameters**:
- `saveFn` (Function): Function that performs the save operation

**Returns**: Promise

**Example**:
```javascript
await this.enqueueSave(() => {
  localStorage.setItem('key', JSON.stringify(data));
});
```

#### `saveFarms()`
**Purpose**: Save farms array to localStorage  
**Key**: `aquabook_farms`

#### `saveTanks()`
**Purpose**: Save tanks array to localStorage  
**Key**: `aquabook_tanks`

#### `saveFeedEntries()`
**Purpose**: Save feed entries to localStorage  
**Key**: `aquabook_entries`

#### `saveWaterQuality()`
**Purpose**: Save water quality logs  
**Key**: `aquabook_waterquality`

#### `saveSettings()`
**Purpose**: Save settings object  
**Key**: `aquabook_settings`

---

## Farm Management

#### `openFarmModal()`
**Purpose**: Open modal to add new farm  
**UI**: Clears form and shows farm modal

#### `editFarm(farmId)`
**Purpose**: Open modal to edit existing farm  
**Parameters**:
- `farmId` (String): ID of farm to edit

#### `saveFarm()`
**Purpose**: Save farm (create or update)  
**Flow**:
1. Get form values
2. Validate required fields
3. Sanitize input
4. Create/update farm object
5. Save to state
6. Update UI

**Validation**:
- Farm name is required
- Sanitizes all text inputs

#### `deleteFarm(farmId)`
**Purpose**: Delete a farm and all associated data  
**Parameters**:
- `farmId` (String): ID of farm to delete

**Confirmation**: Shows confirm dialog before deletion

#### `switchFarm(farmId)`
**Purpose**: Switch to a different farm  
**Parameters**:
- `farmId` (String): ID of farm to switch to

**Effect**: Updates `currentFarmId` and re-renders UI

---

## Tank Management

#### `openTankModal(farmId, tankId = null)`
**Purpose**: Open modal to add/edit tank  
**Parameters**:
- `farmId` (String): ID of farm
- `tankId` (String, optional): ID of tank to edit

#### `saveTank()`
**Purpose**: Save tank (create or update)  
**Validation**:
- Tank name required
- Stocking date required
- PL count > 0
- Average weight > 0

**Auto-calculations**:
- Initial biomass = plCount × avgWeight
- Generates blind feeding schedule if new tank

#### `generateBlindSchedule(tank)`
**Purpose**: Generate auto-calculated feeding schedule for blind phase  
**Parameters**:
- `tank` (Object): Tank object with stocking details

**Algorithm**:
```javascript
For each DOC (1 to blindFeedingDuration):
  baseAmount = (plCount / 1000) × growthFactor
  dailyAmount = baseAmount × feedsPerDay
  perFeedAmount = dailyAmount / feedsPerDay
```

**Returns**: Array of schedule objects
```javascript
[
  { doc: 1, amount: 2.0, feeds: [0.5, 0.5, 0.5, 0.5], status: 'auto' },
  // ...
]
```

#### `recalculateTankBiomass(tankId, clearSuggestion = false)`
**Purpose**: Recalculate estimated biomass for a tank  
**Parameters**:
- `tankId` (String): Tank ID
- `clearSuggestion` (Boolean): Whether to clear nextSuggestedFeed

**Formula**:
```javascript
totalFeed = sum of all feed entries
estimatedBiomass = initialBiomass + (totalFeed × 0.65)
// 0.65 = assumed feed conversion efficiency
```

#### `openTankDetail(tankId)`
**Purpose**: Open detailed tank view modal  
**Tabs**:
- Overview: Stats, DOC, biomass
- Logs: Feed history, water quality
- Analytics: Charts (growth, FCR)
- Actions: Log feed, harvest, etc.
- Settings: Edit tank details

---

## Feed Management

#### `openLogFeedModal(tankId = null, prefillAmount = null, feedIndex = null, isFirstTrayFeed = false)`
**Purpose**: Open feed logging modal  
**Parameters**:
- `tankId` (String, optional): Pre-select tank
- `prefillAmount` (Number, optional): Pre-fill amount
- `feedIndex` (Number, optional): Feed round index
- `isFirstTrayFeed` (Boolean): Flag for first tray-based feed

**UI Features**:
- Tank selector dropdown
- Amount stepper (+/- 0.5 kg)
- Feed time selector
- Supplement checkboxes
- Health observation toggle

#### `saveLogFeed(loadNext = false)`
**Purpose**: Save feed entry  
**Parameters**:
- `loadNext` (Boolean): Whether to load next tank after saving

**Flow**:
1. Validate amount > 0
2. Create feed entry object
3. Add to feedEntries array
4. Deduct from inventory
5. Save to localStorage
6. Check if all feeds completed for today
7. Show completion message if done
8. Load next tank if requested

**Completion Check**:
```javascript
const feedsPerDay = this.state.settings.feedsPerDay;
const todayEntries = this.state.feedEntries.filter(e => 
  e.tankId === tankId && e.date === this.currentDate
);
if (todayEntries.length >= feedsPerDay) {
  // Show completion message
}
```

#### `quickLogFeed(tankId, amount)`
**Purpose**: One-click feed logging (no modal)  
**Parameters**:
- `tankId` (String): Tank ID
- `amount` (Number): Feed amount in kg

**Use Case**: Quick confirm from feed plan card

#### `skipFeed(tankId)`
**Purpose**: Record a skipped feed (0 kg)  
**Parameters**:
- `tankId` (String): Tank ID

**Entry**:
```javascript
{
  amount: 0,
  trayResult: 'skipped'
}
```

#### `calculateStrictFeed(lastAmount, trayResult, doc)`
**Purpose**: Calculate next feed amount based on tray check  
**Parameters**:
- `lastAmount` (Number): Previous feed amount
- `trayResult` (String): Tray status ('empty', 'little', 'half', 'too-much')
- `doc` (Number): Days of Culture

**Returns**: Object
```javascript
{
  amount: 5.2,      // Calculated amount
  reason: "Growth Phase (+8%)",
  color: "var(--success)"
}
```

**Logic Matrix**:

| Tray Result | DOC < 45 | DOC 45-80 | DOC > 80 |
|-------------|----------|-----------|----------|
| Empty       | +8%      | +4%       | +2%      |
| Little      | Maintain | Maintain  | -5%      |
| Half        | -40%     | -40%      | -40%     |
| Too Much    | -70%     | -70%      | -70%     |

#### `updateLogFeedContext(tankId)`
**Purpose**: Update feed modal context text  
**Parameters**:
- `tankId` (String): Tank ID

**Updates**:
- Tank name display
- Last feed amount
- Current DOC
- Suggested amount

---

## Tray Check System

#### `openTrayCheckPopup(tankId, feedIndex = 0)`
**Purpose**: Open tray check modal  
**Parameters**:
- `tankId` (String): Tank ID
- `feedIndex` (Number): Starting feed round tab

**UI**:
- Tabs for each feed round
- 4 status buttons per tab
- Visual feedback with icons

#### `renderTrayCheckTabs(tankId)`
**Purpose**: Render tray check tabs  
**Parameters**:
- `tankId` (String): Tank ID

**Returns**: HTML string with tabs

#### `switchTrayTab(index)`
**Purpose**: Switch to a different tray tab  
**Parameters**:
- `index` (Number): Tab index (0-3)

#### `selectTrayStatusNew(status)`
**Purpose**: Select tray status for current tab  
**Parameters**:
- `status` (String): 'empty', 'little', 'half', 'too-much'

**Effect**: Updates UI and stores selection

#### `saveTrayResults()`
**Purpose**: Save all tray check results  
**Flow**:
1. Collect status for each feed round
2. Find today's feed entries
3. Update trayResult field
4. Calculate next feed amounts
5. Update tank's nextSuggestedFeed
6. Close modal and re-render

#### `checkBlindFeedingTransitions()`
**Purpose**: Auto-detect tanks ready for tray feeding  
**Trigger**: Called on every render  
**Condition**: DOC > blindFeedingDuration && status === 'blind-fed'  
**Action**: Show transition modal

#### `confirmBlindTransition(tankId)`
**Purpose**: Transition tank from blind to tray feeding  
**Parameters**:
- `tankId` (String): Tank ID

**Changes**:
- Updates tank.status to 'active'
- Opens feed modal for first tray-based feed

---

## Water Quality

#### `openWaterQualityModal(tankId)`
**Purpose**: Open water quality logging modal  
**Parameters**:
- `tankId` (String): Tank ID

#### `saveWaterQuality()`
**Purpose**: Save water quality entry  
**Fields**:
- pH (6.5-9.0 normal)
- DO - Dissolved Oxygen (>5 mg/L normal)
- Salinity (10-25 ppt normal)
- Ammonia (<0.5 ppm normal)
- Nitrite (<0.5 ppm normal)
- Temperature (26-32°C normal)

**Validation**: Shows warnings for out-of-range values

#### `renderWaterQualityChart(tank)`
**Purpose**: Render water quality chart  
**Parameters**:
- `tank` (Object): Tank object

**Chart Type**: Line chart with multiple datasets

---

## Performance & Analytics

#### `renderPerformanceScreen()`
**Purpose**: Render farm-level performance metrics  
**Calculations**:

**FCR (Feed Conversion Ratio)**:
```javascript
totalFeed = sum of all feed entries
totalHarvested = sum of harvests
totalBiomass = sum of current biomass
totalProduction = totalBiomass + totalHarvested
FCR = totalFeed / totalProduction
```

**Efficiency Score**:
```javascript
fcrScore = (2.0 - FCR) / 2.0 × 100
wasteScore = (1 - wastePercentage) × 100
efficiencyScore = (fcrScore × 0.6) + (wasteScore × 0.4)
```

**Growth Rate**:
```javascript
avgDoc = average DOC across tanks
avgBiomass = average biomass per tank
growthRate = (avgBiomass / avgDoc) × 100
```

**Survival Rate**:
```javascript
estimatedCount = biomass / estimatedAvgWeight
survivalRate = (estimatedCount / initialPLCount) × 100
```

#### `renderGrowthChart()`
**Purpose**: Render biomass growth chart  
**Data**: Daily cumulative biomass

#### `renderFCRTrendChart()`
**Purpose**: Render FCR trend over time  
**Data**: Rolling 7-day FCR calculation

#### `renderWasteTrendChart()`
**Purpose**: Render feed waste percentage chart  
**Calculation**:
```javascript
wastePercentage = (traysWithWaste / totalTrays) × 100
```

#### `renderComparisonChart()`
**Purpose**: Compare multiple tanks side-by-side  
**Metrics**: FCR, Efficiency, Total Feed

---

## Inventory Management

#### `openInventoryModal()`
**Purpose**: Open feed stock management modal

#### `addStock()`
**Purpose**: Add feed stock  
**Flow**:
1. Get bags count and kg per bag
2. Calculate total kg
3. Add to inventory.totalKg
4. Save inventory
5. Update UI

#### `renderInventorySummary()`
**Purpose**: Render inventory status card  
**Displays**:
- Current stock (kg)
- Days remaining estimate
- Low stock warning

---

## Disease & Health

#### `openDiseaseModal(tankId)`
**Purpose**: Open disease logging modal  
**Parameters**:
- `tankId` (String): Tank ID

#### `saveDiseaseLog()`
**Purpose**: Save disease/health log entry  
**Fields**:
- Date noticed
- Disease type (dropdown)
- Severity (Low/Medium/High)
- Symptoms
- Treatment plan

#### `checkRecentHealthIssues(tankId)`
**Purpose**: Check for recent health problems  
**Parameters**:
- `tankId` (String): Tank ID

**Returns**: Boolean (true if issues in last 7 days)

**Effect**: Auto-reduces next feed by 15% if health issues detected

---

## Harvest Management

#### `openPartialHarvestModal(tankId)`
**Purpose**: Open partial harvest modal  
**Parameters**:
- `tankId` (String): Tank ID

#### `savePartialHarvest()`
**Purpose**: Save partial harvest entry  
**Flow**:
1. Record harvest weight
2. Reduce tank biomass
3. Calculate FCR for harvested portion
4. Update tank stats

#### `startNewCrop(tankId)`
**Purpose**: End current crop and start new cycle  
**Parameters**:
- `tankId` (String): Tank ID

**Flow**:
1. Show crop summary (FCR, total feed, harvest)
2. Archive old data
3. Reset tank (clear biomass, feeds, etc.)
4. Set status to inactive
5. User can re-stock with new date

---

## Settings Management

#### `openSettingsModal()`
**Purpose**: Open farm settings modal  
**Sections**:
- General (feeds per day, feed price, market price)
- Blind Feeding (duration, start DOC)
- Feed Times (schedule for each feed)
- Supplements (custom list)
- Tray Thresholds (percentage ranges)

#### `updateFeedsPerDay(value)`
**Purpose**: Update number of feeds per day  
**Parameters**:
- `value` (Number): 1-4 feeds

**Effect**: Regenerates feed times and schedules

#### `updateFeedPrice(value)`
**Purpose**: Update feed price per kg  
**Parameters**:
- `value` (Number): Price in currency

#### `updateMarketPrice(value)`
**Purpose**: Update shrimp market price  
**Parameters**:
- `value` (Number): Price per kg

#### `renderFeedTimeInputs()`
**Purpose**: Render feed time input fields  
**Dynamic**: Shows inputs based on feedsPerDay setting

---

## Utility Functions

#### `getFormattedDate(date = new Date())`
**Purpose**: Get date string in YYYY-MM-DD format  
**Parameters**:
- `date` (Date, optional): Date object

**Returns**: String (e.g., "2026-02-01")

**Note**: Timezone-aware, uses local date methods

#### `getDaysOld(dateStr)`
**Purpose**: Calculate days between date and today  
**Parameters**:
- `dateStr` (String): Date in YYYY-MM-DD format

**Returns**: Number (days, never negative)

**Use Case**: Calculate DOC (Days of Culture)

#### `sanitizeHTML(str)`
**Purpose**: Escape HTML to prevent XSS  
**Parameters**:
- `str` (String): User input

**Returns**: String (sanitized)

**Example**:
```javascript
const safe = this.sanitizeHTML('<script>alert("xss")</script>');
// Returns: "&lt;script&gt;alert("xss")&lt;/script&gt;"
```

#### `escapeAttribute(str)`
**Purpose**: Escape string for use in HTML attributes  
**Parameters**:
- `str` (String): Attribute value

**Returns**: String (escaped)

#### `showToast(message, type = 'info', duration = 3000)`
**Purpose**: Show temporary notification  
**Parameters**:
- `message` (String): Message text
- `type` (String): 'success', 'error', 'info', 'warning'
- `duration` (Number): Display time in ms

#### `showAlertModal(message, title = 'Alert')`
**Purpose**: Show alert dialog  
**Parameters**:
- `message` (String): Alert message
- `title` (String): Modal title

**Returns**: Promise (resolves when closed)

#### `showConfirmModal(message, title = 'Confirm')`
**Purpose**: Show confirmation dialog  
**Parameters**:
- `message` (String): Confirmation message
- `title` (String): Modal title

**Returns**: Promise<Boolean> (true if confirmed)

**Example**:
```javascript
const confirmed = await this.showConfirmModal(
  'Delete this tank?', 
  'Confirm Deletion'
);
if (confirmed) {
  // Delete tank
}
```

#### `closeAllModals()`
**Purpose**: Close all open modals  
**Effect**: Removes 'active' class from all modal overlays

#### `switchScreen(screenName)`
**Purpose**: Navigate between main screens  
**Parameters**:
- `screenName` (String): 'home', 'log', 'analytics'

**Effect**: Shows/hides screen sections and updates nav

---

## Helper Functions

#### `getTankById(tankId)`
**Purpose**: Get tank object by ID  
**Parameters**:
- `tankId` (String): Tank ID

**Returns**: Tank object or undefined

#### `getFarmById(farmId)`
**Purpose**: Get farm object by ID  
**Parameters**:
- `farmId` (String): Farm ID

**Returns**: Farm object or undefined

#### `safeParse(jsonString)`
**Purpose**: Safely parse JSON with error handling  
**Parameters**:
- `jsonString` (String): JSON string

**Returns**: Parsed object or null

**Example**:
```javascript
const data = this.safeParse(localStorage.getItem('key'));
```

#### `trackEvent(eventName, properties)`
**Purpose**: Track analytics event (placeholder)  
**Parameters**:
- `eventName` (String): Event name
- `properties` (Object): Event properties

**Note**: Currently logs to console, can integrate analytics

---

## Constants & Configuration

### Default Settings
```javascript
feedsPerDay: 4
feedPrice: 90 // per kg
marketPrice: 350 // per kg
blindFeedingDuration: 30 // days
feedTimes: [6, 11, 16, 21] // hours
supplements: ['Probiotic', 'Mineral Mix', 'Vitamin C']
```

### Tray Status Values
- `'empty'` - No feed left, increase amount
- `'little'` - Small amount left, maintain
- `'half'` - Half or more left, reduce significantly
- `'too-much'` - Excessive waste, reduce drastically
- `'pending'` - Not yet checked
- `'skipped'` - Feed skipped
- `'blind-fed'` - Blind feeding phase (no tray)

### Tank Status Values
- `'active'` - Active with tray checks
- `'blind-fed'` - In blind feeding phase
- `'inactive'` - Crop ended

### LocalStorage Keys
- `aquabook_farms`
- `aquabook_tanks`
- `aquabook_entries`
- `aquabook_waterquality`
- `aquabook_harvests`
- `aquabook_disease`
- `aquabook_applications`
- `aquabook_inventory`
- `aquabook_medicine`
- `aquabook_settings`

---

## Event Handlers

### Modal Events
- `onclick="app.openFarmModal()"` - Open farm modal
- `onclick="app.openTankModal(farmId)"` - Open tank modal
- `onclick="app.openLogFeedModal()"` - Open feed modal
- `onclick="app.closeAllModals()"` - Close all modals

### Navigation Events
- `data-screen="home"` - Switch to overview
- `data-screen="log"` - Switch to log book
- `data-screen="analytics"` - Switch to analytics

### Form Events
- `onchange="app.updateFeedsPerDay(this.value)"` - Update setting
- `onclick="app.saveFarm()"` - Save farm
- `onclick="app.saveTank()"` - Save tank

---

## Error Handling

### Storage Errors
```javascript
try {
  localStorage.setItem('key', value);
} catch (e) {
  if (e.name === 'QuotaExceededError') {
    this.showToast('Storage full! Please export and clear old data.', 'error');
  } else if (e.name === 'TypeError') {
    this.showToast('Invalid data format', 'error');
  }
}
```

### Validation Errors
```javascript
if (!tankName) {
  this.showToast('Tank name is required', 'error');
  return;
}
```

### Network Errors
```javascript
// App is offline-first, no network calls
// Service worker handles offline caching
```

---

## Performance Considerations

### Optimization Tips
1. **Limit re-renders**: Only call `renderAll()` when state changes
2. **Destroy charts**: Always destroy old Chart.js instances
3. **Filter data**: Limit chart data to recent entries (e.g., last 30 days)
4. **Debounce inputs**: For real-time calculations
5. **Lazy load**: Don't render hidden screens

### Memory Management
```javascript
// Destroy chart before creating new one
if (this.myChart) {
  this.myChart.destroy();
  this.myChart = null;
}

// Create new chart
this.myChart = new Chart(ctx, config);
```

---

## Testing

### Manual Testing Checklist
- [ ] Create farm
- [ ] Add tank
- [ ] Log feeds (blind phase)
- [ ] Transition to tray feeding
- [ ] Check trays
- [ ] Log water quality
- [ ] View analytics
- [ ] Partial harvest
- [ ] End crop
- [ ] Export data
- [ ] Clear localStorage and repeat

### Test Data
```javascript
// Create test farm
const testFarm = {
  id: 'test_farm',
  name: 'Test Farm',
  location: 'Test Location'
};

// Create test tank
const testTank = {
  id: 'test_tank',
  farmId: 'test_farm',
  name: 'Test Tank',
  stockingDate: '2026-01-01',
  plCount: 100000,
  avgWeight: 0.001
};
```

---

**Version**: 1.0  
**Last Updated**: February 1, 2026

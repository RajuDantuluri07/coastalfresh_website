# Lifecycle Awareness Implementation Guide

## What We Built

A comprehensive **Pond Lifecycle Awareness System** that transforms your aquaculture app from treating all ponds the same to intelligently adapting behavior based on each pond's cultivation stage.

---

## Key Changes Made

### 1. **Lifecycle State System** (`index.html` lines 4140-4337)

Added 6 lifecycle states with automatic calculation:
- `PRE_STOCK` 🔧 - Pond preparation
- `BLIND_FEED` 🌱 - Initial growth (DOC 0-30)
- `TRAY_ACTIVE` 📊 - Tray-based feeding (DOC 30-60)
- `OPTIMIZATION` ⚡ - Peak growth (DOC 60-90)
- `HARVEST_READY` 🎯 - Ready to harvest (DOC 90-120)
- `HARVESTED` ✅ - Completed crop

### 2. **Data Structure Updates**

Each tank now includes:
```javascript
{
  lifecycleState: "TRAY_ACTIVE",
  lifecycleStateUpdatedAt: "2026-02-01T15:30:00.000Z"
}
```

### 3. **Automatic State Transitions**

State updates trigger automatically:
- After each feed entry is logged
- On app initialization
- When tank parameters are edited

### 4. **Feature Gating**

Functions now check lifecycle state before allowing actions:
```javascript
if (!app.isFeatureAvailable(tank, 'canLogFeed')) {
  // Prevent feed logging in PRE_STOCK or HARVESTED states
}
```

### 5. **Visual Indicators**

**Tank Cards:**
- Prominent lifecycle badge with icon and color
- State description text
- Color-coded backgrounds

**Tank Detail View:**
- Large lifecycle banner at top
- Shows current state, DOC, and phase info
- Gradient background matching state color

### 6. **Migration Logic**

Existing tanks automatically upgraded:
```javascript
// In loadAllData()
this.state.tanks.forEach(tank => {
  if (!tank.lifecycleState) {
    tank.lifecycleState = this.calculateLifecycleState(tank);
    tank.lifecycleStateUpdatedAt = new Date().toISOString();
  }
});
```

---

## How It Works

### State Calculation Logic

```
DOC < 0 → PRE_STOCK
DOC 0-30 (blind period) → BLIND_FEED
DOC 30-60 OR <20 tray checks → TRAY_ACTIVE
DOC 60-90 → OPTIMIZATION
DOC 90+ → HARVEST_READY
Status = harvested/archived → HARVESTED
```

### Automatic Updates

1. **Feed Logging** (`saveLogFeed`, `quickLogFeed`)
   - After feed saved → `updateTankLifecycleState(tankId)`
   - Recalculates state based on new DOC/data
   - Saves to localStorage

2. **App Initialization** (`init`)
   - Loads all data
   - Runs `updateAllLifecycleStates()`
   - Ensures all tanks have current state

3. **Tank Creation** (`saveTank`)
   - New tanks get initial state calculation
   - State set based on stocking date

---

## UI Behavior Changes

### Before
```
All ponds: Same UI, same features, no context
```

### After
```
PRE_STOCK:    ❌ No feed logging, minimal features
BLIND_FEED:   ✅ Feed logging, ❌ No tray checks
TRAY_ACTIVE:  ✅ Full features, tray workflow active
OPTIMIZATION: ✅ Full features + analytics focus
HARVEST_READY:✅ All features + harvest option
HARVESTED:    ❌ Read-only mode
```

---

## Testing Your Implementation

### Quick Test Checklist

1. **Create New Pond**
   - Should start in `BLIND_FEED` state
   - Badge should show 🌱 Blind Feeding

2. **Log Feed Entry**
   - State should update automatically
   - Check console for lifecycle_transition event

3. **Advance DOC Past 30**
   - Edit stocking date to 31+ days ago
   - Should transition to `TRAY_ACTIVE`
   - Badge should show 📊 Tray Training

4. **Try Logging Feed in PRE_STOCK**
   - Create pond with future stocking date
   - Try to log feed → Should be blocked
   - Toast message should explain why

5. **Check Tank Detail View**
   - Open any pond
   - Should see large lifecycle banner at top
   - Color should match state

### Browser Console Tests

```javascript
// Check a tank's lifecycle state
const tank = app.state.tanks[0];
console.log('State:', tank.lifecycleState);
console.log('Info:', app.getLifecycleStateInfo(tank.lifecycleState));

// Force recalculation
app.updateAllLifecycleStates();

// Check feature availability
console.log('Can log feed?', app.isFeatureAvailable(tank, 'canLogFeed'));
console.log('Can check tray?', app.isFeatureAvailable(tank, 'canCheckTray'));
```

---

## Customization Options

### Adjust State Thresholds

Edit `calculateLifecycleState()` function:

```javascript
// Change TRAY_ACTIVE to OPTIMIZATION transition
if (doc <= 70) {  // Changed from 60
  return this.LIFECYCLE_STATES.TRAY_ACTIVE;
}
```

### Modify State Colors

Edit `getLifecycleConfig()` function:

```javascript
BLIND_FEED: {
  label: 'Blind Feeding',
  icon: '🌱',
  color: '#FF9800',      // Change this
  bgColor: '#FFF3E0',    // And this
  description: 'Initial growth without tray checks',
  docRange: [0, 30]
}
```

### Add Custom States

1. Add to `LIFECYCLE_STATES` getter:
```javascript
get LIFECYCLE_STATES() {
  return {
    // ... existing states ...
    CUSTOM_STATE: 'CUSTOM_STATE'
  };
}
```

2. Add to `getLifecycleConfig()`:
```javascript
CUSTOM_STATE: {
  label: 'Custom Phase',
  icon: '🎨',
  color: '#E91E63',
  bgColor: '#FCE4EC',
  description: 'Your custom phase',
  docRange: [45, 60]
}
```

3. Update `calculateLifecycleState()` logic:
```javascript
if (doc >= 45 && doc <= 60) {
  return this.LIFECYCLE_STATES.CUSTOM_STATE;
}
```

4. Add to feature matrix in `isFeatureAvailable()`:
```javascript
CUSTOM_STATE: {
  canLogFeed: true,
  canCheckTray: true,
  canViewSchedule: true,
  canHarvest: false,
  showBlindSchedule: false
}
```

---

## Integration Points

### Where Lifecycle State is Used

1. **Tank Cards** (`getTankCardHTML`)
   - Displays lifecycle badge
   - Shows state description

2. **Tank Detail** (`renderTankDetailOverview`)
   - Large banner with state info
   - Color-coded display

3. **Feed Logging** (`openLogFeedModal`, `saveLogFeed`, `quickLogFeed`)
   - Validates state before allowing feed
   - Updates state after logging

4. **Feature Checks** (throughout app)
   - Use `isFeatureAvailable()` to gate features
   - Prevents inappropriate actions

### Adding Lifecycle Checks to New Features

```javascript
// Example: New harvest function
openHarvestModal(tankId) {
  const tank = this.getTankById(tankId);
  
  // Check if harvest is allowed
  if (!this.isFeatureAvailable(tank, 'canHarvest')) {
    const info = this.getLifecycleStateInfo(tank.lifecycleState);
    this.showToast(`Cannot harvest: ${info.label} state`, 'warning');
    return;
  }
  
  // Proceed with harvest...
}
```

---

## Performance Considerations

### State Calculation Cost
- **Low**: Simple DOC calculation + array filtering
- **Cached**: State stored in tank object
- **On-demand**: Only recalculated when needed

### Storage Impact
- **Minimal**: 2 new fields per tank (~50 bytes)
- **Efficient**: Uses existing localStorage

### Render Performance
- **Optimized**: State info cached in variables
- **No loops**: Direct object lookups

---

## Backwards Compatibility

### Existing Data
✅ **Fully compatible** - Migration runs automatically on load

### Old Code
✅ **Still works** - Lifecycle checks are additive, not breaking

### Export/Import
✅ **Supported** - Lifecycle fields included in data export

---

## Analytics & Insights

### Tracked Events

```javascript
// Lifecycle transition event
{
  event: 'lifecycle_transition',
  tank_id: '1234567890',
  from_state: 'BLIND_FEED',
  to_state: 'TRAY_ACTIVE',
  doc: 31,
  timestamp: '2026-02-01T15:30:00.000Z'
}
```

### Potential Insights

1. **Average transition times** per state
2. **Ponds that skip states** (unusual patterns)
3. **Performance by lifecycle stage**
4. **Optimal DOC for transitions**

---

## Troubleshooting

### State Not Updating

**Symptom**: Lifecycle badge shows wrong state

**Fix**:
```javascript
// Open browser console
app.updateTankLifecycleState('tankId');
app.renderAll();
```

### Features Not Gated

**Symptom**: Can log feed in PRE_STOCK state

**Check**: Ensure `isFeatureAvailable()` called before action:
```javascript
if (!app.isFeatureAvailable(tank, 'canLogFeed')) {
  return; // Block action
}
```

### Migration Not Running

**Symptom**: Old tanks missing lifecycle state

**Fix**:
```javascript
// Force migration
app.state.tanks.forEach(tank => {
  tank.lifecycleState = app.calculateLifecycleState(tank);
  tank.lifecycleStateUpdatedAt = new Date().toISOString();
});
app.saveTanks();
```

---

## Next Steps

### Immediate
1. ✅ Test on real data
2. ✅ Verify state transitions
3. ✅ Check visual indicators

### Short-term
1. Add state-based notifications
2. Create lifecycle analytics dashboard
3. Add state transition history

### Long-term
1. ML-based optimal transition prediction
2. Multi-species lifecycle definitions
3. Custom state builder UI

---

## Support

### Documentation
- `LIFECYCLE_SYSTEM.md` - Complete system documentation
- `IMPLEMENTATION_GUIDE.md` - This file

### Code References
- Lines 4140-4337: Core lifecycle system
- Lines 5385-5493: Tank card rendering
- Lines 8410-8540: Tank detail rendering
- Lines 7173-7185: Feed logging validation

### Key Functions
- `calculateLifecycleState(tank)` - Determine state
- `getLifecycleStateInfo(state)` - Get display info
- `updateTankLifecycleState(tankId)` - Update single tank
- `updateAllLifecycleStates()` - Batch update
- `isFeatureAvailable(tank, feature)` - Check permissions

---

## Summary

You now have a **production-ready lifecycle awareness system** that:

✅ Automatically tracks pond cultivation stages
✅ Adapts UI behavior based on lifecycle state
✅ Prevents incorrect actions at wrong stages
✅ Provides clear visual feedback to farmers
✅ Maintains backward compatibility
✅ Includes comprehensive analytics

The system is **extensible**, **performant**, and **farmer-friendly**.

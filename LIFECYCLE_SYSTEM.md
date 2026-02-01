# Pond Lifecycle Awareness System

## Overview

The Lifecycle Awareness System transforms AquaRythu from a "today-only feed logger" into a **crop lifecycle-aware** management platform. The system automatically tracks and adapts to each pond's stage in the cultivation cycle.

## Problem Solved

### Before (Implicit State - Dangerous ❌)
- App treated all ponds the same regardless of growth stage
- Same UI logic used everywhere
- Farmers had to mentally track which ponds were in which phase
- No automatic behavior adaptation based on crop stage

### After (Explicit State - Safe ✅)
- System-level pond state tracking
- UI automatically adapts to lifecycle stage
- Clear visual indicators of pond status
- Feature availability controlled by lifecycle state

---

## Lifecycle States

The system defines 6 distinct lifecycle states:

### 1. **PRE_STOCK** 🔧
- **Description**: Pond preparation phase
- **DOC Range**: Before stocking (DOC < 0)
- **Features Available**:
  - ❌ Cannot log feed
  - ❌ Cannot check trays
  - ❌ Cannot view schedule
  - ❌ Cannot harvest
- **UI Behavior**: Minimal functionality, preparation mode

### 2. **BLIND_FEED** 🌱
- **Description**: Initial growth without tray checks
- **DOC Range**: 0 to blind duration (default 30 days)
- **Features Available**:
  - ✅ Can log feed
  - ❌ Cannot check trays (blind feeding)
  - ✅ Can view schedule
  - ❌ Cannot harvest
  - ✅ Shows blind schedule
- **UI Behavior**: Simplified feed logging, no tray checks required

### 3. **TRAY_ACTIVE** 📊
- **Description**: Active tray-based feeding phase
- **DOC Range**: After blind period to ~60 days
- **Features Available**:
  - ✅ Can log feed
  - ✅ Can check trays
  - ✅ Can view schedule
  - ❌ Cannot harvest
  - ❌ Hides blind schedule
- **UI Behavior**: Full tray check workflow, feed adjustments based on tray results

### 4. **OPTIMIZATION** ⚡
- **Description**: Peak growth optimization phase
- **DOC Range**: 60 to 90 days
- **Features Available**:
  - ✅ Can log feed
  - ✅ Can check trays
  - ✅ Can view schedule
  - ❌ Cannot harvest
- **UI Behavior**: Advanced analytics, FCR optimization focus

### 5. **HARVEST_READY** 🎯
- **Description**: Ready for harvest
- **DOC Range**: 90 to 120 days
- **Features Available**:
  - ✅ Can log feed
  - ✅ Can check trays
  - ✅ Can view schedule
  - ✅ **Can harvest**
- **UI Behavior**: Harvest prompts, final growth tracking

### 6. **HARVESTED** ✅
- **Description**: Crop completed
- **DOC Range**: After harvest or archived
- **Features Available**:
  - ❌ Cannot log feed
  - ❌ Cannot check trays
  - ❌ Cannot view schedule
  - ❌ Cannot harvest
- **UI Behavior**: Read-only mode, historical data view

---

## Automatic State Transitions

The system automatically calculates and updates lifecycle states based on:

1. **Days of Culture (DOC)**: Primary factor for state determination
2. **Blind Duration**: Configurable per pond (default 30 days)
3. **Transition Status**: Whether pond has moved from blind to tray feeding
4. **Tray Entry Count**: Number of completed tray checks
5. **Pond Status**: Active, inactive, harvested, archived

### Transition Triggers

State transitions happen automatically when:
- **Feed is logged**: `updateTankLifecycleState()` called after each feed entry
- **App initializes**: All tanks migrated and states calculated
- **Tank is edited**: State recalculated based on new parameters
- **Manual refresh**: `updateAllLifecycleStates()` can be called anytime

---

## Implementation Details

### Core Functions

#### `calculateLifecycleState(tank)`
Determines the appropriate lifecycle state for a pond based on current data.

```javascript
const state = app.calculateLifecycleState(tank);
// Returns: 'PRE_STOCK' | 'BLIND_FEED' | 'TRAY_ACTIVE' | 'OPTIMIZATION' | 'HARVEST_READY' | 'HARVESTED'
```

#### `getLifecycleStateInfo(state)`
Returns configuration object with display properties for a state.

```javascript
const info = app.getLifecycleStateInfo('BLIND_FEED');
// Returns: { label, icon, color, bgColor, description, docRange }
```

#### `updateTankLifecycleState(tankId)`
Updates a single tank's lifecycle state and saves to storage.

```javascript
app.updateTankLifecycleState('tank123');
// Automatically called after feed logging
```

#### `updateAllLifecycleStates()`
Batch updates all active tanks' lifecycle states.

```javascript
app.updateAllLifecycleStates();
// Called on app initialization
```

#### `isFeatureAvailable(tank, feature)`
Checks if a feature is available in the tank's current lifecycle state.

```javascript
if (app.isFeatureAvailable(tank, 'canLogFeed')) {
  // Allow feed logging
}
```

### Data Structure

Each tank now includes:

```javascript
{
  id: "1234567890",
  name: "Pond A",
  // ... existing fields ...
  lifecycleState: "TRAY_ACTIVE",           // Current lifecycle state
  lifecycleStateUpdatedAt: "2026-02-01T15:30:00.000Z"  // Last state change
}
```

### Migration

Existing tanks are automatically migrated on app load:

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

## UI Adaptations

### Tank Cards
- **Lifecycle Badge**: Prominent badge showing current state with icon and color
- **Description**: Brief explanation of current phase
- **Color Coding**: Each state has unique color scheme for instant recognition

### Feed Logging
- **State Validation**: Prevents feed logging in PRE_STOCK and HARVESTED states
- **Contextual Messaging**: Shows appropriate warnings based on lifecycle state
- **Feature Gating**: Tray checks only available in appropriate states

### Visual Indicators

#### Color Scheme
- **PRE_STOCK**: Gray (#9E9E9E / #F5F5F5)
- **BLIND_FEED**: Orange (#FF9800 / #FFF3E0)
- **TRAY_ACTIVE**: Blue (#2196F3 / #E3F2FD)
- **OPTIMIZATION**: Green (#4CAF50 / #E8F5E9)
- **HARVEST_READY**: Purple (#9C27B0 / #F3E5F5)
- **HARVESTED**: Blue Gray (#607D8B / #ECEFF1)

#### Icons
- 🔧 Pre-Stocking
- 🌱 Blind Feeding
- 📊 Tray Training
- ⚡ Optimization
- 🎯 Harvest Ready
- ✅ Harvested

---

## Analytics & Tracking

The system tracks lifecycle transitions:

```javascript
this.trackEvent('lifecycle_transition', {
  tank_id: tankId,
  from_state: 'BLIND_FEED',
  to_state: 'TRAY_ACTIVE',
  doc: 31
});
```

This enables:
- Understanding typical transition timings
- Identifying ponds that deviate from normal patterns
- Optimizing lifecycle management strategies

---

## Developer Usage Examples

### Check if pond can be fed
```javascript
const tank = app.getTankById(tankId);
if (app.isFeatureAvailable(tank, 'canLogFeed')) {
  app.openLogFeedModal(tankId);
} else {
  const info = app.getLifecycleStateInfo(tank.lifecycleState);
  app.showToast(`Cannot feed: ${info.label} state`, 'warning');
}
```

### Display lifecycle badge
```javascript
const lifecycleState = tank.lifecycleState || app.calculateLifecycleState(tank);
const info = app.getLifecycleStateInfo(lifecycleState);
const badge = `
  <span style="background:${info.bgColor}; color:${info.color};">
    ${info.icon} ${info.label}
  </span>
`;
```

### Force state recalculation
```javascript
// After major data changes
app.updateAllLifecycleStates();
app.renderAll();
```

---

## Configuration

### Adjusting Lifecycle Thresholds

Edit `calculateLifecycleState()` to customize transition points:

```javascript
// Current defaults:
// BLIND_FEED: 0-30 days
// TRAY_ACTIVE: 30-60 days
// OPTIMIZATION: 60-90 days
// HARVEST_READY: 90-120 days

// Modify in the function to change thresholds
if (doc <= 60 || trayEntries.length < 20) {
  return this.LIFECYCLE_STATES.TRAY_ACTIVE;
}
```

### Per-Pond Blind Duration

Each pond can have custom blind feeding duration:

```javascript
tank.blindDuration = 35; // Override default 30 days
```

---

## Benefits

### For Farmers
1. **Clear Visual Feedback**: Instantly see which stage each pond is in
2. **Guided Workflow**: App prevents incorrect actions for current stage
3. **Better Planning**: Understand crop progression at a glance
4. **Reduced Errors**: Can't accidentally log feed in wrong lifecycle phase

### For Developers
1. **Explicit State**: No more implicit assumptions about pond status
2. **Maintainable**: Centralized state logic instead of scattered conditions
3. **Extensible**: Easy to add new states or modify transitions
4. **Type-Safe**: Clear state enum prevents typos and errors

### For Business
1. **Better Analytics**: Track performance by lifecycle stage
2. **Optimization Opportunities**: Identify best practices per stage
3. **Scalability**: System handles multiple ponds at different stages
4. **Data Quality**: Ensures data integrity through state validation

---

## Future Enhancements

Potential additions to the lifecycle system:

1. **Custom State Definitions**: Allow farmers to define their own stages
2. **State-Based Notifications**: Alerts when ponds transition states
3. **Comparative Analytics**: Compare performance across lifecycle stages
4. **Predictive Transitions**: ML-based prediction of optimal transition timing
5. **Multi-Crop Support**: Different lifecycle definitions per species
6. **State History**: Track all historical state transitions
7. **Automated Actions**: Trigger workflows on state changes

---

## Testing

### Manual Testing Checklist

- [ ] New pond starts in BLIND_FEED state
- [ ] State transitions to TRAY_ACTIVE after blind period
- [ ] Cannot log feed in PRE_STOCK state
- [ ] Cannot log feed in HARVESTED state
- [ ] Lifecycle badge displays correctly on tank cards
- [ ] State persists after app reload
- [ ] Existing ponds migrated correctly
- [ ] Analytics events fire on state transitions

### Edge Cases Handled

- Tanks with negative DOC (future stocking dates)
- Tanks with missing lifecycle state (migration)
- Tanks with custom blind durations
- Archived/inactive tanks
- Rapid state transitions

---

## Troubleshooting

### State not updating
```javascript
// Force recalculation
app.updateTankLifecycleState(tankId);
app.renderAll();
```

### Wrong state displayed
```javascript
// Check calculation logic
const tank = app.getTankById(tankId);
const calculatedState = app.calculateLifecycleState(tank);
console.log('Current:', tank.lifecycleState, 'Calculated:', calculatedState);
```

### Migration issues
```javascript
// Re-run migration
app.state.tanks.forEach(tank => {
  tank.lifecycleState = app.calculateLifecycleState(tank);
  tank.lifecycleStateUpdatedAt = new Date().toISOString();
});
app.saveTanks();
```

---

## Summary

The Lifecycle Awareness System transforms pond management from implicit to explicit state tracking, providing:

✅ **6 distinct lifecycle states** with clear transitions
✅ **Automatic state calculation** based on DOC and feeding patterns  
✅ **Feature gating** to prevent incorrect actions
✅ **Visual indicators** across all screens
✅ **Analytics tracking** for lifecycle transitions
✅ **Backward compatibility** with automatic migration

This system ensures farmers always know where each pond is in the cultivation cycle and the app adapts its behavior accordingly.

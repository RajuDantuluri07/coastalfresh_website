// ===== TRAY MODE STATE MACHINE (DOC ≥ 30) =====
// This module implements the exact per-round workflow for tray-based feeding

// STATE DEFINITIONS
const TRAY_STATES = {
  DAY_START: 'DAY_START',
  READY_TO_FEED: 'READY_TO_FEED',
  FEED_GIVEN: 'FEED_GIVEN',
  WAIT_FOR_TRAY_CHECK: 'WAIT_FOR_TRAY_CHECK',
  TRAY_CHECK_PENDING: 'TRAY_CHECK_PENDING',
  TRAY_CHECK_IN_PROGRESS: 'TRAY_CHECK_IN_PROGRESS',
  DECIDE_NEXT_FEED: 'DECIDE_NEXT_FEED',
  FARMER_CONFIRMATION: 'FARMER_CONFIRMATION',
  DAY_END: 'DAY_END'
};

// TRAY RESULT TYPES
const TRAY_RESULTS = {
  EMPTY: 'empty',
  LITTLE_LEFT: 'little',
  HALF_LEFT: 'half',
  TOO_MUCH: 'too-much',
  MISSING: 'missing',
  SKIPPED: 'skipped'
};

// Configuration
const DIGESTION_WAIT_HOURS = 2; // Minimum wait time before tray check

/**
 * Get the current state for a tank in tray mode
 * @param {Object} tank - Tank object
 * @param {Array} feedEntries - All feed entries
 * @param {string} currentDate - Current date string
 * @param {number} feedsPerDay - Number of feeds per day (default 4)
 * @returns {Object} State object with state, roundNumber, and metadata
 */
function getTrayModeState(tank, feedEntries, currentDate, feedsPerDay = 4) {
  const doc = getDaysOld(tank.stockingDate, currentDate);
  const blindDuration = tank.blindDuration || 30;
  
  // Not in tray mode
  if (doc <= blindDuration || !tank.hasTransitionedFromBlind) {
    return { state: null, roundNumber: 0, isTrayMode: false };
  }
  
  // Get today's entries for this tank
  const todayEntries = feedEntries
    .filter(e => e.tankId === tank.id && e.date === currentDate)
    .sort((a, b) => a.id - b.id);
  
  const currentRound = todayEntries.length + 1;
  
  // DAY_END: All rounds completed
  if (currentRound > feedsPerDay) {
    return {
      state: TRAY_STATES.DAY_END,
      roundNumber: feedsPerDay,
      isTrayMode: true,
      message: 'All feeding rounds completed for today'
    };
  }
  
  // DAY_START: No feeds yet today
  if (todayEntries.length === 0) {
    return {
      state: TRAY_STATES.DAY_START,
      roundNumber: 1,
      isTrayMode: true,
      message: 'Ready to start first feed of the day'
    };
  }
  
  // Get last feed entry
  const lastEntry = todayEntries[todayEntries.length - 1];
  const lastRound = lastEntry.feed_round_number || todayEntries.length;
  
  // Check if tray check is pending
  const hasTrayCheck = lastEntry.trayResult && 
    lastEntry.trayResult !== 'pending' && 
    lastEntry.trayResult !== 'blind-fed';
  
  // Check if enough time has passed for tray check (2 hours)
  const feedTime = new Date(`${currentDate}T${lastEntry.time}`);
  const now = new Date();
  const hoursSinceFeed = (now - feedTime) / (1000 * 60 * 60);
  const canCheckTray = hoursSinceFeed >= DIGESTION_WAIT_HOURS;
  
  // WAIT_FOR_TRAY_CHECK: Feed given but not enough time passed
  if (!hasTrayCheck && !canCheckTray) {
    const remainingMinutes = Math.ceil((DIGESTION_WAIT_HOURS - hoursSinceFeed) * 60);
    return {
      state: TRAY_STATES.WAIT_FOR_TRAY_CHECK,
      roundNumber: lastRound,
      isTrayMode: true,
      message: `Wait ${remainingMinutes} minutes before tray check`,
      remainingMinutes
    };
  }
  
  // TRAY_CHECK_PENDING: Time passed but tray not checked
  if (!hasTrayCheck && canCheckTray) {
    return {
      state: TRAY_STATES.TRAY_CHECK_PENDING,
      roundNumber: lastRound,
      isTrayMode: true,
      message: 'Tray check required before next feed',
      lastEntry
    };
  }
  
  // READY_TO_FEED: Tray checked, ready for next round
  if (hasTrayCheck && currentRound <= feedsPerDay) {
    return {
      state: TRAY_STATES.READY_TO_FEED,
      roundNumber: currentRound,
      isTrayMode: true,
      message: `Ready for feed round ${currentRound}`,
      lastEntry
    };
  }
  
  return {
    state: TRAY_STATES.READY_TO_FEED,
    roundNumber: currentRound,
    isTrayMode: true
  };
}

/**
 * Get planned feed amount for current round
 * @param {Object} tank - Tank object
 * @param {Array} feedEntries - All feed entries
 * @param {string} currentDate - Current date string
 * @param {number} roundNumber - Current round number
 * @returns {number} Planned kg for this round
 */
function getPlannedFeedForRound(tank, feedEntries, currentDate, roundNumber) {
  // Round 1: Get from yesterday's last decision or default
  if (roundNumber === 1) {
    // Fix: Use local date construction to avoid timezone off-by-one errors
    const [y, m, d] = currentDate.split('-').map(Number);
    const yesterdayStr = formatDate(new Date(y, m - 1, d - 1));
    
    const yesterdayEntries = feedEntries
      .filter(e => e.tankId === tank.id && e.date === yesterdayStr)
      .sort((a, b) => b.id - a.id);
    
    if (yesterdayEntries.length > 0) {
      const lastEntry = yesterdayEntries[0];
      // Use decisionKgForNextRound if available, otherwise use last amount
      if (lastEntry.decisionKgForNextRound !== undefined && lastEntry.decisionKgForNextRound !== null) {
        return lastEntry.decisionKgForNextRound;
      }
      return lastEntry.amount || 2.0;
    }
    
    // Default starting amount
    return 2.0;
  }
  
  // Round 2-4: Get from previous round's decision
  const todayEntries = feedEntries
    .filter(e => e.tankId === tank.id && e.date === currentDate)
    .sort((a, b) => a.id - b.id);
  
  const previousEntry = todayEntries[roundNumber - 2]; // -2 because array is 0-indexed
  if (previousEntry && previousEntry.decisionKgForNextRound !== undefined && previousEntry.decisionKgForNextRound !== null) {
    return previousEntry.decisionKgForNextRound;
  }
  
  // Fallback: use last entry's amount
  if (todayEntries.length > 0) {
    return todayEntries[todayEntries.length - 1].amount;
  }
  
  return 2.0;
}

/**
 * Calculate next feed suggestion based on tray results
 * @param {number} currentAmount - Current feed amount
 * @param {Array} trayResults - Array of tray result strings
 * @returns {Object} { suggestedKg, reason, adjustment }
 */
function calculateNextFeedFromTray(currentAmount, trayResults) {
  if (!trayResults || trayResults.length === 0) {
    return {
      suggestedKg: currentAmount,
      reason: 'No tray data available',
      adjustment: 0
    };
  }
  
  // Filter out missing/skipped trays
  const validResults = trayResults.filter(r => 
    r !== TRAY_RESULTS.MISSING && r !== TRAY_RESULTS.SKIPPED
  );
  
  if (validResults.length === 0) {
    return {
      suggestedKg: currentAmount,
      reason: 'All trays missing or skipped',
      adjustment: 0
    };
  }
  
  // Count each result type
  const counts = {
    empty: validResults.filter(r => r === TRAY_RESULTS.EMPTY).length,
    little: validResults.filter(r => r === TRAY_RESULTS.LITTLE_LEFT).length,
    half: validResults.filter(r => r === TRAY_RESULTS.HALF_LEFT).length,
    tooMuch: validResults.filter(r => r === TRAY_RESULTS.TOO_MUCH).length
  };
  
  const total = validResults.length;
  let adjustment = 0;
  let reason = '';
  
  // Decision logic based on tray results
  if (counts.tooMuch > 0) {
    // Any TOO_MUCH → reduce by 20%
    adjustment = -0.20;
    reason = 'Feed waste detected - reducing amount';
  } else if (counts.half / total > 0.5) {
    // Majority HALF → reduce by 10%
    adjustment = -0.10;
    reason = 'Half left in most trays - slight reduction';
  } else if (counts.empty === total) {
    // All EMPTY → increase by 10-15%
    adjustment = 0.125; // Average of 10-15%
    reason = 'All trays empty - increasing feed';
  } else if (counts.empty + counts.little === total) {
    // Mix of EMPTY + LITTLE → keep same
    adjustment = 0;
    reason = 'Good consumption - maintaining amount';
  } else {
    // Mixed results → keep same
    adjustment = 0;
    reason = 'Mixed tray results - maintaining amount';
  }
  
  const suggestedKg = parseFloat((currentAmount * (1 + adjustment)).toFixed(2));
  
  return {
    suggestedKg: Math.max(0.5, suggestedKg), // Minimum 0.5 kg
    reason,
    adjustment: adjustment * 100 // Convert to percentage
  };
}

/**
 * Check if feed can be logged for current round
 * @param {Object} state - Current tray mode state
 * @returns {Object} { canLog, reason }
 */
function canLogFeed(state) {
  if (!state.isTrayMode) {
    return { canLog: true, reason: 'Not in tray mode' };
  }
  
  if (state.state === TRAY_STATES.DAY_END) {
    return { canLog: false, reason: 'All feeding rounds completed for today' };
  }
  
  if (state.state === TRAY_STATES.WAIT_FOR_TRAY_CHECK) {
    return { 
      canLog: false, 
      reason: `Wait ${state.remainingMinutes} minutes before tray check` 
    };
  }
  
  if (state.state === TRAY_STATES.TRAY_CHECK_PENDING) {
    return { 
      canLog: false, 
      reason: 'Complete tray check before next feed' 
    };
  }
  
  if (state.state === TRAY_STATES.READY_TO_FEED || state.state === TRAY_STATES.DAY_START) {
    return { canLog: true, reason: 'Ready to log feed' };
  }
  
  return { canLog: false, reason: 'Invalid state' };
}

// Helper function to calculate days old
function getDaysOld(stockingDate, currentDateStr) {
  if (!stockingDate) return 0;
  const stocking = new Date(stockingDate);
  const today = currentDateStr ? new Date(currentDateStr) : new Date();
  const diff = today - stocking;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Helper function to format date
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRAY_STATES,
    TRAY_RESULTS,
    getTrayModeState,
    getPlannedFeedForRound,
    calculateNextFeedFromTray,
    canLogFeed
  };
}

# Tray Feed Mode - Implementation Plan

## Summary
Implementing a simplified Tray Feed Log Book page that enforces tray-based feeding discipline with a single action card approach.

## Key Functions to Add

### 1. Helper Functions (add to app.js)
```javascript
// Adjust tray feed amount (+/- buttons)
adjustTrayFeed(delta) {
  const amountEl = document.getElementById('trayFeedAmount');
  if (!amountEl) return;
  let current = parseFloat(amountEl.textContent) || 0;
  current = Math.max(0, +(current + delta).toFixed(1));
  amountEl.textContent = current;
}

// Log tray feed
logTrayFeed(tankId, roundNumber) {
  const amountEl = document.getElementById('trayFeedAmount');
  const amount = parseFloat(amountEl.textContent) || 0;
  
  if (amount <= 0) {
    alert('Please enter a valid feed amount');
    return;
  }
  
  // Save feed entry
  const now = new Date();
  const entry = {
    id: Date.now(),
    tankId: tankId,
    date: this.getFormattedDate(now),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    amount: amount,
    trayResult: 'pending',
    trayResults: [],
    supplements: [],
    feeding_mode: 'TRAY',
    feed_round_number: roundNumber
  };
  
  this.state.feedEntries.push(entry);
  this.saveFeedEntries();
  
  // Update UI
  document.getElementById('logTrayFeedBtn').style.display = 'none';
  document.getElementById('feedLoggedStatus').style.display = 'block';
  
  // Disable +/- buttons
  document.querySelectorAll('.btn-stepper').forEach(btn => btn.disabled = true);
  
  // Refresh the log book
  setTimeout(() => this.renderLogBook(), 500);
}

// Switch history tab
switchHistoryTab(tab) {
  document.querySelectorAll('.history-tab').forEach(t => {
    t.classList.remove('active');
    t.style.background = 'white';
    t.style.color = 'var(--gray)';
  });
  
  event.target.classList.add('active');
  event.target.style.background = 'var(--primary)';
  event.target.style.color = 'white';
  
  document.querySelectorAll('.history-content').forEach(c => c.style.display = 'none');
  
  const contentId = tab === 'today' ? 'historyToday' : 
                    tab === 'yesterday' ? 'historyYesterday' : 'historyLast7Days';
  const content = document.getElementById(contentId);
  if (content) content.style.display = 'block';
}

// Toggle history details
toggleHistoryDetails(entryId) {
  const details = document.getElementById('historyDetails' + entryId);
  if (!details) return;
  
  const isVisible = details.style.display !== 'none';
  details.style.display = isVisible ? 'none' : 'block';
  
  // Rotate chevron
  const row = details.parentElement;
  const chevron = row.querySelector('.fa-chevron-down');
  if (chevron) {
    chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
  }
}
```

### 2. Main Rendering Function
The `renderTrayFeedLogBookContent(tankId, tank, doc)` function will be added to replace the complex hero card logic when in tray mode.

## Structure
1. **Last Feed Round** (read-only) - Shows what happened last time
2. **Next Feed Suggestion Card** (single action) - The ONLY editable section
3. **Feed History** (collapsible) - Simple reference

## State Machine Enforcement
- Next feed BLOCKED until tray check complete
- No manual quantity change at READY_TO_FEED state
- Farmer confirmation MANDATORY
- Hard lock prevents skipping tray checks

## Files Modified
- `/public/app.js` - Add helper functions and rendering logic
- `/public/styles.css` - Already has necessary styles

## Status
✅ Reverted corrupted file
🔄 Adding helper functions
⏳ Implementing main rendering function
⏳ Testing

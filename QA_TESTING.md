# QA Testing Guide for v3.0

This document provides comprehensive test plans for validating the v3.0 browser viewer functionality.

## Test Environment Setup

**Prerequisites:**
1. VS Code with the extension loaded (press F5 in development)
2. Microsoft Edge installed
3. Test URLs ready:
   - Local server: `http://localhost:3000` (or any local dev server)
   - Public sites: `https://example.com`, `https://github.com`, `https://microsoft.com`
   - Static HTML: Create test files in workspace

**Initial Verification:**
```bash
# Build the extension
npm run build

# Verify no console errors
# Launch extension (F5) and check Debug Console
```

---

## Test Suite 1: Browser Viewing Scenarios (vscode-edge-devtools-ynn)

### 1.1 Launch Browser

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| BV-1.1.1 | Launch browser with URL | 1. `Ctrl+Shift+P`<br>2. "Microsoft Edge Tools: Launch Browser"<br>3. Enter `https://example.com` | Browser panel opens, example.com loads, title shows "Browser 1: example.com" |
| BV-1.1.2 | Launch browser with localhost | 1. Start local server on port 3000<br>2. Launch Browser<br>3. Enter `http://localhost:3000` | Panel shows "Browser 1: localhost:3000", local app loads |
| BV-1.1.3 | Launch without protocol | 1. Launch Browser<br>2. Enter `example.com` (no http://) | Auto-adds http://, navigates to site |
| BV-1.1.4 | Launch with file:// | 1. Create test.html in workspace<br>2. Launch Browser<br>3. Enter `file:///path/to/test.html` | Opens local HTML file |
| BV-1.1.5 | Launch multiple browsers | 1. Launch Browser → `https://github.com`<br>2. "New Browser Window" → `https://microsoft.com` | Two panels open, titles show "Browser 1: github.com", "Browser 2: microsoft.com" |

**Pass Criteria:**
- ✅ All sites load correctly
- ✅ Panel titles update with URLs
- ✅ No console errors
- ✅ Screencast image renders

### 1.2 Navigation

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| BV-1.2.1 | Back button | 1. Load `https://github.com`<br>2. Click link to navigate<br>3. Click Back button (←) | Navigates back, URL bar updates |
| BV-1.2.2 | Forward button | 1. Navigate to site<br>2. Click Back<br>3. Click Forward (→) | Navigates forward, URL bar updates |
| BV-1.2.3 | Reload button | 1. Load any site<br>2. Click Reload (↻) | Page reloads, content refreshes |
| BV-1.2.4 | URL bar navigation | 1. Type new URL in address bar<br>2. Press Enter | Navigates to new URL, panel title updates |
| BV-1.2.5 | Navigate command | 1. `Ctrl+Shift+P`<br>2. "Navigate Browser to URL"<br>3. Enter URL | Prompts for browser selection (if multiple), navigates |

**Pass Criteria:**
- ✅ All navigation methods work
- ✅ History tracking works correctly
- ✅ Back/Forward buttons enable/disable appropriately
- ✅ URL bar stays in sync

### 1.3 Device Emulation

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| BV-1.3.1 | Emulate iPhone 12 | 1. Load responsive site<br>2. Click device dropdown<br>3. Select "iPhone 12" | Viewport resizes to 390x844, touch mode active |
| BV-1.3.2 | Emulate iPad Pro | 1. Select "iPad Pro" from dropdown | Viewport: 1024x1366, proper rendering |
| BV-1.3.3 | Custom dimensions | 1. Select "Responsive"<br>2. Enter custom width/height | Viewport updates to custom size |
| BV-1.3.4 | Touch emulation | 1. Select mobile device<br>2. Click on page | Touch events fire (not mouse events) |
| BV-1.3.5 | User agent override | 1. Select device with different UA<br>2. Check UA in browser console | User-Agent header matches device |

**Pass Criteria:**
- ✅ Device dimensions apply correctly
- ✅ Touch mode activates for mobile devices
- ✅ User-Agent headers correct
- ✅ Responsive sites render properly

### 1.4 Inspect Mode

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| BV-1.4.1 | Open DevTools | 1. Load site<br>2. Click inspect button (🔍) | External Edge DevTools window opens |
| BV-1.4.2 | Close DevTools | 1. Open DevTools<br>2. Close DevTools window | Inspect icon returns to inactive state |
| BV-1.4.3 | Inspect element | 1. Right-click element in screencast<br>2. Select "Inspect Element" | DevTools opens with element selected |

**Pass Criteria:**
- ✅ DevTools opens in separate window
- ✅ Element inspection works
- ✅ DevTools has full functionality

### 1.5 Screencast Rendering Quality

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| BV-1.5.1 | Text rendering | Load text-heavy site (e.g., Wikipedia) | Text is crisp and readable |
| BV-1.5.2 | Image rendering | Load image gallery site | Images render without artifacts |
| BV-1.5.3 | Animation rendering | Load site with CSS animations | Animations are smooth (may have slight delay) |
| BV-1.5.4 | Scrolling | Scroll using mouse wheel on screencast | Page scrolls, screencast updates |
| BV-1.5.5 | Click interaction | Click buttons and links | Clicks register, page responds |
| BV-1.5.6 | Form input | Type in form fields | Text appears in fields, form works |

**Pass Criteria:**
- ✅ Screencast quality is acceptable for development work
- ✅ Interactions work (click, type, scroll)
- ✅ No major visual artifacts

---

## Test Suite 2: Multi-Instance Scenarios (vscode-edge-devtools-iq9)

### 2.1 Multiple Browser Windows

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| MI-2.1.1 | Open 3 browsers | 1. Launch Browser (site A)<br>2. New Browser Window (site B)<br>3. New Browser Window (site C) | 3 panels with unique titles: "Browser 1: siteA", "Browser 2: siteB", "Browser 3: siteC" |
| MI-2.1.2 | Independent operation | 1. Open 2 browsers<br>2. Navigate in Browser 1<br>3. Check Browser 2 | Browser 2 unaffected, maintains its state |
| MI-2.1.3 | Side-by-side viewing | 1. Open 2 browsers<br>2. Arrange panels side-by-side | Both visible, both functional, no interference |
| MI-2.1.4 | Simultaneous interaction | 1. Open 2 browsers<br>2. Type in Browser 1<br>3. Immediately type in Browser 2 | Both accept input independently |

**Pass Criteria:**
- ✅ Multiple browsers work independently
- ✅ No cross-instance interference
- ✅ Each maintains separate state

### 2.2 Browser Management Commands

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| MI-2.2.1 | List Open Browsers | 1. Open 3 browsers<br>2. Command: "List Open Browsers" | Shows list with all 3 browser titles |
| MI-2.2.2 | Switch to Browser | 1. Open 3 browsers<br>2. Command: "Switch to Browser"<br>3. Select Browser 2 | Browser 2 panel becomes active/visible |
| MI-2.2.3 | Close specific browser | 1. Open 3 browsers<br>2. Command: "Close Current Browser"<br>3. Select Browser 2 | Browser 2 closes, Browser 1 and 3 remain |
| MI-2.2.4 | Close last browser | 1. Open 1 browser<br>2. "Close Current Browser" | Browser closes, status bar hides |

**Pass Criteria:**
- ✅ Commands work correctly
- ✅ Browser selection UI is clear
- ✅ Closing doesn't affect other instances

### 2.3 Status Bar Integration

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| MI-2.3.1 | Status bar shows count | 1. Open 2 browsers | Status bar shows "🌐 2 Browsers" |
| MI-2.3.2 | Status bar updates | 1. Open browser (count: 1)<br>2. Open another (count: 2)<br>3. Close one (count: 1) | Count updates in real-time |
| MI-2.3.3 | Status bar click | 1. Open 3 browsers<br>2. Click status bar item | Opens "List Open Browsers" command |
| MI-2.3.4 | Status bar hides | 1. Close all browsers | Status bar item disappears |

**Pass Criteria:**
- ✅ Count is always accurate
- ✅ Updates immediately on changes
- ✅ Click action works
- ✅ Hides when no browsers open

### 2.4 Panel Titles

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| MI-2.4.1 | Unique instance numbers | Open 5 browsers | Titles numbered 1-5 in order opened |
| MI-2.4.2 | Title updates on navigation | 1. Launch browser → `github.com`<br>2. Navigate to `microsoft.com` | Title updates to "Browser 1: microsoft.com" |
| MI-2.4.3 | Localhost port display | Navigate to `localhost:3000` | Title shows "Browser 1: localhost:3000" (includes port) |
| MI-2.4.4 | No URL state | Launch browser, don't navigate | Title shows "Browser 1: Browser" |

**Pass Criteria:**
- ✅ Instance numbers are unique and sequential
- ✅ Titles update on navigation
- ✅ URL extraction works correctly

---

## Test Suite 3: Performance Testing (vscode-edge-devtools-vi2)

### 3.1 Startup Performance

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| PERF-3.1.1 | Extension activation | 1. Reload VS Code window<br>2. Note activation time | Extension activates in < 500ms |
| PERF-3.1.2 | First browser launch | 1. Command: "Launch Browser"<br>2. Time until panel appears | Panel appears in < 2 seconds |
| PERF-3.1.3 | Subsequent launches | 1. Launch 2nd browser<br>2. Time until panel appears | Panel appears in < 1 second |

**Measurement:**
```javascript
// Check VS Code Output → Extension Host
// Look for activation time
// Compare to v2.x baseline if available
```

**Pass Criteria:**
- ✅ Faster than v2.x (if measurable)
- ✅ Activation < 500ms
- ✅ Panel creation < 2s

### 3.2 Runtime Performance

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| PERF-3.2.1 | Memory usage | 1. Launch 3 browsers<br>2. Check VS Code process memory | No memory leaks, reasonable usage |
| PERF-3.2.2 | CPU usage idle | 1. Launch browser<br>2. Leave idle 5 minutes<br>3. Check CPU | Minimal CPU usage when idle |
| PERF-3.2.3 | Screencast framerate | Navigate animated site | Acceptable framerate (10-30 fps typical) |
| PERF-3.2.4 | Navigation speed | Click links in browser | Pages load quickly, no delays |

**Measurement Tools:**
- Task Manager / Activity Monitor
- VS Code Developer Tools (Help → Toggle Developer Tools)

**Pass Criteria:**
- ✅ No memory leaks over time
- ✅ Low CPU when idle
- ✅ Responsive interactions

### 3.3 Resource Usage

**Test Cases:**

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|-----------------|
| PERF-3.3.1 | Extension size | Check VSIX file size | ~900 KB (significantly smaller than v2.x) |
| PERF-3.3.2 | Install size | Install extension, check folder size | < 10 MB installed |
| PERF-3.3.3 | Network usage | Monitor network in DevTools | Only CDP WebSocket traffic, no unnecessary requests |

**Pass Criteria:**
- ✅ Package size < 1 MB
- ✅ Minimal network usage
- ✅ No background polling

---

## Regression Testing

### Essential Workflows

Test these common workflows to ensure nothing broke:

1. **Basic Preview Workflow**
   - Open project with HTML file
   - Right-click HTML file → "Open with Edge" → "Open Browser"
   - Verify file opens correctly

2. **Local Development Workflow**
   - Start dev server (e.g., `npm start`)
   - Launch browser with localhost URL
   - Edit code, save, verify hot reload works

3. **Responsive Design Workflow**
   - Load responsive site
   - Change device emulation
   - Verify site responds to viewport changes

4. **Multi-Site Development**
   - Open Browser 1 with site A
   - Open Browser 2 with site B
   - Work with both simultaneously
   - Verify no cross-contamination

---

## Bug Reporting Template

If you find issues during testing, report them with this format:

```markdown
**Test ID:** [e.g., BV-1.2.1]
**Test Name:** [e.g., Back button navigation]
**Severity:** [Critical/High/Medium/Low]

**Steps to Reproduce:**
1.
2.
3.

**Expected Result:**


**Actual Result:**


**Environment:**
- VS Code Version:
- Extension Version: 3.0.0
- OS:
- Edge Version:

**Screenshots/Logs:**
[Attach if applicable]
```

---

## Sign-Off Checklist

Mark each test suite when complete:

- [ ] **Test Suite 1:** Browser Viewing Scenarios (vscode-edge-devtools-ynn)
  - [ ] 1.1 Launch Browser (5 tests)
  - [ ] 1.2 Navigation (5 tests)
  - [ ] 1.3 Device Emulation (5 tests)
  - [ ] 1.4 Inspect Mode (3 tests)
  - [ ] 1.5 Screencast Rendering (6 tests)

- [ ] **Test Suite 2:** Multi-Instance Scenarios (vscode-edge-devtools-iq9)
  - [ ] 2.1 Multiple Browser Windows (4 tests)
  - [ ] 2.2 Browser Management Commands (4 tests)
  - [ ] 2.3 Status Bar Integration (4 tests)
  - [ ] 2.4 Panel Titles (4 tests)

- [ ] **Test Suite 3:** Performance Testing (vscode-edge-devtools-vi2)
  - [ ] 3.1 Startup Performance (3 tests)
  - [ ] 3.2 Runtime Performance (4 tests)
  - [ ] 3.3 Resource Usage (3 tests)

- [ ] **Regression Testing** (4 workflows)

**Total Test Cases:** 57

**QA Completion Date:** _____________

**Tested By:** _____________

**Issues Found:** _____________

**Ready for Release:** [ ] Yes [ ] No

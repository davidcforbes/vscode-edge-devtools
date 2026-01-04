# Feature Analysis: Stripping Down to Core Browser Viewing

## Your Goal
**Keep:** Ability to attach to Edge instance and view/drive external web pages inside VS Code
**Current State:** Single instance, single web page support
**Desired Simplification:** Remove all DevTools features, keep only browser viewing

---

## FEATURES TO **REMOVE** ✂️

### 1. **DevTools Panel** (HIGH IMPACT - Major simplification)
- **File:** `src/devtoolsPanel.ts` (~900 lines)
- **What it does:** Full Edge DevTools UI (DOM inspector, CSS editor, Console, Network, etc.)
- **Why remove:** You only want page viewing, not development tools
- **Complexity saved:**
  - DevTools CDN integration and version detection
  - Fallback chain handling
  - DevTools state persistence
  - Theme synchronization
  - Console message replay system
- **Commands to remove:**
  - Most of `vscode-edge-devtools.attach` (keep basic version)
  - DevTools-specific portions of launch

### 2. **CSS Mirror Editing** (MEDIUM IMPACT)
- **Files:** CSS sync code in `devtoolsPanel.ts`, `utils.ts`
- **What it does:** Bi-directional CSS editing between DevTools and local files
- **Why remove:** No DevTools = no CSS editing needed
- **Commands to remove:**
  - `vscode-edge-devtools-view.cssMirrorContent`
- **Complexity saved:**
  - CSS content tracking and diffing
  - File watchers for CSS files
  - Dirty document conflict resolution
  - Line ending normalization

### 3. **Webhint Integration** (MEDIUM IMPACT)
- **Files:** Webhint LSP client code in `extension.ts`
- **What it does:** Static analysis for accessibility, compatibility, security
- **Why remove:** Not needed for browser viewing
- **Settings to remove:**
  - `vscode-edge-devtools.webhint`
  - `vscode-edge-devtools.webhintInstallNotification`
- **Complexity saved:**
  - Language Server Protocol client setup
  - Diagnostic hover providers
  - Quick fix actions
  - Installation failure handling
  - `.hintrc` file watching

### 4. **JS Debug Adapter Integration** (LOW-MEDIUM IMPACT)
- **Files:** `src/JsDebugProxyPanelSocket.ts`
- **What it does:** Attach DevTools to active debug sessions via js-debug proxy
- **Why remove:** No debugging, just viewing
- **Commands to remove:**
  - `vscode-edge-devtools.attachToCurrentDebugTarget`
- **Complexity saved:**
  - Proxy socket implementation
  - Debug session coordination
  - CDP message proxying

### 5. **Advanced Launch Configuration** (LOW IMPACT)
- **Files:** `src/launchConfigManager.ts`, `src/launchDebugProvider.ts`
- **What it does:** Generates and validates launch.json, provides debug configuration snippets
- **Why remove:** Can simplify to basic settings-based launch only
- **Commands to remove:**
  - `vscode-edge-devtools-view.configureLaunchJson`
  - `vscode-edge-devtools-view.launchProject`
- **Keep simplified version:** Basic launch from settings without launch.json

### 6. **Targets Tree View** (LOW-MEDIUM IMPACT)
- **Files:** `src/cdpTargetsProvider.ts`, `src/cdpTarget.ts`
- **What it does:** Side panel showing all available browser targets with actions
- **Why remove:** Can simplify to command palette-based attachment
- **Keep minimal version:** Simple target selection dropdown without tree UI
- **Commands affected:**
  - `vscode-edge-devtools-view.refresh`
  - `vscode-edge-devtools-view.attach`
  - `vscode-edge-devtools-view.close-instance`
  - `vscode-edge-devtools-view.copyItem`

### 7. **File Opening from DevTools** (LOW IMPACT)
- **What it does:** Click on file reference in DevTools → opens in VS Code editor
- **Why remove:** No DevTools panel to click from
- **Code location:** `openInEditor` event handlers

### 8. **Path Mapping & Source Maps** (LOW IMPACT)
- **Settings to remove:**
  - `vscode-edge-devtools.webRoot`
  - `vscode-edge-devtools.pathMapping`
  - `vscode-edge-devtools.sourceMapPathOverrides`
  - `vscode-edge-devtools.sourceMaps`
- **Why remove:** Only needed for debugging/development workflows
- **Complexity saved:**
  - Webpack path resolution
  - Source map parsing
  - URL-to-file mapping

### 9. **Comprehensive Telemetry** (VERY LOW IMPACT)
- **What it does:** Tracks 30+ event types, performance metrics, errors
- **Why remove:** Reduces data collection, simplifies code
- **Option:** Keep minimal error telemetry for debugging issues
- **Complexity saved:**
  - Event tracking throughout codebase
  - Performance timing
  - Histogram tracking

### 10. **Browser Version Detection & Fallback** (LOW IMPACT)
- **Files:** `src/versionSocketConnection.ts`, fallback logic in `devtoolsPanel.ts`
- **What it does:** Detects Edge version, picks compatible DevTools version, falls back on CDN issues
- **Why remove:** Screencast doesn't need DevTools version matching
- **Keep:** Basic browser executable detection

### 11. **Console Message Collection** (LOW IMPACT)
- **What it does:** Captures console API calls during load and replays them to DevTools
- **Why remove:** No console panel to display them in
- **Code location:** `consoleMessages` array in `devtoolsPanel.ts`

### 12. **Multiple HTML File Launch Options** (VERY LOW IMPACT)
- **Commands:**
  - `vscode-edge-devtools-view.launchHtml` (Open Browser with DevTools)
  - `vscode-edge-devtools-view.launchScreencast` (Open Browser)
- **Simplify to:** Single "Open in Browser" command

---

## FEATURES TO **KEEP** ✅

### 1. **ScreencastPanel** (CORE - Essential)
- **File:** `src/screencastPanel.ts`
- **Why keep:** This IS your browser viewing functionality
- **Features:**
  - Live browser rendering via CDP screenshots
  - Navigation toolbar (back, forward, reload)
  - URL input bar
  - Mouse/keyboard input forwarding
- **Dependencies to keep:**
  - `src/screencast/` directory (all files)
  - `src/screencast/view.ts` - HTML template
  - `src/screencast/screencast.ts` - Rendering logic
  - `src/screencast/input.ts` - Input handling
  - `src/screencast/cdp.ts` - CDP helpers

### 2. **PanelSocket** (CORE - Essential)
- **File:** `src/panelSocket.ts`
- **Why keep:** Handles WebSocket communication with Edge
- **Simplification:** Remove JsDebugProxyPanelSocket variant
- **Features:**
  - WebSocket proxy to CDP target
  - Message forwarding
  - Connection lifecycle management
  - Event emitter for socket events

### 3. **Browser Launching** (CORE - Essential)
- **Code location:** `launchBrowser()` in `src/utils.ts`
- **Why keep:** Need to launch Edge instances
- **Features:**
  - Puppeteer-core integration
  - Browser flavor detection (Stable/Beta/Dev/Canary)
  - Remote debugging port setup
  - User data directory handling
- **Settings to keep:**
  - `browserFlavor`
  - `userDataDir`
  - `browserArgs`
  - `headless`

### 4. **Target Discovery & Attachment** (CORE - Essential)
- **Code location:** `getListOfTargets()`, `fixRemoteWebSocket()` in `src/utils.ts`
- **Why keep:** Need to find and attach to browser tabs
- **Simplify:** Remove tree view, use simple picker
- **Settings to keep:**
  - `hostname`
  - `port`
  - `useHttps`
  - `timeout`

### 5. **Basic Navigation** (CORE - Essential)
- **What:** URL bar, back/forward buttons, reload
- **Implementation:** Already in screencast toolbar
- **CDP commands used:**
  - `Page.navigate`
  - `Page.reload`
  - `Page.goBackInHistory`
  - `Page.goForwardInHistory`

### 6. **Device Emulation** (OPTIONAL - Nice to have)
- **Files:**
  - `src/screencast/emulatedDevices.ts` - Device profiles
  - `src/screencast/emulatedDeviceHelpers.ts` - Switching logic
  - `src/screencast/dimensionComponent.ts` - UI component
  - `src/screencast/flyoutMenuComponent.ts` - Device picker
- **Why consider keeping:** Useful for viewing at different screen sizes
- **CDP commands used:**
  - `Emulation.setDeviceMetricsOverride`
  - `Emulation.clearDeviceMetricsOverride`
- **Decision:** **RECOMMEND KEEPING** - adds value for multi-device viewing

### 7. **Inspect Mode Toggle** (OPTIONAL)
- **What:** Button to toggle element selection mode
- **Why consider keeping:** Useful even without full DevTools (can see element highlighting)
- **CDP commands used:**
  - `Overlay.setInspectMode`
- **Decision:** **RECOMMEND KEEPING** - minimal code, useful feature

### 8. **Settings Provider** (CORE - Essential)
- **File:** `src/common/settingsProvider.ts`
- **Why keep:** Centralized settings access
- **Simplify:** Remove unused setting getters

### 9. **MessageRouter** (CORE - Essential)
- **File:** `src/host/messageRouter.ts`
- **Why keep:** Coordinates webview communication
- **Usage:** Used by screencast view

### 10. **Error Handling** (CORE - Essential)
- **File:** `src/errorReporter.ts`
- **Why keep:** User-friendly error messages
- **Simplify:** Remove DevTools-specific error codes

---

## ARCHITECTURAL SIMPLIFICATION

### Current Architecture
```
Extension Host (extension.ts)
├── DevToolsPanel (full inspector UI)
│   ├── PanelSocket → Edge CDP
│   └── BrowserVersionDetectionSocket
├── ScreencastPanel (browser preview)
│   ├── PanelSocket → Edge CDP
│   └── Screencast UI components
├── CDPTargetsProvider (tree view)
└── LaunchConfigManager
```

### Simplified Architecture
```
Extension Host (extension.ts)
├── ScreencastPanel (browser preview - ONLY PANEL)
│   ├── PanelSocket → Edge CDP
│   └── Screencast UI components
└── Simple target picker (dropdown, not tree view)
```

---

## COMMAND SIMPLIFICATION

### Current Commands (17 total)
1. `attach` - Attach to target
2. `launch` - Launch Edge and attach
3. `attachToCurrentDebugTarget` - JS Debug integration
4. `vscode-edge-devtools-view.launch` - New tab
5. `vscode-edge-devtools-view.refresh` - Refresh targets
6. `vscode-edge-devtools-view.attach` - Attach from tree
7. `vscode-edge-devtools-view.close-instance` - Close target
8. `vscode-edge-devtools-view.toggleScreencast` - Toggle view
9. `vscode-edge-devtools-view.copyItem` - Copy property
10. `vscode-edge-devtools-view.openSettings` - Open settings
11. `vscode-edge-devtools-view.viewChangelog` - View changelog
12. `vscode-edge-devtools-view.viewDocumentation` - View docs
13. `vscode-edge-devtools-view.configureLaunchJson` - Generate config
14. `vscode-edge-devtools-view.launchProject` - Launch from config
15. `vscode-edge-devtools-view.cssMirrorContent` - Toggle CSS mirror
16. `vscode-edge-devtools-view.launchHtml` - Open HTML with DevTools
17. `vscode-edge-devtools-view.launchScreencast` - Open HTML with screencast

### Simplified Commands (5 total)
1. **`launch`** - Launch new Edge instance with blank page or URL
2. **`attach`** - Attach to existing Edge instance (quick pick)
3. **`navigate`** - Navigate current browser to URL (command palette)
4. **`close`** - Close current browser instance
5. **`openInBrowser`** - Right-click HTML file → open in browser

---

## SETTINGS SIMPLIFICATION

### Current Settings (14 total)
All prefixed with `vscode-edge-devtools.`

### Settings to **REMOVE**
- ❌ `webRoot` (debugging only)
- ❌ `pathMapping` (debugging only)
- ❌ `sourceMapPathOverrides` (debugging only)
- ❌ `sourceMaps` (debugging only)
- ❌ `webhint` (static analysis)
- ❌ `webhintInstallNotification` (static analysis)
- ❌ `showWorkers` (DevTools only)

### Settings to **KEEP**
- ✅ `hostname` - CDP endpoint
- ✅ `port` - CDP port
- ✅ `useHttps` - Secure connection
- ✅ `defaultUrl` - Default page to open
- ✅ `userDataDir` - Browser profile
- ✅ `headless` - Headless mode
- ✅ `browserArgs` - Custom browser args
- ✅ `timeout` - Attach timeout
- ✅ `browserFlavor` - Edge version selection

**Simplified settings: 9 total** (down from 14)

---

## FILE DELETION CANDIDATES

### Safe to Delete (11 files/directories)
1. ✂️ `src/devtoolsPanel.ts` (900 lines)
2. ✂️ `src/versionSocketConnection.ts` (100 lines)
3. ✂️ `src/JsDebugProxyPanelSocket.ts` (50 lines)
4. ✂️ `src/launchConfigManager.ts` (300 lines)
5. ✂️ `src/launchDebugProvider.ts` (150 lines)
6. ✂️ `src/cdpTargetsProvider.ts` (250 lines)
7. ✂️ `src/cdpTarget.ts` (100 lines)
8. ✂️ `src/debugTelemetryReporter.ts` (minimal)
9. ✂️ `src/host/mainHost.ts` (DevTools webview script)
10. ✂️ `startpage/` (DevTools loading page)
11. ✂️ Webhint language server code in `extension.ts`

### Must Keep (9 files/directories)
1. ✅ `src/extension.ts` (heavily modified)
2. ✅ `src/screencastPanel.ts`
3. ✅ `src/panelSocket.ts`
4. ✅ `src/utils.ts` (trim unused functions)
5. ✅ `src/errorReporter.ts`
6. ✅ `src/common/settingsProvider.ts`
7. ✅ `src/common/webviewEvents.ts`
8. ✅ `src/common/errorCodes.ts`
9. ✅ `src/screencast/` (all 10 files)

---

## CODE REDUCTION ESTIMATE

| File | Current LOC | Estimated After | Reduction |
|------|-------------|-----------------|-----------|
| `extension.ts` | 900 | 300 | 67% |
| `utils.ts` | 1000 | 400 | 60% |
| DevTools files | 1800 | 0 | 100% |
| Launch config | 450 | 0 | 100% |
| Target tree view | 350 | 0 | 100% |
| Webhint integration | 200 | 0 | 100% |
| JS Debug proxy | 50 | 0 | 100% |
| **TOTAL** | **~4750** | **~700** | **85%** |

**Expected codebase size: ~700 lines** (down from ~4750 lines)

---

## PACKAGE.JSON SIMPLIFICATION

### Contributions to Remove
- `debuggers` section (entire debug configuration provider)
- Most commands (keep only 5)
- Tree view contributions
- Menu contributions (except simplified context menu)
- Views containers (activity bar icon)
- Views (targets tree, help links)
- ViewsWelcome (welcome screens)

### Dependencies to Remove
- `vscode-chrome-debug-core` (debugging)
- `vscode-webhint` (static analysis)
- `vscode-languageclient` (LSP)
- `@opentelemetry/tracing` (telemetry)

### DevDependencies to Remove
- `@types/vscode` can stay but won't use all APIs
- Test files can be simplified significantly

---

## MULTI-INSTANCE SUPPORT

### Current Limitation
**Your observation:** "allows a single instance and a single web page display, but not multiple"

### Root Cause
```typescript
// In screencastPanel.ts
static instance: ScreencastPanel | undefined;

// Singleton pattern prevents multiple instances
if (ScreencastPanel.instance) {
    ScreencastPanel.instance.panel.reveal();
    return;
}
```

### To Enable Multiple Instances
**Simple modification:**
```typescript
// Change from singleton to instance tracking
private static instances = new Map<string, ScreencastPanel>();

// Allow multiple panels
const panelId = `screencast-${Date.now()}`;
const instance = new ScreencastPanel(...);
ScreencastPanel.instances.set(panelId, instance);

// Clean up on dispose
panel.onDidDispose(() => {
    ScreencastPanel.instances.delete(panelId);
});
```

**Additional changes needed:**
1. Track multiple browser instances (currently singleton `browserInstance`)
2. Allow multiple PanelSocket connections
3. Update command handling to support "current" vs "new" instance
4. Add panel identifier to distinguish between instances

**Complexity:** LOW - ~50 lines of changes across 2 files

---

## RECOMMENDED IMPLEMENTATION PLAN

### Phase 1: Core Stripping (HIGH PRIORITY)
1. Remove DevToolsPanel class and all references
2. Remove webhint integration
3. Remove launch configuration management
4. Remove JS Debug proxy integration
5. Remove target tree view provider
6. Update extension.ts activation to only create ScreencastPanel
7. Simplify command registrations

**Estimated effort:** 2-3 hours
**LOC reduction:** ~3000 lines

### Phase 2: Settings & Configuration (MEDIUM PRIORITY)
1. Remove unused settings from package.json
2. Update SettingsProvider to remove unused getters
3. Simplify configuration schema
4. Remove debug configuration provider

**Estimated effort:** 1 hour
**LOC reduction:** ~500 lines

### Phase 3: Utilities Cleanup (MEDIUM PRIORITY)
1. Remove path mapping functions
2. Remove source map utilities
3. Remove DevTools version detection
4. Remove CSS mirror editing code
5. Trim telemetry to minimal error reporting

**Estimated effort:** 1-2 hours
**LOC reduction:** ~800 lines

### Phase 4: Multi-Instance Support (OPTIONAL)
1. Convert singleton pattern to instance tracking
2. Allow multiple browser instances
3. Add panel management commands
4. Update UI to show active instances

**Estimated effort:** 2-3 hours
**LOC addition:** ~100 lines (net positive for features)

### Phase 5: Polish (LOW PRIORITY)
1. Update README to reflect simplified scope
2. Update package.json description
3. Remove unused dependencies
4. Simplify tests
5. Update icons/branding if desired

**Estimated effort:** 1-2 hours

---

## TOTAL EFFORT ESTIMATE

**Core stripping (Phases 1-3):** 4-6 hours
**Multi-instance support (Phase 4):** 2-3 hours
**Polish (Phase 5):** 1-2 hours

**Total: 7-11 hours** for complete transformation

---

## FEASIBILITY: ✅ **HIGHLY FEASIBLE**

### Reasons
1. **Clean separation:** DevTools and Screencast are already separate panels
2. **Minimal dependencies:** Screencast has few dependencies on DevTools code
3. **Well-structured:** Component-based architecture makes removal clean
4. **No deep coupling:** Features are largely independent
5. **Multi-instance:** Simple pattern change, already using webview panels

### Risks
1. **Low:** Screencast might have hidden dependencies on DevTools features
2. **Low:** CDP protocol changes between versions (mitigated by keeping basic commands)
3. **Very Low:** Breaking changes in VS Code webview API (stable API)

### Benefits
1. **85% code reduction** - Much simpler codebase
2. **Faster startup** - No DevTools CDN loading, no webhint LSP
3. **Lower memory** - Only screencast rendering, no full DevTools UI
4. **Clearer purpose** - "Browser viewer" vs "Developer tools"
5. **Easier maintenance** - Fewer features to update/test

---

## CONCLUSION

**YES, this codebase can absolutely be stripped down to just browser viewing functionality.**

The architecture is well-suited for this transformation because:
- ScreencastPanel is already independent
- DevTools features are cleanly separated
- Most complexity is in features you want to remove
- Multi-instance support is straightforward to add

**Recommended approach:**
1. Start with Phase 1 (core stripping)
2. Test thoroughly with basic viewing
3. Add multi-instance support (Phase 4)
4. Polish as needed

You'll end up with a ~700-line extension that does exactly what you want: attach to Edge, view and navigate web pages in VS Code, with optional device emulation.

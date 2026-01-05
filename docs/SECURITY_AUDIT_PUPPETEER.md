# Puppeteer-Core Security Audit

**Date**: 2026-01-04
**Scope**: Review puppeteer-core usage for security risks
**Files Audited**: src/utils.ts, src/extension.ts, package.json

## Executive Summary

This audit identifies **4 high-severity** and **2 medium-severity** security issues in the puppeteer-core usage within vscode-edge-devtools. The primary concerns are:
- Forced disabling of browser sandbox (high)
- Unsanitized user-provided browser arguments (high)
- Resource leaks leading to orphaned browser processes (medium)
- Temporary directory accumulation (medium)

## Puppeteer-Core Usage Overview

### Current Implementation
The extension uses puppeteer-core v23.12.1 to:
1. Launch Microsoft Edge browser instances programmatically
2. Connect to CDP (Chrome DevTools Protocol) endpoints
3. Manage browser lifecycle for screencast preview functionality

### Entry Points
- **src/utils.ts:434** - `puppeteer.launch()` called from `launchBrowser()`
- **src/extension.ts:300, 334** - Browser instances created but not properly cleaned up

---

## Security Issues

### 🔴 CRITICAL: Forced --no-sandbox Flag

**Location**: src/utils.ts:416
**Severity**: High (Security)
**CVSS Score**: 8.1 (High)

#### Issue
```typescript
const args = [
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    '--disable-features=ProcessPerSiteUpToMainFrameThreshold',
    '--no-sandbox', // ⚠️ HARDCODED - Disables Chromium sandbox
    targetUrl,
];
```

#### Impact
- Disables Chromium's security sandbox entirely
- Browser processes run with full system privileges
- Malicious web content can escape sandbox and access file system, network, processes
- Enables arbitrary code execution on host system
- Violates principle of least privilege

#### Risk Scenarios
1. User opens malicious HTML file via extension → Code execution on host
2. User navigates to compromised website → Full system access
3. XSS in previewed application → System compromise

#### Mitigations

**Option 1: Remove --no-sandbox (Recommended)**
```typescript
const args = [
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    '--disable-features=ProcessPerSiteUpToMainFrameThreshold',
    // REMOVED: --no-sandbox
    targetUrl,
];
```
- **Pros**: Restores full sandbox security
- **Cons**: May cause issues on some Linux environments without proper kernel config
- **Testing**: Verify on Windows, macOS, Linux (Ubuntu, Fedora)

**Option 2: Conditional sandbox disabling**
```typescript
const args = [...baseArgs];

// Only disable sandbox if explicitly opted-in via setting
if (SettingsProvider.instance.getDisableSandbox()) {
    args.push('--no-sandbox');
    // Warn user of security implications
    vscode.window.showWarningMessage(
        'Browser sandbox disabled. This reduces security. Use only if necessary.',
        { modal: true }
    );
}
```

**Option 3: Use single-process mode instead**
```typescript
// If the issue is process isolation, use:
'--single-process'  // Instead of --no-sandbox
```
- Less severe than --no-sandbox
- Still reduces security, but maintains some isolation

**Recommendation**: Implement Option 1 (remove --no-sandbox). If issues arise, fall back to Option 2 with explicit user consent.

---

### 🔴 HIGH: Unsanitized Browser Arguments

**Location**: src/utils.ts:422-432, 499-502
**Severity**: High (Security)
**CVSS Score**: 7.3 (High)

#### Issue
```typescript
export function getBrowserArgs(): string[] {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const browserArgs: string[] = settings.get('browserArgs') || [];
    return browserArgs.map(arg => arg.trim()); // ⚠️ NO VALIDATION
}

// Only filters duplicates, not dangerous flags
browserArgs = browserArgs.filter(arg =>
    !arg.startsWith('--remote-debugging-port') &&
    arg !== targetUrl
);
```

#### Impact
- Users can inject arbitrary browser flags via VS Code settings
- Enables additional attack vectors beyond --no-sandbox
- Can disable security features, load malicious extensions, bypass policies

#### Dangerous Flags (Examples)
```javascript
"vscode-edge-devtools.browserArgs": [
    "--disable-web-security",           // Disables same-origin policy
    "--disable-site-isolation-trials",  // Disables site isolation
    "--allow-file-access-from-files",   // File:// can access any file
    "--disable-features=IsolateOrigins",// Bypasses origin isolation
    "--load-extension=/path/to/malware",// Loads arbitrary extension
    "--disable-gpu-sandbox",            // Disables GPU process sandbox
    "--disable-setuid-sandbox",         // Disables setuid sandbox (Linux)
    "--allow-running-insecure-content", // Mixed content allowed
    "--user-data-dir=/tmp/hijacked"     // Can access another user's session
]
```

#### Mitigations

**Option 1: Allowlist Approach (Recommended)**
```typescript
const SAFE_BROWSER_FLAGS = new Set([
    // Display flags
    '--window-size',
    '--window-position',
    '--start-maximized',
    '--start-fullscreen',

    // Performance flags (non-security)
    '--enable-gpu-rasterization',
    '--enable-zero-copy',

    // Debugging flags (limited)
    '--enable-logging',
    '--v',
    '--vmodule',

    // Locale/language
    '--lang',
    '--accept-lang',
]);

export function getBrowserArgs(): string[] {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const browserArgs: string[] = settings.get('browserArgs') || [];

    return browserArgs
        .map(arg => arg.trim())
        .filter(arg => {
            const flag = arg.split('=')[0];
            if (!SAFE_BROWSER_FLAGS.has(flag)) {
                console.warn(`[Security] Blocked unsafe browser flag: ${flag}`);
                return false;
            }
            return true;
        });
}
```

**Option 2: Blocklist Approach**
```typescript
const DANGEROUS_FLAGS = new Set([
    '--no-sandbox',
    '--disable-web-security',
    '--disable-site-isolation-trials',
    '--allow-file-access-from-files',
    '--disable-features=IsolateOrigins',
    '--load-extension',
    '--disable-gpu-sandbox',
    '--disable-setuid-sandbox',
    '--allow-running-insecure-content',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
]);

export function getBrowserArgs(): string[] {
    const settings = vscode.workspace.getConfiguration(SETTINGS_STORE_NAME);
    const browserArgs: string[] = settings.get('browserArgs') || [];

    return browserArgs
        .map(arg => arg.trim())
        .filter(arg => {
            const flag = arg.split('=')[0];
            if (DANGEROUS_FLAGS.has(flag) || flag.startsWith('--disable-')) {
                throw new Error(
                    `Dangerous browser flag blocked for security: ${flag}`
                );
            }
            return true;
        });
}
```

**Recommendation**: Implement Option 1 (allowlist). It's more secure than blocklist (which can be bypassed with new flags).

---

### 🟠 MEDIUM: Orphaned Browser Processes

**Location**: src/extension.ts:34, 300-335
**Severity**: Medium (Stability + Security)

#### Issue
```typescript
const browserInstances = new Map<string, Browser>();

// Browsers added to map but NEVER removed or closed
const browser = await launchBrowser(browserPath, 0, url, userDataDir, false);
browserInstances.set(url, browser); // ⚠️ NO CLEANUP
```

#### Impact
- Browser processes never terminated, run indefinitely
- Memory leak: Browser objects accumulate
- Each browser uses 200-500MB RAM + CPU
- Security: Orphaned browsers may serve as attack vector
- Can exhaust system resources (DoS)

#### Attack Scenario
1. User opens 50 browser instances via extension
2. User closes all VS Code panels
3. All 50 browser processes remain running
4. Attacker can potentially connect to orphaned CDP endpoints
5. System becomes slow/unresponsive (resource exhaustion)

#### Mitigations

**Option 1: Cleanup on Panel Dispose (Recommended)**
```typescript
// In ScreencastPanel.dispose()
dispose(): void {
    if (this.isDisposed) {
        return;
    }
    this.isDisposed = true;

    // Remove from instances map
    ScreencastPanel.instances.delete(this.panelId);

    // Close socket
    this.panelSocket.dispose();

    // NEW: Close associated browser process
    const browser = browserInstances.get(this.panelId);
    if (browser) {
        browser.close().catch(err => {
            console.error('[ScreencastPanel] Error closing browser:', err);
        });
        browserInstances.delete(this.panelId);
    }

    // Existing notification logic...
}
```

**Option 2: Browser Instance Manager**
```typescript
class BrowserInstanceManager {
    private instances = new Map<string, Browser>();
    private timers = new Map<string, NodeJS.Timeout>();

    register(id: string, browser: Browser): void {
        this.instances.set(id, browser);
        // Auto-cleanup after 1 hour of inactivity
        this.resetTimeout(id);
    }

    unregister(id: string): void {
        const browser = this.instances.get(id);
        if (browser) {
            browser.close();
            this.instances.delete(id);
            this.clearTimeout(id);
        }
    }

    private resetTimeout(id: string): void {
        this.clearTimeout(id);
        this.timers.set(id, setTimeout(() => {
            console.warn(`[BrowserManager] Auto-closing inactive browser: ${id}`);
            this.unregister(id);
        }, 60 * 60 * 1000)); // 1 hour
    }
}
```

**Recommendation**: Implement Option 1 immediately. Consider Option 2 for additional safety.

---

### 🟠 MEDIUM: Temporary Directory Accumulation

**Location**: src/utils.ts:295-300
**Severity**: Medium (Stability)

#### Issue
```typescript
if (userDataDir === true || (typeof userDataDir === 'undefined' && browserPathSet === 'Default')) {
    // Creates unique temp directory per launch
    userDataDir = path.join(
        os.tmpdir(),
        `vscode-edge-devtools-userdatadir_${port}_${Date.now()}`
    );
    if (!fse.pathExistsSync(userDataDir)) {
        fse.mkdirSync(userDataDir); // ⚠️ NEVER CLEANED UP
    }
}
```

#### Impact
- Each browser launch creates new temp directory
- Directories never deleted
- Can accumulate hundreds of GB over time
- Each directory contains:
  - Browser profile (5-50MB)
  - Cache (50-500MB)
  - Cookies, local storage
  - Extensions (if any)
- Eventually fills disk space

#### Mitigations

**Option 1: Cleanup on Browser Close**
```typescript
async function launchBrowser(...): Promise<Browser> {
    // ... existing code ...

    const createdUserDataDir = (userDataDir === true || ...)
        ? path.join(os.tmpdir(), ...)
        : null;

    const browser = await puppeteer.launch({...});

    // Cleanup when browser closes
    if (createdUserDataDir) {
        browser.on('disconnected', () => {
            fse.remove(createdUserDataDir).catch(err => {
                console.error('[Cleanup] Failed to remove userDataDir:', err);
            });
        });
    }

    return browser;
}
```

**Option 2: Periodic Cleanup**
```typescript
function cleanupOldUserDataDirs(): void {
    const tmpDir = os.tmpdir();
    const pattern = /^vscode-edge-devtools-userdatadir_/;

    fse.readdir(tmpDir, (err, files) => {
        if (err) return;

        files.filter(f => pattern.test(f)).forEach(dir => {
            const fullPath = path.join(tmpDir, dir);
            const stats = fse.statSync(fullPath);

            // Delete if older than 7 days
            if (Date.now() - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
                fse.remove(fullPath).catch(err => {
                    console.error('[Cleanup] Failed to remove old userDataDir:', err);
                });
            }
        });
    });
}

// Call on extension activation
export function activate(context: vscode.ExtensionContext) {
    cleanupOldUserDataDirs();
    // ... rest of activation ...
}
```

**Option 3: Reuse Single Directory**
```typescript
// Single persistent directory instead of one-per-launch
if (userDataDir === true || ...) {
    userDataDir = path.join(
        os.tmpdir(),
        'vscode-edge-devtools-userdatadir' // No timestamp, reuse same dir
    );
    if (!fse.pathExistsSync(userDataDir)) {
        fse.mkdirSync(userDataDir);
    }
}
```

**Recommendation**: Implement Option 1 (cleanup on disconnect). Add Option 2 as belt-and-suspenders.

---

## Additional Findings

### Info: Puppeteer Version
**Current**: puppeteer-core@23.12.1
**Latest**: Check regularly for security updates
**Recommendation**: Monitor https://github.com/puppeteer/puppeteer/security/advisories

### Info: CDP Endpoint Exposure
**Location**: All browser launches
**Issue**: Remote debugging port exposed on localhost
**Risk**: Low (localhost only, but could be exploited by malicious local apps)
**Mitigation**: Document that users should not run untrusted local applications while using extension

---

## Summary of Recommendations

| Issue | Severity | Priority | Recommended Action |
|-------|----------|----------|-------------------|
| Forced --no-sandbox | High | P0 | Remove flag immediately |
| Unsanitized browserArgs | High | P0 | Implement allowlist validation |
| Orphaned browser processes | Medium | P1 | Add cleanup in Panel.dispose() |
| Temp directory leak | Medium | P1 | Cleanup on browser disconnect |

---

## Implementation Checklist

- [ ] Remove --no-sandbox flag from launchBrowser()
- [ ] Implement browserArgs allowlist validation
- [ ] Add browser.close() in ScreencastPanel.dispose()
- [ ] Track browser instances in browserInstances Map
- [ ] Cleanup userDataDir on browser disconnect
- [ ] Add periodic cleanup for old temp directories
- [ ] Add security warning to README/docs
- [ ] Update CLAUDE.md with security best practices
- [ ] Test on Windows, macOS, Linux
- [ ] Monitor puppeteer-core security advisories

---

## Testing Recommendations

### Security Testing
1. **Sandbox Test**: Verify browser runs with sandbox enabled (check process flags)
2. **Argument Validation**: Attempt to inject dangerous flags, verify blocking
3. **Resource Cleanup**: Launch 10 browsers, close panels, verify processes terminate
4. **Disk Cleanup**: Launch 10 browsers, verify temp dirs removed

### Regression Testing
1. Verify browser preview still works on all platforms
2. Verify device emulation functionality intact
3. Verify multi-instance support works
4. Check for performance regressions

---

**Auditor**: Claude Sonnet 4.5
**Generated**: 2026-01-04 via Claude Code

# Migration Guide: v2.x to v3.0

## Overview

Version 3.0 represents a fundamental transformation of this extension from a full DevTools integration to a focused **browser viewing experience**. This guide will help you understand what changed, why it changed, and how to adapt your workflow.

## What Changed?

### The Big Picture

**Before (v2.x):** Full Microsoft Edge DevTools embedded in VS Code with integrated debugging, CSS mirroring, webhint analysis, and full panel access.

**Now (v3.0):** Lightweight browser viewer focused on previewing web applications inside VS Code with enhanced multi-instance support.

**Why?** The transformation reduced the codebase by 85% (from ~4,750 to ~700 lines), resulting in:
- Faster performance and smaller installation size
- Simpler, more maintainable architecture
- Clearer focus on core browser viewing functionality
- Better multi-instance support

## Breaking Changes

### 🚨 Removed Features

The following features have been **completely removed** in v3.0:

| Feature | Status | Alternative |
|---------|--------|-------------|
| **DevTools Panels** (Elements, Console, Network, Performance, Memory, Application) | ❌ Removed | Use Microsoft Edge DevTools directly (F12) |
| **CSS Mirroring** (Live editing with source maps) | ❌ Removed | Use VS Code Live Server + browser DevTools |
| **Webhint Integration** (Code hints and accessibility) | ❌ Removed | Install standalone [webhint extension](https://marketplace.visualstudio.com/items?itemName=webhint.vscode-webhint) |
| **Debugging Features** (Breakpoints, debugger protocol) | ❌ Removed | Use VS Code's built-in JavaScript debugger |
| **Source Editing** (Edit sources from DevTools) | ❌ Removed | Edit directly in VS Code editor |
| **Inspect Element Mode** | ❌ Removed | Use browser DevTools (F12) |
| **Network Panel** | ❌ Removed | Use browser DevTools Network tab |
| **Console Panel** | ❌ Removed | Use browser DevTools Console |

### ✅ What Still Works

The core browser viewing functionality **remains fully functional** and is better than ever:

- ✅ **Live browser preview** inside VS Code
- ✅ **Device emulation** with emulation toolbar
- ✅ **Multiple browser instances** (now with better support!)
- ✅ **Instant updates** as you edit code
- ✅ **WebSocket-based CDP connection**

## New Features in v3.0

### 1. Enhanced Multi-Instance Support

**What's New:**
- Open unlimited browser windows simultaneously
- Each instance runs independently with no interference
- Instance-numbered panel titles (e.g., "Browser 1: localhost:3000")
- Titles automatically update when you navigate
- Status bar shows total browser count

**Usage:**
```
Command Palette → "Microsoft Edge Tools: New Browser Window"
```

**Status Bar:**
Click the status bar item (🌐 2 Browsers) to list and switch between instances.

### 2. Browser Management Commands

| Command | Purpose |
|---------|---------|
| `New Browser Window` | Open additional browser instance |
| `List Open Browsers` | View all open browsers |
| `Switch to Browser` | Quick switcher for instances |
| `Close Current Browser` | Close active browser panel |

### 3. Smart Panel Titles

Panel titles now show:
- **Instance number** (Browser 1, Browser 2, etc.)
- **Current page** (domain or localhost:port)

Example: `Browser 2: github.com`

## Migration Scenarios

### Scenario 1: I Used DevTools Panels Heavily

**Problem:** Elements, Console, Network panels are gone.

**Solution:**
1. Use the extension for **viewing** your application
2. Press `F12` in the browser panel to open **full Edge DevTools** in separate window
3. Or right-click in browser panel → "Inspect Element"

**Why this works:** The extension launches real Microsoft Edge instances, so all DevTools functionality is available via F12 or right-click menu.

### Scenario 2: I Used CSS Mirroring

**Problem:** Live CSS editing with source map sync is removed.

**Solution:**
1. Install [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
2. Use Live Server + browser DevTools for live editing
3. Edit CSS directly in VS Code (changes reload automatically)

**Alternative:** Consider using CSS hot module replacement (HMR) in your build tool.

### Scenario 3: I Used Webhint for Accessibility

**Problem:** Integrated webhint analysis is removed.

**Solution:**
Install the standalone webhint extension:
```
ext install webhint.vscode-webhint
```

This provides the same functionality as a dedicated extension.

### Scenario 4: I Used the Debugger

**Problem:** Integrated debugging is removed.

**Solution:**
Use VS Code's built-in JavaScript debugger:

1. Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "msedge",
      "request": "launch",
      "name": "Launch Edge",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

2. Press `F5` to start debugging with full breakpoint support

**Why this works:** VS Code's debugger is more powerful and better integrated with the editor.

### Scenario 5: I Want Multiple Browser Instances

**Great news!** This is now **better** in v3.0.

**Before (v2.x):** Limited multi-instance support, unclear which browser was which.

**Now (v3.0):**
1. Open first browser: `Launch Browser`
2. Open more: `New Browser Window` (repeat as needed)
3. See count in status bar: `🌐 3 Browsers`
4. Click status bar to list and switch between them
5. Each panel shows unique title: `Browser 1: localhost:3000`

## Configuration Changes

### Removed Settings

The following settings have been removed:

- ~~`vscode-edge-devtools.mirrorEdits`~~ (CSS mirroring)
- ~~`vscode-edge-devtools.webhint`~~ (webhint integration)
- ~~`vscode-edge-devtools.enableDebugger`~~ (debugging features)

### Existing Settings (Still Valid)

These settings continue to work:

- `vscode-edge-devtools.hostname` - CDP endpoint hostname
- `vscode-edge-devtools.port` - CDP endpoint port
- `vscode-edge-devtools.useHttps` - Use HTTPS for CDP
- `vscode-edge-devtools.defaultUrl` - Default browser URL
- `vscode-edge-devtools.userDataDir` - Custom user data directory
- `vscode-edge-devtools.headless` - Run in headless mode
- `vscode-edge-devtools.browserArgs` - Custom browser arguments
- `vscode-edge-devtools.timeout` - Connection timeout
- `vscode-edge-devtools.browserFlavor` - Edge version selection

## Frequently Asked Questions

### Q: Can I still use DevTools features?

**A:** Yes! Press `F12` in the browser panel or right-click → "Inspect Element". The extension launches real Edge instances with full DevTools available.

### Q: Why were DevTools panels removed?

**A:** The embedded DevTools required 4,000+ lines of complex code and had issues with maintenance and performance. The extension now focuses on what it does best: browser viewing with multi-instance support.

### Q: Will the removed features come back?

**A:** No. The v3.0 architecture is intentionally streamlined. Use browser DevTools (F12) for debugging and inspection features.

### Q: How do I debug my application now?

**A:** Use VS Code's built-in JavaScript debugger (press F5) or Edge DevTools (F12 in browser panel). Both are more powerful than the embedded debugging was.

### Q: Can I stay on v2.x?

**A:** Yes, but v2.x will not receive updates. We recommend migrating to v3.0 and using the alternatives listed in this guide.

### Q: What about accessibility testing?

**A:** Install the [webhint extension](https://marketplace.visualstudio.com/items?itemName=webhint.vscode-webhint) or use [axe DevTools](https://www.deque.com/axe/browser-extensions/) in the browser.

### Q: I need to edit CSS live. What now?

**A:** Use Live Server extension + browser DevTools, or set up hot module replacement (HMR) in your build tool (Vite, webpack, etc.).

## Recommended Workflow for v3.0

### For Single-Page Development

1. Open your project in VS Code
2. `Ctrl+Shift+P` → "Microsoft Edge Tools: Launch Browser"
3. Enter your localhost URL (e.g., `http://localhost:3000`)
4. Edit code in VS Code → changes appear in browser panel
5. Press `F12` in browser if you need DevTools

### For Multi-Site Development

1. Launch first browser: `Launch Browser` → enter URL 1
2. Launch second browser: `New Browser Window` → enter URL 2
3. Arrange panels side-by-side in VS Code
4. Status bar shows: `🌐 2 Browsers`
5. Click status bar to switch between instances

### For Responsive Testing

1. Launch browser with your site
2. Click device emulation toolbar in browser panel
3. Select device preset or enter custom dimensions
4. Test different viewports without external tools

## Getting Help

If you encounter issues during migration:

1. **Check this guide** for alternatives to removed features
2. **Review the README** for current feature documentation
3. **Check the changelog** (CHANGELOG.md) for detailed change list
4. **Open an issue** on [GitHub](https://github.com/Microsoft/vscode-edge-devtools/issues)

## Summary

**What you lost:** Embedded DevTools panels, CSS mirroring, webhint, debugging
**What you gained:** Faster performance, better multi-instance support, simpler architecture
**What stayed the same:** Core browser viewing experience
**What got better:** Multi-instance management, panel titles, status bar integration

The v3.0 extension is **purpose-built for browser viewing**. For DevTools features, use the full browser DevTools (F12) or VS Code's debugger—both are better suited for those tasks.

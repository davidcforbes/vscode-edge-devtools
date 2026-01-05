# WebSocket/CDP Communication Security Audit

**Date**: 2026-01-04
**Scope**: Review WebSocket/CDP message handling and target validation
**Files Audited**: src/panelSocket.ts, src/screencast/cdp.ts, src/common/webviewEvents.ts, src/utils.ts

## Executive Summary

This audit identifies **2 high-severity** and **1 medium-severity** security issues in the WebSocket and Chrome DevTools Protocol (CDP) communication layer. The primary concerns are:
- TLS certificate validation disabled for CDP HTTP endpoints (high)
- Missing type guards for WebSocket messages (medium)
- Unsafe message deserialization patterns (medium)

## WebSocket/CDP Architecture Overview

### Communication Flow

```
┌──────────────────────────────────────────────────────────┐
│                   VS Code Extension Host                  │
│                                                            │
│  ┌──────────────┐         ┌───────────────────────┐      │
│  │  extension.ts│────────>│  ScreencastPanel       │      │
│  │              │         │                        │      │
│  └──────────────┘         │  ┌─────────────────┐  │      │
│                           │  │  PanelSocket     │  │      │
│                           │  │  (WS Proxy)      │  │      │
│                           │  └────────┬─────────┘  │      │
│                           │           │            │      │
│                           │  ┌────────▼─────────┐  │      │
│                           │  │  Webview         │  │      │
│                           │  │  (screencast.ts) │  │      │
│                           │  └──────────────────┘  │      │
│                           └───────────────────────┘       │
└──────────────────────────────────┬───────────────────────┘
                                   │ WebSocket
                                   ▼
                        ┌──────────────────────┐
                        │  Microsoft Edge      │
                        │  CDP Endpoint        │
                        │  ws://localhost:9222 │
                        └──────────────────────┘
```

### Message Flow
1. **Webview → Extension**: User actions encoded via `encodeMessageForChannel()`
2. **Extension → Browser**: CDP commands via WebSocket (PanelSocket)
3. **Browser → Extension**: CDP events via WebSocket
4. **Extension → Webview**: Events decoded via `parseMessageFromChannel()`

---

## Security Issues

### 🔴 HIGH: TLS Certificate Validation Disabled

**Location**: src/utils.ts:161
**Severity**: High (Security)
**CVSS Score**: 7.4 (High)

#### Issue
```typescript
export function fetchUri(uri: string, options: https.RequestOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(uri);
        const get = (parsedUrl.protocol === 'https:' ? https.get : http.get);
        options = {
            rejectUnauthorized: false, // ⚠️ DISABLES SSL/TLS VERIFICATION
            ...parsedUrl,
            ...options,
            method: 'PUT',
        } as http.RequestOptions;
        // ...
    });
}
```

#### Impact
- Vulnerable to Man-in-the-Middle (MITM) attacks
- Attacker can intercept CDP target list requests
- Attacker can inject malicious target entries
- Can lead to browser control hijacking

#### Used By
```typescript
// src/utils.ts:445 - Fetch CDP target list
const data = await fetchUri(`${useHttps ? 'https' : 'http'}://${hostname}:${port}/json`);

// src/utils.ts:475 - Create new CDP target
const data = await fetchUri(
    `${useHttps ? 'https' : 'http'}://${hostname}:${port}/json/new?${url}`
);
```

#### Attack Scenario
1. Attacker performs MITM on localhost traffic (via malicious proxy, malware, etc.)
2. Extension requests CDP target list via HTTPS with `rejectUnauthorized: false`
3. Attacker presents fake certificate (not rejected)
4. Attacker returns malicious target list with ws://attacker.com/devtools/page/MALICIOUS
5. Extension connects to attacker's WebSocket server
6. Attacker gains full CDP access to user's browser session

#### Mitigations

**Option 1: Enable TLS Verification (Recommended)**
```typescript
export function fetchUri(uri: string, options: https.RequestOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(uri);
        const get = (parsedUrl.protocol === 'https:' ? https.get : http.get);
        options = {
            // REMOVED: rejectUnauthorized: false
            ...parsedUrl,
            ...options,
            method: 'PUT',
        } as http.RequestOptions;
        // ...
    });
}
```

**Option 2: Localhost Exception Only**
```typescript
const isLocalhost = hostname === 'localhost' ||
                   hostname === '127.0.0.1' ||
                   hostname === '::1';

options = {
    rejectUnauthorized: isLocalhost ? true : true, // Always verify
    ...parsedUrl,
    ...options,
    method: 'PUT',
} as http.RequestOptions;
```

**Option 3: Remove HTTPS Support for CDP**
```typescript
// CDP endpoints are typically HTTP-only on localhost
// Remove HTTPS option entirely for security
const data = await fetchUri(`http://${hostname}:${port}/json`);
```

**Recommendation**: Implement Option 3. CDP typically runs HTTP-only on localhost. If HTTPS is needed, implement Option 1.

---

### 🟠 MEDIUM: Missing Type Guard for Window Messages

**Location**: src/screencast/cdp.ts:27-31
**Severity**: Medium (Stability + Security)

#### Issue
```typescript
constructor() {
    // Handle CDP messages/events routed from the extension through post message
    window.addEventListener('message', e => {
        parseMessageFromChannel(e.data, (eventName, args) => {
            // ⚠️ e.data is type 'any', no validation before passing to parseMessageFromChannel
            if (eventName === 'websocket') {
                const { message } = JSON.parse(args) as { message: string };
                // ...
            }
        });
    });
}
```

**parseMessageFromChannel** expects a string:
```typescript
// src/common/webviewEvents.ts:79-80
export function parseMessageFromChannel(
    message: string,  // ⚠️ Expects string but receives 'any'
    emit: (eventName: WebviewEvent, args: string) => boolean
): boolean {
    for (const e of webviewEventNames) {
        if (message.substr(0, e.length) === e && message[e.length] === ':') {
            // ⚠️ Will crash if message is not a string
            emit(e, message.substr(e.length + 1));
            return true;
        }
    }
    return false;
}
```

#### Impact
- Runtime TypeError if non-string message posted to window
- Potential DoS if malicious iframe/extension posts invalid messages
- Webview crash → extension malfunction

#### Attack Scenario
1. User opens malicious HTML file in browser preview
2. Malicious script injects iframe or uses `window.opener`
3. Script posts non-string message: `window.postMessage({malicious: 'object'}, '*')`
4. ScreencastCDPConnection receives object, passes to parseMessageFromChannel
5. `message.substr()` throws TypeError
6. Webview crashes, user loses browser preview

#### Mitigations

**Option 1: Type Guard in CDP Constructor (Recommended)**
```typescript
constructor() {
    window.addEventListener('message', e => {
        // Type guard: Ensure e.data is a string
        if (typeof e.data !== 'string') {
            console.warn('[CDP] Ignoring non-string message:', typeof e.data);
            return;
        }

        parseMessageFromChannel(e.data, (eventName, args) => {
            if (eventName === 'websocket') {
                const { message } = JSON.parse(args) as { message: string };
                // ...
            }
        });
    });
}
```

**Option 2: Origin Validation**
```typescript
constructor() {
    window.addEventListener('message', e => {
        // Validate message origin (webview should only accept from vscode)
        if (e.origin !== window.origin) {
            console.warn('[CDP] Ignoring message from untrusted origin:', e.origin);
            return;
        }

        if (typeof e.data !== 'string') {
            console.warn('[CDP] Ignoring non-string message');
            return;
        }

        parseMessageFromChannel(e.data, (eventName, args) => {
            // ...
        });
    });
}
```

**Option 3: Defensive parseMessageFromChannel**
```typescript
export function parseMessageFromChannel(
    message: unknown,  // Changed from string to unknown
    emit: (eventName: WebviewEvent, args: string) => boolean
): boolean {
    // Type guard
    if (typeof message !== 'string') {
        console.warn('[parseMessageFromChannel] Expected string, got:', typeof message);
        return false;
    }

    for (const e of webviewEventNames) {
        if (message.substr(0, e.length) === e && message[e.length] === ':') {
            emit(e, message.substr(e.length + 1));
            return true;
        }
    }
    return false;
}
```

**Recommendation**: Implement Option 1 (type guard in cdp.ts) + Option 3 (defensive parseMessageFromChannel) for defense-in-depth.

---

### 🟠 MEDIUM: Unsafe JSON Deserialization

**Location**: Multiple locations
**Severity**: Medium (Stability)

#### Issue
JSON parsing without error handling in critical paths:

**src/screencast/cdp.ts:32**
```typescript
if (eventName === 'websocket') {
    const { message } = JSON.parse(args) as { message: string }; // ⚠️ No try-catch
    if (message) {
        const messageObj = JSON.parse(message) as CdpMessage; // ⚠️ No try-catch
        // ...
    }
}
```

**src/panelSocket.ts:117-123**
```typescript
try {
    const cdpMessage = JSON.parse(messageStr); // ⚠️ eslint-disable, type asserted to any

    if (cdpMessage.method === 'Page.frameNavigated' && cdpMessage.params?.frame?.url) {
        this.emit('navigation', JSON.stringify({ url: cdpMessage.params.frame.url }));
    }
    // ...
} catch {
    // Ignore parse errors - message may not be JSON
}
```

**src/screencastPanel.ts:209, 221**
```typescript
private onSaveToClipboard(message: string): void {
    const clipboardMessage = JSON.parse(message) as {data: {message: string}}; // ⚠️ No try-catch
    void vscode.env.clipboard.writeText(clipboardMessage.data.message);
}

private onNavigation(message: string): void {
    try {
        const navData = JSON.parse(message) as { url: string };
        // ...
    } catch {
        // Ignore parse errors
    }
}
```

#### Impact
- Unhandled exceptions can crash webview or extension
- CDP connection disruption
- Extension becomes unresponsive

#### Mitigations

**Option 1: Wrap All JSON.parse Calls**
```typescript
// Utility function
function safeJsonParse<T>(json: string, defaultValue: T): T {
    try {
        return JSON.parse(json) as T;
    } catch (err) {
        console.warn('[JSON] Parse error:', err);
        return defaultValue;
    }
}

// Usage in cdp.ts
if (eventName === 'websocket') {
    const parsed = safeJsonParse(args, { message: '' });
    if (parsed.message) {
        const messageObj = safeJsonParse(parsed.message, {} as CdpMessage);
        // ...
    }
}
```

**Option 2: Zod Validation (Type-Safe)**
```typescript
import { z } from 'zod';

const WebsocketEventSchema = z.object({
    message: z.string()
});

const CdpMessageSchema = z.object({
    id: z.number().optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
});

// Usage
if (eventName === 'websocket') {
    const parsed = WebsocketEventSchema.safeParse(JSON.parse(args));
    if (!parsed.success) {
        console.warn('[CDP] Invalid websocket event:', parsed.error);
        return;
    }

    const messageObj = CdpMessageSchema.safeParse(JSON.parse(parsed.data.message));
    if (!messageObj.success) {
        console.warn('[CDP] Invalid CDP message:', messageObj.error);
        return;
    }
    // Now messageObj.data is type-safe
}
```

**Recommendation**: Implement Option 1 for quick fix. Consider Option 2 for long-term type safety.

---

## Additional Findings

### Low: enableCommandUris in Webview

**Location**: src/screencastPanel.ts:344
**Finding**: Webview created with `enableCommandUris: true`

```typescript
const panel = vscode.window.createWebviewPanel(
    SETTINGS_STORE_NAME,
    'Browser',
    column,
    {
        enableCommandUris: true, // ⚠️ Allows command: URIs
        enableScripts: true,
        retainContextWhenHidden: true,
    }
);
```

**Risk**: XSS in webview can execute VS Code commands

**Mitigation**: Remove `enableCommandUris: true` unless specifically needed
```typescript
{
    // REMOVED: enableCommandUris: true,
    enableScripts: true,
    retainContextWhenHidden: true,
}
```

### Low: Content Security Policy Allows unsafe-eval

**Location**: src/screencast/view.ts:21
**Finding**: CSP includes `unsafe-eval` directive

```html
<meta http-equiv="Content-Security-Policy"
    content="...script-src 'self' 'unsafe-eval' ${webviewCSP};...">
```

**Risk**: Enables XSS via `eval()`, `Function()`, `setTimeout(string)`

**Mitigation**: Remove `unsafe-eval` if not required
```html
script-src 'self' ${webviewCSP};
```

**Note**: Check if lit-html requires unsafe-eval. If so, consider alternatives or document the risk.

### Info: CDP Message Injection

**Location**: All CDP message paths
**Finding**: CDP messages are not validated against schema

**Current**: CDP messages trusted implicitly
**Risk**: Malicious CDP endpoint could send crafted messages
**Mitigation**: If connecting to untrusted CDP endpoints, validate message schema

---

## WebSocket Target Validation

### Current Implementation

**src/utils.ts:445-479** - Target fetching:
```typescript
export async function getTarget(
    targetFilter?: string,
    config: IRemoteTargetJson = getRemoteEndpointSettings(),
    useRetry = true
): Promise<string> {
    const { hostname, port, useHttps } = config;

    // Fetch target list from CDP
    const data = await fetchUri(
        `${useHttps ? 'https' : 'http'}://${hostname}:${port}/json`
    );

    const jsonData: IRemoteTargetJson[] = JSON.parse(data) as IRemoteTargetJson[];

    // Filter targets
    const pages = jsonData.filter(j => j.type === 'page');
    // ... target selection logic ...

    return targetUrl; // WebSocket URL like ws://localhost:9222/devtools/page/{id}
}
```

### Security Assessment

**✅ Good**: Target list filtered by type === 'page'
**✅ Good**: Only page targets selected
**⚠️ Concern**: No validation of WebSocket URL format
**⚠️ Concern**: No validation of target hostname/port
**❌ Issue**: TLS verification disabled (covered above)

### Recommendations

**Add WebSocket URL Validation**
```typescript
function validateTargetUrl(targetUrl: string, expectedHost: string, expectedPort: number): boolean {
    try {
        const url = new URL(targetUrl);

        // Must be ws:// or wss://
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            console.warn('[Security] Invalid target protocol:', url.protocol);
            return false;
        }

        // Must match expected host
        if (url.hostname !== expectedHost) {
            console.warn('[Security] Target hostname mismatch:', url.hostname, 'expected:', expectedHost);
            return false;
        }

        // Must match expected port
        const port = parseInt(url.port, 10);
        if (port !== expectedPort) {
            console.warn('[Security] Target port mismatch:', port, 'expected:', expectedPort);
            return false;
        }

        // Path must start with /devtools/
        if (!url.pathname.startsWith('/devtools/')) {
            console.warn('[Security] Invalid target path:', url.pathname);
            return false;
        }

        return true;
    } catch (err) {
        console.warn('[Security] Invalid target URL:', err);
        return false;
    }
}

// Usage in getTarget()
if (!validateTargetUrl(targetUrl, hostname, port)) {
    throw new Error('Invalid CDP target URL');
}
```

---

## Summary of Recommendations

| Issue | Severity | Priority | Recommended Action |
|-------|----------|----------|-------------------|
| TLS verification disabled | High | P0 | Enable TLS verification or remove HTTPS support |
| Missing window message type guard | Medium | P1 | Add type checking for MessageEvent.data |
| Unsafe JSON deserialization | Medium | P1 | Wrap all JSON.parse in try-catch |
| enableCommandUris enabled | Low | P2 | Remove if not needed |
| CSP unsafe-eval | Low | P2 | Remove if not needed |
| No WebSocket URL validation | Medium | P1 | Validate target URLs before connecting |

---

## Implementation Checklist

- [ ] Enable TLS verification in fetchUri() or remove HTTPS support
- [ ] Add type guard for window.addEventListener('message', ...) in cdp.ts
- [ ] Add origin validation for window messages
- [ ] Make parseMessageFromChannel defensive (accept unknown, validate string)
- [ ] Wrap all JSON.parse calls in try-catch or use safeJsonParse()
- [ ] Remove enableCommandUris: true from webview creation
- [ ] Audit CSP unsafe-eval requirement, remove if possible
- [ ] Add WebSocket URL validation in getTarget()
- [ ] Document CDP security assumptions in CLAUDE.md
- [ ] Add security testing for message handling

---

## Testing Recommendations

### Security Testing
1. **MITM Test**: Use proxy to intercept CDP requests, verify TLS validation
2. **Message Injection**: Post invalid messages to webview, verify graceful handling
3. **Origin Validation**: Test cross-origin message posting
4. **JSON Fuzzing**: Send malformed JSON to CDP/WebSocket paths
5. **Target Hijacking**: Attempt to connect to external WebSocket URLs

### Regression Testing
1. Verify CDP communication still works
2. Verify screencast preview functional
3. Verify navigation events received
4. Check error logging for new warnings

---

**Auditor**: Claude Sonnet 4.5
**Generated**: 2026-01-04 via Claude Code

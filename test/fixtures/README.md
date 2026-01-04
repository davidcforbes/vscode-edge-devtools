# Test Fixtures

This directory contains test fixtures for the VS Code Edge DevTools extension testing infrastructure.

## Directory Structure

```
fixtures/
├── pages/          # Sample HTML pages for testing browser functionality
├── cdp/            # Mock Chrome DevTools Protocol (CDP) responses
└── README.md       # This file
```

## HTML Test Pages

Located in `pages/`:

### simple.html
Basic test page with:
- Simple content and styling
- Button with click handler
- Console logging

**Use cases:**
- Basic browser launch tests
- Panel creation verification
- Basic interaction testing

### navigation.html
Navigation test page with:
- Links to other test pages
- Timestamp display
- Navigation event logging

**Use cases:**
- Navigation flow testing
- History management
- Page transitions

### form.html
Form interaction test page with:
- Multiple input types (text, email, number)
- Checkbox controls
- Form submission handling
- Result display

**Use cases:**
- Form interaction testing
- Input validation
- Data capture verification

## CDP Response Fixtures

Located in `cdp/`:

### target-list.json
Mock response for `/json` endpoint listing available targets.

**Structure:**
```json
[
  {
    "id": "target-page-01",
    "type": "page",
    "title": "Test Page",
    "url": "http://localhost:8080",
    "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/target-page-01"
  }
]
```

**Use cases:**
- Target selection tests
- Attach flow testing

### target-info.json
Mock response for `Target.getTargetInfo` CDP method.

**Structure:**
```json
{
  "id": 2,
  "result": {
    "targetInfo": {
      "targetId": "test-target-01",
      "type": "page",
      "title": "Test Page",
      "url": "http://localhost:8080"
    }
  }
}
```

**Use cases:**
- Target metadata verification
- Connection establishment tests

### page-navigate.json
Mock response for `Page.navigate` CDP method.

**Structure:**
```json
{
  "id": 1,
  "result": {
    "frameId": "main-frame-01",
    "loaderId": "test-loader-01"
  }
}
```

**Use cases:**
- Navigation testing
- Page load verification

### layout-metrics.json
Mock response for `Page.getLayoutMetrics` CDP method.

**Structure:**
```json
{
  "id": 3,
  "result": {
    "layoutViewport": {
      "clientWidth": 1280,
      "clientHeight": 720
    }
  }
}
```

**Use cases:**
- Viewport dimension testing
- Layout calculation verification

### capture-screenshot.json
Mock response for `Page.captureScreenshot` CDP method.

**Structure:**
```json
{
  "id": 4,
  "result": {
    "data": "base64-encoded-image-data"
  }
}
```

**Use cases:**
- Screenshot capture testing
- Image data handling

## Usage in Tests

### Loading HTML Pages

```typescript
import * as path from 'path';

const simplePage = path.join(__dirname, '../fixtures/pages/simple.html');
const fileUrl = `file://${simplePage}`;

// Use in browser launch
await context.extensionMock.executeCommand(
    'vscode-edge-devtools.launch',
    { launchUrl: fileUrl }
);
```

### Loading CDP Responses

```typescript
import targetList from '../fixtures/cdp/target-list.json';

// Use in browser mock
browserMock.mockResponse('/json', targetList);
```

## Adding New Fixtures

### HTML Pages

1. Create new `.html` file in `pages/`
2. Include basic HTML5 structure
3. Add relevant test functionality
4. Document in this README

### CDP Responses

1. Create new `.json` file in `cdp/`
2. Use actual CDP response format
3. Include realistic data
4. Document in this README

## Best Practices

1. **Keep it simple:** Fixtures should be minimal and focused
2. **Use realistic data:** Base responses on actual CDP protocol
3. **Document use cases:** Make it clear when to use each fixture
4. **Version control:** Commit all fixtures to repository
5. **Maintain consistency:** Follow naming conventions

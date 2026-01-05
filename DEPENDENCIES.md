# Dependency Version Strategy

## Current State

The project currently pins most dependencies to exact versions:
- **Production dependencies**: 6 of 7 are pinned to exact versions (only `lit-html` uses caret `^`)
- **Dev dependencies**: Most are pinned, with exceptions like `@vscode/vsce`, `jest-environment-jsdom`

## Security Vulnerabilities Found

As of 2026-01-04, `npm audit` identified 4 vulnerabilities in transitive dependencies:
1. **glob** (HIGH) - Command injection via CLI (affects jest, vsce)
2. **js-yaml** (MODERATE) - Prototype pollution (affects eslint)
3. **jws** (HIGH) - HMAC signature verification issue
4. **qs** (HIGH) - DoS via memory exhaustion

All have fixes available via dependency updates.

## Recommended Strategy

### Production Dependencies

**For security-critical packages** (ws, puppeteer-core, bufferutil, utf-8-validate):
- **Use tilde (`~`)** to allow patch updates only
- Example: `"ws": "~8.18.3"` allows 8.18.x but not 8.19.0
- Rationale: Automatically receive security patches while preventing breaking changes

**For VS Code ecosystem packages** (@vscode/codicons, @vscode/extension-telemetry):
- **Keep exact versions**
- Rationale: These track VS Code version compatibility; manual updates recommended

**For stable libraries** (lit-html):
- **Use caret (`^`)** to allow minor and patch updates
- Example: `"lit-html": "^3.3.1"` (already in use)
- Rationale: Allows new features and fixes while staying within major version

### Dev Dependencies

**For build tools** (webpack, typescript, eslint):
- **Use caret (`^`)** to stay current with ecosystem improvements
- Exception: TypeScript should use tilde (`~`) to avoid breaking changes between minor versions

**For testing frameworks** (jest, ts-jest):
- **Use caret (`^`)** to get bug fixes and improvements
- Already partially implemented (jest-environment-jsdom)

**For VS Code types** (@types/vscode):
- **Keep exact version** matching `engines.vscode` in package.json
- Currently: both are `1.104.0` ✓

## Update Cadence

1. **Security updates**: Apply immediately when `npm audit` reports vulnerabilities
2. **Quarterly review**: Update dependencies every 3 months
   - Run `npm outdated` to identify updates
   - Test extension thoroughly after updates
   - Document breaking changes in CHANGELOG

3. **Before major releases**: Full dependency audit and update cycle

## Implementation Steps

1. **Update package.json version strategies**:
   ```json
   "dependencies": {
     "@vscode/codicons": "0.0.40",           // keep exact
     "@vscode/extension-telemetry": "0.9.4", // keep exact
     "bufferutil": "~4.0.9",                 // tilde for patches
     "lit-html": "^3.3.1",                   // keep caret
     "puppeteer-core": "~24.23.0",           // tilde for patches
     "utf-8-validate": "~6.0.5",             // tilde for patches
     "ws": "~8.18.3"                         // tilde for patches
   }
   ```

2. **Run `npm audit fix`** to resolve current vulnerabilities

3. **Test extension** after dependency updates:
   - Run `npm test && npm run test:harness`
   - Manual testing in Extension Development Host
   - Verify browser launch, screencast, and all commands

4. **Document in CHANGELOG** when significant dependencies are updated

## Rationale for Strategy

### Why not pin everything?
- Misses critical security patches in transitive dependencies
- Requires manual intervention for all updates
- Creates technical debt when falling behind on updates

### Why not use caret for everything?
- Breaking changes can slip through in minor versions
- VS Code extension ecosystem requires careful version alignment
- Security-critical packages need controlled update surface

### Balanced approach
- **Tilde (`~`)**: Security patches only for critical packages
- **Exact**: For platform packages (VS Code)
- **Caret (`^`)**: For stable libraries and dev tools
- **Regular audits**: Catch what automation misses

## References

- [npm semantic versioning](https://docs.npmjs.com/about-semantic-versioning)
- [VS Code extension best practices](https://code.visualstudio.com/api/references/extension-manifest)
- [npm audit documentation](https://docs.npmjs.com/cli/v10/commands/npm-audit)

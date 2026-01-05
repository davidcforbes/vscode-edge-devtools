# Dependency Version Strategy

## Summary

This document defines the dependency versioning strategy for vscode-edge-devtools. The project uses a balanced approach:
- **Tilde (`~`)** for security-critical packages to allow patch updates only
- **Exact versions** for VS Code packages that must track specific API versions
- **Caret (`^`)** for build tools, testing frameworks, and type definitions to allow minor updates

**Status**: As of 2026-01-04, all production dependencies follow the documented strategy. Dev dependencies are mostly compliant, with some @types/* packages and linting plugins still pinned that could benefit from caret ranges.

## Current State (as of v3.0.0)

The project follows a mixed versioning strategy:

**Production dependencies**:
- Security-critical packages (ws, puppeteer-core, bufferutil, utf-8-validate): tilde (`~`) ✓
- VS Code packages (@vscode/codicons, @vscode/extension-telemetry): exact versions ✓
- Stable libraries (lit-html): caret (`^`) ✓

**Dev dependencies**:
- Build tools (webpack, eslint): caret (`^`) ✓
- TypeScript: tilde (`~5.9.3`) ✓
- Testing frameworks (jest, ts-jest): caret (`^`) ✓
- Type definitions (@types/*): **mostly pinned** ⚠️
  - @types/vscode: pinned to 1.104.0 (matching engines.vscode) ✓
  - Other @types packages: pinned but should use caret (`^`)
- Linting plugins (@typescript-eslint/*): **pinned** ⚠️
  - Should use caret (`^`) while keeping parser and plugin synchronized

## Security Status

As of 2026-01-04, `npm audit` reports **0 vulnerabilities** ✓

Previous vulnerabilities (fixed):
- **glob** (HIGH) - Command injection via CLI
- **js-yaml** (MODERATE) - Prototype pollution
- **jws** (HIGH) - HMAC signature verification issue
- **qs** (HIGH) - DoS via memory exhaustion

Regular `npm audit` checks recommended to catch new vulnerabilities early.

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

**For build tools** (webpack, eslint):
- **Use caret (`^`)** to stay current with ecosystem improvements
- Example: `"webpack": "^5.102.1"` (already in use)

**For TypeScript**:
- **Use tilde (`~`)** to avoid breaking changes between minor versions
- Example: `"typescript": "~5.9.3"` (already in use)
- Rationale: TypeScript can introduce breaking changes in minor versions

**For testing frameworks** (jest, ts-jest):
- **Use caret (`^`)** to get bug fixes and improvements
- Example: `"jest": "^30.2.0"` (already in use)

**For TypeScript type definitions** (@types/*):
- **@types/vscode**: Keep exact version matching `engines.vscode` in package.json
  - Currently: both are `1.104.0` ✓
  - Rationale: Must match VS Code API version exactly
- **Other @types packages**: Use caret (`^`) to track library versions
  - Recommended: `"@types/node": "^24.7.0"` (currently pinned at 24.7.0)
  - Recommended: `"@types/jest": "^30.0.0"` (currently pinned at 30.0.0)
  - Recommended: `"@types/ws": "^8.18.1"` (currently pinned at 8.18.1)
  - Rationale: Type definitions should evolve with their corresponding libraries
  - Exception: Pin when specific type version is needed for compatibility

**For linting plugins** (@typescript-eslint/*):
- **Use caret (`^`)** but keep parser and plugin at the same version
- Example: Both at `"^8.46.0"` (currently pinned at 8.46.0)
- Rationale: Parser and plugin must be compatible; caret allows updates

## Update Cadence

1. **Security updates**: Apply immediately when `npm audit` reports vulnerabilities
2. **Quarterly review**: Update dependencies every 3 months
   - Run `npm outdated` to identify updates
   - Test extension thoroughly after updates
   - Document breaking changes in CHANGELOG

3. **Before major releases**: Full dependency audit and update cycle

## Implementation Steps

### Phase 1: Align with documented strategy (optional improvement)

1. **Update @types/* packages to use caret ranges** (except @types/vscode):
   ```json
   "devDependencies": {
     "@types/fs-extra": "^11.0.4",        // change from 11.0.4
     "@types/jest": "^30.0.0",            // change from 30.0.0
     "@types/node": "^24.7.0",            // change from 24.7.0
     "@types/vscode": "1.104.0",          // keep exact (matches engines.vscode)
     "@types/ws": "^8.18.1"               // change from 8.18.1
   }
   ```

2. **Update linting plugins to use caret ranges**:
   ```json
   "devDependencies": {
     "@typescript-eslint/eslint-plugin": "^8.46.0",  // change from 8.46.0
     "@typescript-eslint/parser": "^8.46.0"          // change from 8.46.0
   }
   ```

3. **Run `npm install`** to update package-lock.json with new ranges

4. **Test extension** after dependency updates:
   - Run `npm test && npm run test:harness`
   - Manual testing in Extension Development Host
   - Verify browser launch, screencast, and all commands

### Phase 2: Regular maintenance

1. **Run `npm audit`** monthly or when dependencies are updated
   - Apply security fixes immediately when vulnerabilities are found

2. **Run `npm outdated`** quarterly to identify available updates
   - Review release notes for major/minor updates
   - Test thoroughly after updates

3. **Document in CHANGELOG** when significant dependencies are updated

### Verification

Current dependency ranges are documented above. Verify compliance:
```bash
npm audit                # Should report 0 vulnerabilities
npm outdated             # Review available updates
npm test && npm run test:harness  # All tests should pass
```

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

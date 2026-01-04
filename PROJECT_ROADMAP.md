# Project Roadmap: Browser Viewer Transformation

## Overview
Transforming the VS Code Edge DevTools extension from a full developer tools suite into a lightweight, focused browser viewing extension with multi-instance support.

**Goal:** 85% code reduction (4,750 → 700 lines) while adding multi-browser capabilities

## Project Statistics
- **Total Tasks:** 40 issues created
- **Epics:** 4
- **Features:** 9
- **Tasks:** 27
- **Current Status:** 11 issues ready to work, 29 blocked by dependencies

## Epic Breakdown

### Epic 1: Core Feature Stripping [P0]
**ID:** vscode-edge-devtools-yuy
**Status:** Ready to start
**Goal:** Remove all DevTools, debugging, and analysis features

#### Features & Tasks (14 items)
1. ✅ **Ready** - Remove DevToolsPanel and dependencies [P0] (vscode-edge-devtools-0dr)
2. ✅ **Ready** - Remove Webhint LSP integration [P0] (vscode-edge-devtools-5wf)
3. ✅ **Ready** - Remove launch configuration management [P0] (vscode-edge-devtools-1x1)
4. ✅ **Ready** - Remove targets tree view provider [P1] (vscode-edge-devtools-f46)
5. ✅ **Ready** - Remove JS Debug proxy integration [P1] (vscode-edge-devtools-0lt)
6. ✅ **Ready** - Remove CSS mirror editing functionality [P1] (vscode-edge-devtools-35g)
7. ✅ **Ready** - Remove browser version detection [P1] (vscode-edge-devtools-0p7)
8. 🔒 **Blocked** - Cleanup utils.ts - remove unused functions [P1] (vscode-edge-devtools-21x)
   - Depends on: CSS mirror removal, browser version detection removal
9. ✅ **Ready** - Remove unused settings from package.json [P1] (vscode-edge-devtools-dmp)
10. 🔒 **Blocked** - Update SettingsProvider for removed settings [P1] (vscode-edge-devtools-akw)
    - Depends on: package.json settings removal
11. 🔒 **Blocked** - Simplify package.json contributions [P0] (vscode-edge-devtools-az0)
    - Depends on: DevToolsPanel removal, launch config removal, tree view removal
12. 🔒 **Blocked** - Simplify extension.ts activation [P0] (vscode-edge-devtools-ung)
    - Depends on: All feature removals (6 dependencies)
13. 🔒 **Blocked** - Verify no broken references after deletions [P0] (vscode-edge-devtools-1vy)
    - Depends on: extension.ts, package.json, utils cleanup, SettingsProvider update
14. 🔒 **Blocked** - Remove unused npm dependencies [P2] (vscode-edge-devtools-9pl)
    - Depends on: Verification task

**Estimated Effort:** 4-6 hours
**Code Reduction:** ~3,000 lines

---

### Epic 2: Multi-Instance Browser Support [P1]
**ID:** vscode-edge-devtools-8k1
**Status:** Blocked (depends on Epic 1)
**Goal:** Enable multiple concurrent browser viewing panels

#### Features & Tasks (4 items)
1. 🔒 **Blocked** - Convert ScreencastPanel singleton to multi-instance [P0] (vscode-edge-devtools-x0x)
   - Depends on: Verification from Epic 1
2. 🔒 **Blocked** - Track multiple browser instances [P0] (vscode-edge-devtools-ftf)
   - Depends on: ScreencastPanel conversion
3. 🔒 **Blocked** - Add panel management commands [P1] (vscode-edge-devtools-h0a)
   - Depends on: ScreencastPanel conversion, browser instance tracking
4. 🔒 **Blocked** - Update panel titles with instance identifiers [P2] (vscode-edge-devtools-ivc)
   - Depends on: ScreencastPanel conversion

**Estimated Effort:** 2-3 hours
**Code Addition:** ~100 lines (net positive for features)

---

### Epic 3: Testing Infrastructure & CLI Harness [P1]
**ID:** vscode-edge-devtools-fbs
**Status:** Ready to start (can work in parallel)
**Goal:** Comprehensive test coverage with CLI-based automation

#### Features & Tasks (8 items)
1. ✅ **Ready** - Design CLI test harness architecture [P1] (vscode-edge-devtools-sxd)
2. 🔒 **Blocked** - Implement CLI test harness runner [P1] (vscode-edge-devtools-dl5)
   - Depends on: Architecture design
3. 🔒 **Blocked** - Create test fixtures and mocks [P1] (vscode-edge-devtools-5jz)
   - Depends on: Architecture design
4. 🔒 **Blocked** - Create unit tests for ScreencastPanel [P1] (vscode-edge-devtools-av2)
   - Depends on: ScreencastPanel multi-instance conversion
5. 🔒 **Blocked** - Create unit tests for PanelSocket [P1] (vscode-edge-devtools-2wt)
   - Depends on: Core verification
6. 🔒 **Blocked** - Create integration tests for browser launching [P1] (vscode-edge-devtools-2iy)
   - Depends on: Core verification
7. 🔒 **Blocked** - Update existing tests for stripped codebase [P1] (vscode-edge-devtools-txx)
   - Depends on: Core verification
8. 🔒 **Blocked** - Create E2E test scenarios [P2] (vscode-edge-devtools-ypl)
   - Depends on: CLI harness implementation, panel management commands

**QA Tasks:**
9. 🔒 **Blocked** - Manual QA - browser viewing scenarios [P1] (vscode-edge-devtools-ynn)
   - Depends on: Core verification
10. 🔒 **Blocked** - Manual QA - multi-instance scenarios [P1] (vscode-edge-devtools-iq9)
    - Depends on: Panel management commands

**Estimated Effort:** 4-5 hours
**Deliverables:** Full test suite + CLI automation

---

### Epic 4: Documentation & Polish [P2]
**ID:** vscode-edge-devtools-xef
**Status:** Blocked (depends on Epics 1 & 2)
**Goal:** Update all documentation and prepare for v3.0.0 release

#### Tasks (8 items)
1. 🔒 **Blocked** - Update README.md for browser viewer focus [P2] (vscode-edge-devtools-2zo)
   - Depends on: Panel management commands
2. 🔒 **Blocked** - Update CLAUDE.md for simplified architecture [P2] (vscode-edge-devtools-5gh)
   - Depends on: Core verification, panel management commands
3. 🔒 **Blocked** - Update package.json metadata [P2] (vscode-edge-devtools-7ym)
   - Depends on: Core verification
4. 🔒 **Blocked** - Create changelog entry for v3.0.0 [P2] (vscode-edge-devtools-x1h)
   - Depends on: Panel management commands
5. 🔒 **Blocked** - Create migration guide for users [P3] (vscode-edge-devtools-dxb)
   - Depends on: README update
6. 🔒 **Blocked** - Update CONTRIBUTING.md [P3] (vscode-edge-devtools-exw)
   - Depends on: CLAUDE.md update
7. 🔒 **Blocked** - Update .vscodeignore for smaller package [P3] (vscode-edge-devtools-50b)
   - Depends on: npm dependency removal
8. 🔒 **Blocked** - Performance testing - verify startup improvement [P2] (vscode-edge-devtools-vi2)
   - Depends on: Manual QA completion

**Estimated Effort:** 2-3 hours
**Deliverables:** v3.0.0 release-ready documentation

---

## Dependency Chain Visualization

```
Epic 1: Core Stripping (P0)
├─ [Ready] Remove DevToolsPanel
├─ [Ready] Remove Webhint
├─ [Ready] Remove Launch Config
├─ [Ready] Remove Tree View
├─ [Ready] Remove JS Debug Proxy
├─ [Ready] Remove CSS Mirror
├─ [Ready] Remove Version Detection
├─ [Ready] Remove Settings from package.json
│
├─ [Blocked] Cleanup utils.ts
│   └─ depends on: CSS Mirror, Version Detection
│
├─ [Blocked] Update SettingsProvider
│   └─ depends on: Settings removal
│
├─ [Blocked] Simplify package.json
│   └─ depends on: DevTools, Launch Config, Tree View
│
├─ [Blocked] Simplify extension.ts
│   └─ depends on: All 6 removal features
│
└─ [Blocked] Verify no broken refs
    └─ depends on: extension.ts, package.json, utils, SettingsProvider
    │
    ▼
Epic 2: Multi-Instance (P1)
├─ [Blocked] Convert to multi-instance
│   └─ depends on: Verification
│   │
│   ├─ [Blocked] Track browser instances
│   │   └─ depends on: Conversion
│   │
│   └─ [Blocked] Panel management commands
│       └─ depends on: Conversion, Browser tracking
│       │
│       ▼
Epic 3: Testing (P1) - Parallel with Core
├─ [Ready] Design test harness
│   │
│   ├─ [Blocked] Implement harness
│   └─ [Blocked] Create fixtures
│
├─ [Blocked] Unit tests (ScreencastPanel)
│   └─ depends on: Multi-instance conversion
│
├─ [Blocked] Unit tests (PanelSocket, Browser)
│   └─ depends on: Verification
│
├─ [Blocked] Update existing tests
│   └─ depends on: Verification
│
├─ [Blocked] E2E tests
│   └─ depends on: Harness, Panel commands
│
└─ [Blocked] Manual QA
    └─ depends on: Verification, Panel commands
    │
    ▼
Epic 4: Documentation (P2)
├─ [Blocked] Update README, CLAUDE.md, package.json metadata
│   └─ depends on: Verification, Panel commands
│
├─ [Blocked] Changelog, Migration guide
│   └─ depends on: README
│
└─ [Blocked] Performance testing
    └─ depends on: Manual QA
```

---

## Work Phases

### **Phase 1: Core Stripping** (Week 1)
**Priority:** P0
**Effort:** 4-6 hours
**Ready to start:** 10 issues

**Work Order:**
1. Start with file deletions (can be done in parallel):
   - Remove DevToolsPanel (vscode-edge-devtools-0dr)
   - Remove Webhint (vscode-edge-devtools-5wf)
   - Remove Launch Config (vscode-edge-devtools-1x1)
   - Remove Tree View (vscode-edge-devtools-f46)
   - Remove JS Debug Proxy (vscode-edge-devtools-0lt)
   - Remove CSS Mirror (vscode-edge-devtools-35g)
   - Remove Version Detection (vscode-edge-devtools-0p7)

2. Update configuration:
   - Remove settings from package.json (vscode-edge-devtools-dmp)
   - Cleanup utils.ts (vscode-edge-devtools-21x)
   - Update SettingsProvider (vscode-edge-devtools-akw)

3. Refactor core files:
   - Simplify package.json contributions (vscode-edge-devtools-az0)
   - Simplify extension.ts (vscode-edge-devtools-ung)

4. Verify:
   - Check for broken references (vscode-edge-devtools-1vy)
   - Test basic functionality

**Exit Criteria:**
- ✅ Extension compiles without errors
- ✅ Can launch browser and view pages
- ✅ All tests pass (minus removed features)
- ✅ ~3,000 lines removed

---

### **Phase 2: Multi-Instance Support** (Week 1-2)
**Priority:** P1
**Effort:** 2-3 hours
**Starts after:** Phase 1 verification

**Work Order:**
1. Convert singleton pattern (vscode-edge-devtools-x0x)
2. Track multiple browsers (vscode-edge-devtools-ftf)
3. Add management commands (vscode-edge-devtools-h0a)
4. Update panel titles (vscode-edge-devtools-ivc)

**Exit Criteria:**
- ✅ Can open 5+ browser instances simultaneously
- ✅ Each instance is independent
- ✅ Can switch between instances
- ✅ Can close individual instances

---

### **Phase 3: Testing Infrastructure** (Week 2)
**Priority:** P1
**Effort:** 4-5 hours
**Can start:** During Phase 1 (test design)

**Work Order:**
1. Design CLI harness (vscode-edge-devtools-sxd) - **Can start now**
2. Implement harness (vscode-edge-devtools-dl5)
3. Create fixtures (vscode-edge-devtools-5jz)
4. Write unit tests (vscode-edge-devtools-av2, 2wt, 2iy)
5. Update existing tests (vscode-edge-devtools-txx)
6. Create E2E tests (vscode-edge-devtools-ypl)
7. Manual QA (vscode-edge-devtools-ynn, iq9)

**Exit Criteria:**
- ✅ All unit tests pass
- ✅ CLI harness can run tests without VS Code UI
- ✅ E2E tests cover all user scenarios
- ✅ Manual QA checklist completed

---

### **Phase 4: Documentation & Release** (Week 2-3)
**Priority:** P2
**Effort:** 2-3 hours
**Starts after:** Phases 1-3 complete

**Work Order:**
1. Update core docs (vscode-edge-devtools-2zo, 5gh, 7ym)
2. Create changelog (vscode-edge-devtools-x1h)
3. Migration guide (vscode-edge-devtools-dxb)
4. Update CONTRIBUTING (vscode-edge-devtools-exw)
5. Cleanup package (vscode-edge-devtools-9pl, 50b)
6. Performance testing (vscode-edge-devtools-vi2)

**Exit Criteria:**
- ✅ All documentation updated
- ✅ v3.0.0 changelog complete
- ✅ Package size reduced
- ✅ Performance benchmarks documented

---

## Timeline

**Total Estimated Effort:** 12-17 hours of focused work

### Optimistic (1 week)
- Day 1-2: Phase 1 (Core Stripping)
- Day 3: Phase 2 (Multi-Instance)
- Day 4-5: Phase 3 (Testing)
- Day 5: Phase 4 (Documentation)

### Realistic (2 weeks)
- Week 1: Phases 1-2 + Test Design
- Week 2: Phase 3 (Testing) + Phase 4 (Documentation)

### Conservative (3 weeks)
- Week 1: Phase 1 (Core Stripping) + Review
- Week 2: Phase 2 (Multi-Instance) + Testing Infrastructure
- Week 3: Complete Testing + Documentation + Release

---

## Quick Start Commands

### View Current Status
```bash
bd stats                    # Project statistics
bd ready                    # Show work ready to start
bd list --status=open       # All open issues
bd blocked                  # Show blocked issues
```

### Start Working
```bash
# Show details for a specific task
bd show vscode-edge-devtools-0dr

# Start working on a task
bd update vscode-edge-devtools-0dr --status=in_progress

# Complete a task
bd close vscode-edge-devtools-0dr

# Complete multiple related tasks at once
bd close vscode-edge-devtools-0dr vscode-edge-devtools-5wf vscode-edge-devtools-1x1
```

### Track Progress
```bash
# See what's blocking progress
bd blocked

# See what became available after completing tasks
bd ready

# Sync with git remote
bd sync
```

---

## Success Metrics

### Code Metrics
- ✅ **Target:** 85% code reduction (4,750 → 700 lines)
- ✅ **Files deleted:** 11+ files
- ✅ **Commands reduced:** 17 → 5
- ✅ **Settings reduced:** 14 → 9
- ✅ **Dependencies removed:** 4+ npm packages

### Functionality Metrics
- ✅ **Feature:** Multi-instance browser support
- ✅ **Performance:** 50%+ startup improvement
- ✅ **Quality:** 100% test coverage for core features
- ✅ **UX:** Simplified command palette

### Release Metrics
- ✅ **Version:** 3.0.0 (major version bump)
- ✅ **Package size:** Reduced VSIX size
- ✅ **Documentation:** Complete migration guide
- ✅ **Testing:** CLI harness for CI/CD

---

## Risk Mitigation

### Risk: Breaking existing users
**Mitigation:**
- Major version bump (2.x → 3.0.0)
- Migration guide with alternatives
- Clear changelog of removed features

### Risk: Hidden dependencies in code
**Mitigation:**
- TypeScript compiler verification task (vscode-edge-devtools-1vy)
- Comprehensive test suite
- Manual QA of all scenarios

### Risk: Multi-instance bugs
**Mitigation:**
- Dedicated E2E tests for multi-instance
- Manual QA checklist
- Stress test with 10+ instances

### Risk: Test harness complexity
**Mitigation:**
- Start with design phase
- Iterate on simple scenarios first
- Fall back to manual testing if needed

---

## Notes

- **Parallel Work:** Testing design can start immediately while core stripping proceeds
- **Dependencies:** Use `bd show <id>` to see what's blocking each task
- **Sync:** Run `bd sync` at end of each session to push progress
- **Questions:** See FEATURE_ANALYSIS.md for detailed technical decisions

**Created:** 2026-01-03
**Last Updated:** 2026-01-03
**Status:** Planning Complete - Ready to Execute

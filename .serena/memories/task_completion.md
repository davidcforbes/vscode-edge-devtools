# Task Completion Workflow

**MANDATORY: NEVER END A SESSION WITHOUT PUSHING.**

1. **Verify Implementation**:
   - Run `npm run build` to ensure no compilation errors.
   - Run `npm run lint` to check styling.
   - Run relevant tests (e.g., `npm run test:harness:unit`).
2. **Update Issue Tracker**:
   - Create follow-up issues with `bd create` if needed.
   - Close completed tasks with `bd close <id>`.
   - Update in-progress tasks.
3. **Commit & Sync**:
   - `git add .`
   - `git commit -m "..."`
   - `bd sync` (to commit beads changes).
4. **Push**:
   - `git pull --rebase`
   - `git push`
   - Verify `git status` shows "up to date with origin".

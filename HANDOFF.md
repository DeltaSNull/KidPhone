# Model handoff

Read SCHOOL_ROADMAP.md first. It is the agreed plan for development; this file records where to resume.

## Active batch

- Status: In progress — Codex, 2026-10-04.
- Starting main: 3ac581338293cfef565574c9552939b95514fd58.
- Scope: Phase 1 parental access controls (PIN, School-only/Custom/Full modes, navigation and camera/call restrictions), focused tests, and shared continuation instructions.
- Intended branch: codex/school-parent-controls.
- Files expected to change: index.html, tests/parent-controls.cjs, package.json, CI workflow, README.md, SCHOOL_ROADMAP.md, HANDOFF.md.
- Claude: read this and the roadmap before any work. Avoid concurrent edits to the listed files while this batch is active; inspect the branch/PR for updated work before starting.
- Profiles, session limits, audio-control redesign, learning logic, and new lessons are not part of this first batch.

## Next continuation

Finish or review the active batch first. Once it is integrated, proceed to separate child profiles and legacy-progress migration (P1-10 through P1-12). Check the final handoff for exact tests, limitations, and remaining task order.

## Working convention

For "continue": fetch current main, inspect open PRs, read the roadmap and this handoff, and resume the next incomplete item. Record unfinished work explicitly. Do not mark a feature complete just because it appears in the plan.

## Verification

No implementation tests have run for this batch yet. Previous review was source-code review; actual iPhone/family validation remains pending.

# Shared instructions for Codex and Claude

## First action on every task, especially "continue"

Read SCHOOL_ROADMAP.md and HANDOFF.md before changing code. They are the agreed plan and current progress record. Claude: this is the plan going forward; check the progress files before anything else. Do not replace it with a new roadmap or assume an unchecked feature exists.

1. Fetch current main, inspect open PRs and the working tree, and read the active-work entry in HANDOFF.md.
2. If another model is actively changing the same files, do not overwrite or duplicate that work. Use a separate branch and coordinate through the handoff.
3. For "continue", resume the next unfinished task or blocker in HANDOFF.md, following roadmap dependencies. Complete a coherent, testable batch.
4. Preserve concurrent changes. Never force-push shared branches or overwrite a newer file with a stale copy.
5. Update the roadmap and handoff in every implementation batch: exact task IDs, what shipped, tests actually run, remaining issues, branch/PR, and the next concrete steps.
6. Check tasks only when implemented and appropriately verified. Clearly distinguish automated checks from pending real-iPhone or family testing.
7. Keep child-specific observations, PINs, and private family data out of this public repository.
8. Keep the existing offline behavior and pixel-art style. Prefer incremental changes; no framework rewrite is planned.

The handoff records temporary claims, not permanent locks. Check branch/PR activity before treating an old entry as active. A clean switch requires committed/pushed work; another model cannot see unpushed local edits.

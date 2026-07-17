---
name: verify
description: Build/launch/drive recipe for verifying skillsight TUI changes end-to-end in tmux with the safe --demo dataset
---

# Verifying skillsight changes

skillsight is an Ink TUI. Verify changes by driving the real app in tmux —
`--demo` renders a built-in fictional dataset, so nothing real is read and
output is deterministic.

## Launch

```bash
tmux -L skillsight-verify new-session -d -x 200 -y 48 'npx tsx src/cli.ts --demo'
sleep 4   # tsx startup + first render
tmux -L skillsight-verify capture-pane -p
```

Use a wide pane (≥200 cols): narrow widths shed table columns (SOURCE first —
see `shedOrder` in `src/render/ink/ItemTable.tsx`).

## Drive

- Tabs: `1` Folders, `2` Project Scope, `3` User Scope, `4` Leaderboard
  (`src/render/ink/tabs.ts`).
- `s` cycles sort modes (per-tab lists in `src/render/ink/sortModes.ts`); the
  active label shows in the filter box as `sort (s) · <label>`.
- `f` filter, arrows + Enter navigate/expand, `.` hidden, `q` quit.
- Sleep ~0.3s between `send-keys` presses — rapid-fire with no delay drops
  some keys at the tmux layer (app doesn't crash, but counts get unreliable).

## Gotchas

- Heredocs hang in this environment: write files with the Write tool, commit
  with `git commit -F <file>`.
- Kill leftovers with `tmux -L skillsight-verify kill-server`.

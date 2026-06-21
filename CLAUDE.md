# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

No build step — open `index.html` directly in a browser. Everything is vanilla HTML/CSS/JS with no dependencies beyond Google Fonts (loaded from CDN).

## Architecture

This is a static, multi-file personal dashboard. There are two layers:

**Dashboard (`index.html`)** — reads the `PLANS` array at the top of its `<script>` block to render plan cards. For each plan it calls `readProgress(plan)`, which fetches `localStorage.getItem(plan.id)` and counts `Object.values(state.done).filter(Boolean).length` to compute completion percentage.

**Plan pages (e.g. `neetcode150-plan.html`)** — self-contained single-page apps. Each owns its own `STATE = { done: {}, flag: {} }` object, serialised as JSON and persisted under a `KEY` constant (e.g. `"nc150:v1"`) in `localStorage`. The plan page also tries `window.storage.get/set` as a secondary store before falling back to `localStorage`.

## Adding a new plan

1. Create a new HTML file modelled on `neetcode150-plan.html`.
2. Choose a unique `KEY` string (e.g. `"myplan:v1"`). This becomes the `localStorage` key.
3. Add a matching entry to the `PLANS` array in `index.html`:
   - `id` must equal the `KEY` used in the plan file
   - `total` must match the number of `kind: "problem"` tasks for the progress bar to be accurate
   - `file` is the relative path to the new HTML file
   - `status` is auto-resolved from dates; the explicit value is only used when `"completed"` needs to be forced

## localStorage state schema

```json
{
  "done": { "<taskId>": true },
  "flag": { "<taskId>": true }
}
```

Task IDs in `neetcode150-plan.html` follow the patterns `p001`–`p150` (problems), `r001`+ (reviews), `mk001`+ (mocks), `bh001`+ (behaviorals), `sd001`+ (system design), `rp001`+ (repeat reviews). Only `kind: "problem"` tasks are counted toward the solved total.

## Design system

All files share an identical CSS variable palette defined in `:root`. Key tokens:
- `--bg / --bg2 / --surface / --card` — background hierarchy
- `--amber / --mint / --coral / --peri / --violet / --sky` — accent colours
- `--disp` (Space Grotesk) / `--body` (Inter) / `--mono` (JetBrains Mono) — typefaces

Difficulty badges map to CSS classes `b-Easy`, `b-Medium`, `b-Hard`, `b-Review`, `b-Mock`, `b-Behavioral`, `b-System`.

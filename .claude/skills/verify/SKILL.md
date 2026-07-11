---
name: verify
description: Build/launch/drive recipe for verifying changes to this static site, especially the BDSP validator pages.
---

# Verifying changes to tommanmaz.github.io

Static GitHub Pages site — no build step, no npm install.

## Launch

```bash
python -m http.server 8123    # from the repo root; validator page needs http://, not file://
```

## Fast checks (validator logic)

```bash
pip install sortedcontainers                                # once
node scripts/parity_test.js --python                        # JS core vs Python reference, 65 archived sols
node scripts/fuzz_parity.js --seed 42 --per-instance 12     # infeasible-path differential fuzzing
```

## Driving the validator page (browser E2E, zero npm deps)

Node >= 22 has global `WebSocket` and `fetch`, so raw CDP works without Puppeteer:

1. Launch: `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9223 --user-data-dir=<tmpdir> --no-first-run about:blank`
2. Get the page target from `http://127.0.0.1:9223/json/list`, connect to its `webSocketDebuggerUrl`.
3. Enable `Page`, `Runtime`, `Log`; navigate; poll `Runtime.evaluate` for readiness conditions.
4. Upload files with `DOM.setFileInputFiles` (nodeId via `DOM.getDocument` + `DOM.querySelector`). Dispatch `change` manually on `#instance-upload` (`el.dispatchEvent(new Event('change'))`); `#solution-upload` needs no event (validation runs on button click).
5. Screenshot with `Page.captureScreenshot` `{captureBeyondViewport: true}`.

A complete driver covering all flows exists in the session scratchpad history
(`browser_e2e.js`); rebuild from the recipe above if needed.

### Flows worth driving

- `bdsp_validate.html?instance=realistic_10_1` + upload `sols/realistic_10_1.csv`
  → Total cost **14,417**, Feasible, gap **+0.00%**, "All 73 legs covered", 12 rows,
  schedule-timeline SVG inside `<details>`.
- Infeasible: OR-merge the first two rows of that CSV → Infeasible badge +
  "Why is this solution infeasible?" block naming E0.
- Submission panel: `window.BDSP_INSTANCES.filter(e=>e.name==='realistic_10_1')[0].bks += 1000`
  via Runtime.evaluate BEFORE selecting the instance, then validate the sols CSV
  → "★ New best!" + `.submit-panel` with prefilled GitHub new-file URL.
- Custom instance: upload any `downloads/instances/*.json` via `#instance-upload`
  → "no BKS comparison" status; validating shows no BKS text and no submit panel.

## Gotchas

- Every page has `<meta http-equiv="X-Frame-Options">`, which browsers ignore and
  log as a **console error** — filter it out when asserting "no console errors".
- Script order on `bdsp_validate.html` is load-bearing:
  `data/instances.js` → `js/bdsp_validator_core.js` → `js/bdsp_gantt.js` → `js/bdsp_validate.js`.
- `data/instances.json` / `data/instances.js` are generated — never hand-edit.

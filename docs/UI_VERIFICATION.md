# UI verification gate

The builder does not self-certify the UI. Automated Playwright artifacts are evidence for an independent critic and final human gate.

The Chromium matrix covers desktop and iPhone-sized viewports, screenshots, axe, keyboard search, deep-link restoration, browser history, in-flow details, painted canvas changes, cluster interaction, zero forbidden network requests and the 5,000-point mounted-row/time budgets. Artifacts are retained under `test-results/` and `playwright-report/` locally and uploaded by CI.

Before a UI release is called complete:

1. Run `npm run test:e2e` and retain screenshots/traces.
2. Have a separate reviewer inspect hierarchy, responsive order, overflow, focus, attribution, map/list selection and theme override pages.
3. Record the human accept/reject decision and any known limitation in the release notes.

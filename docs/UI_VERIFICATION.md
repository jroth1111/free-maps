# UI verification gate

The builder does not self-certify the UI. Automated Playwright artifacts are evidence for an independent critic and final human gate.

The Chromium interaction matrix covers 412×823, 768×1024, and 1350×940 viewports, screenshots, axe, forced colors, keyboard and pointer sheet snapping, rail collapse, focus containment, quick filters, search-area events, deep-link restoration, browser history, painted canvas changes, cluster interaction, horizontal overflow, zero forbidden network requests, and the 5,000-point mounted-row/time budgets. Artifacts are retained under `test-results/` and `playwright-report/` locally and uploaded by CI.

The release Lighthouse matrix separately covers `/`, `/embed/`, `/states/`, `/vanilla/`, and `/react/` at 412×823 DPR 1.75, 768×1024 DPR 2, and 1350×940 DPR 1. Each combination runs three times with Lighthouse 13.4.0, Chrome for Testing 151.0.7922.34, cold and primed-warm profiles with simulated throttling. Mobile and iPad Performance medians must remain 100, desktop cells must meet the accepted baseline, no Performance run may fall below 96, and every Accessibility, Best Practices, SEO, and Agentic Browsing report must score 100.

Before a UI release is called complete:

1. Run `npm run test:e2e` and retain screenshots/traces.
2. Have a separate reviewer inspect hierarchy, responsive order, overflow, focus, attribution, map/list selection and theme override pages.
3. Record the human accept/reject decision and any known limitation in the release notes.

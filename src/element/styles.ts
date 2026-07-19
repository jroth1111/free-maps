import { css } from "lit";

/**
 * Layout and accessibility rules shared by every Free Maps element.
 *
 * The fallback tokens are deliberately neutral. Product appearance belongs in
 * an opt-in theme (or in consumer-owned --free-map-* overrides), while row and
 * virtualization dimensions remain private implementation details.
 */
export const structuralStyles = css`
  :host {
    --free-map-font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --free-map-heading-font-family: var(--free-map-font-family);
    --free-map-surface-canvas: #f8fafc;
    --free-map-surface: #ffffff;
    --free-map-surface-muted: #f1f5f9;
    --free-map-text: #172033;
    --free-map-text-muted: #526075;
    --free-map-border-color: #cbd5e1;
    --free-map-accent: #155eef;
    --free-map-accent-hover: #0b4dd8;
    --free-map-on-accent: #ffffff;
    --free-map-focus: #2563eb;
    --free-map-control-surface: #ffffff;
    --free-map-control-text: #172033;
    --free-map-control-border: #cbd5e1;
    --free-map-marker: #2563eb;
    --free-map-marker-selected: #b42318;
    --free-map-marker-stroke: #ffffff;
    --free-map-cluster: #2563eb;
    --free-map-cluster-medium: #175cd3;
    --free-map-cluster-large: #1849a9;
    --free-map-cluster-text: #ffffff;
    --free-map-radius-small: 0.25rem;
    --free-map-radius: 0.5rem;
    --free-map-shadow-control: 0 2px 8px rgb(15 23 42 / 0.16);
    color: var(--free-map-text);
    display: block;
    font-family: var(--free-map-font-family);
    line-height: 1.45;
  }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select { color: inherit; font: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
    outline: 3px solid var(--free-map-focus);
    outline-offset: 2px;
  }
  .shell {
    border: 1px solid var(--free-map-border-color);
    background: var(--free-map-surface);
    min-width: 0;
    overflow: hidden;
  }
  .tip {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    padding: .75rem 1rem;
    border-bottom: 1px solid var(--free-map-border-color);
    background: var(--free-map-surface-muted);
    font-size: .875rem;
  }
  .tip strong { color: var(--free-map-text); }
  .tip button { border: 0; background: transparent; cursor: pointer; min-width: 44px; min-height: 44px; margin: -.65rem; }
  .layout { display: grid; min-width: 0; }
  .controls { order: 1; padding: 1rem; border-bottom: 1px solid var(--free-map-border-color); background: var(--free-map-surface-muted); }
  h1, h2 { font-family: var(--free-map-heading-font-family); margin: 0; line-height: 1.15; }
  h1 { font-size: 1.25rem; }
  .lede { color: var(--free-map-text-muted); font-size: .875rem; margin: .35rem 0 0; }
  .search { display: block; margin-top: .85rem; }
  .search span, .field span { display: block; font-size: .72rem; font-weight: 700; letter-spacing: .06em; margin-bottom: .25rem; text-transform: uppercase; }
  input, select {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--free-map-control-border);
    border-radius: var(--free-map-radius-small);
    background: var(--free-map-control-surface);
    color: var(--free-map-control-text);
    padding: .65rem .75rem;
  }
  .fields { display: grid; gap: .7rem; margin-top: .7rem; }
  .map { order: 2; position: relative; height: clamp(18rem, 45svh, 26rem); min-width: 0; background: var(--free-map-surface-canvas); }
  .map-host { position: absolute; inset: 0; }
  .map-state { align-items: center; display: flex; inset: 0; justify-content: center; padding: 2rem; position: absolute; text-align: center; color: var(--free-map-text-muted); }
  .map-state[hidden] { display: none; }
  .map-actions { display: flex; flex-wrap: wrap; gap: .55rem; left: .75rem; position: absolute; top: .75rem; z-index: 2; }
  .action {
    min-height: 40px;
    border: 1px solid var(--free-map-control-border);
    border-radius: var(--free-map-radius-small);
    background: var(--free-map-control-surface);
    color: var(--free-map-control-text);
    box-shadow: var(--free-map-shadow-control);
    cursor: pointer;
    font-size: .8rem;
    font-weight: 700;
    padding: .5rem .7rem;
  }
  .results { order: 3; height: clamp(20rem, 60svh, 34rem); overflow-y: auto; position: relative; scrollbar-gutter: stable; background: var(--free-map-surface); }
  .virtual { position: relative; width: 100%; }
  .row { align-items: stretch; display: flex; height: 88px; left: 0; position: absolute; right: 0; border-bottom: 1px solid var(--free-map-border-color); }
  .row button { width: 100%; border: 0; border-left: 4px solid transparent; background: transparent; cursor: pointer; padding: .8rem 1rem; text-align: left; }
  .row button:hover { background: var(--free-map-surface-muted); }
  .row button[aria-current="true"] { border-left-color: var(--free-map-accent); background: color-mix(in srgb, var(--free-map-accent) 10%, transparent); }
  .title { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; font-family: var(--free-map-heading-font-family); font-weight: 650; }
  .score { color: var(--free-map-accent); font-family: var(--free-map-font-family); font-size: .78rem; white-space: nowrap; }
  .meta, .summary { color: var(--free-map-text-muted); font-size: .8rem; margin-top: .2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unavailable { color: var(--free-map-accent); font-size: .75rem; font-weight: 700; }
  .empty { display: grid; min-height: 16rem; place-items: center; padding: 2rem; text-align: center; color: var(--free-map-text-muted); }
  .details { order: 4; border-top: 1px solid var(--free-map-border-color); padding: 1rem; background: var(--free-map-surface); }
  .details p { color: var(--free-map-text-muted); margin: .5rem 0; }
  .details-meta { font-size: .78rem; color: var(--free-map-accent); font-weight: 700; }
  .links { display: flex; flex-wrap: wrap; gap: .65rem; margin-top: .85rem; }
  .links a { color: var(--free-map-accent); font-weight: 700; }
  .links a.primary { background: var(--free-map-accent); border-radius: var(--free-map-radius-small); color: var(--free-map-on-accent); padding: .65rem 1rem; text-decoration: none; }
  .links a.primary:hover { background: var(--free-map-accent-hover); }
  .error { border: 1px solid var(--free-map-border-color); padding: 2rem; background: var(--free-map-surface); }
  .error p { color: var(--free-map-text-muted); }
  .error button { min-height: 44px; padding: .6rem 1rem; border: 1px solid var(--free-map-accent); background: transparent; color: var(--free-map-accent); cursor: pointer; font-weight: 700; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  :host([compact]) .tip, :host([compact]) .controls, :host([compact]) .results, :host([compact]) .details { display: none; }
  :host([compact]) .map { height: 24rem; }
  @media (min-width: 760px) {
    .layout { grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr); grid-template-rows: auto minmax(0, 1fr); height: clamp(36rem, 72svh, 49rem); }
    .controls { grid-column: 2; grid-row: 1; }
    .map { grid-column: 1; grid-row: 1 / span 2; height: auto; }
    .results { grid-column: 2; grid-row: 2; height: auto; min-height: 0; }
    .details { grid-column: 1 / -1; }
    .fields { grid-template-columns: 1fr 1fr; }
    :host([compact]) .layout { display: block; height: 24rem; }
    :host([compact]) .map { height: 24rem; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
`;

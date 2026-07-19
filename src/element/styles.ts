import { css } from "lit";

/** Structural layout only. Product appearance belongs to opt-in themes. */
export const structuralStyles = css`
  :host {
    --free-map-font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --free-map-heading-font-family: var(--free-map-font-family);
    --free-map-surface-canvas: #f8fafc;
    --free-map-surface: #ffffff;
    --free-map-surface-muted: #f1f5f9;
    --free-map-surface-elevated: #ffffff;
    --free-map-surface-selected: #e8f0ff;
    --free-map-accent-soft: #dbeafe;
    --free-map-sheet-surface: #ffffff;
    --free-map-sheet-handle: #64748b;
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
    --free-map-radius-small: .25rem;
    --free-map-radius: .5rem;
    --free-map-radius-pill: 999px;
    --free-map-shadow-control: 0 2px 8px rgb(15 23 42 / .16);
    --free-map-shadow-panel: 0 12px 32px rgb(15 23 42 / .2);
    color: var(--free-map-text);
    display: block;
    font-family: var(--free-map-font-family);
    line-height: 1.45;
    min-width: 0;
  }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select { color: inherit; font: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid var(--free-map-focus); outline-offset: 2px; }
  .shell { border: 1px solid var(--free-map-border-color); background: var(--free-map-surface); min-width: 0; overflow: hidden; }
  .tip { display: flex; align-items: start; justify-content: space-between; gap: 1rem; min-height: 3rem; padding: .45rem 1rem; border-bottom: 1px solid var(--free-map-border-color); background: var(--free-map-surface-muted); font-size: .875rem; }
  .tip strong { color: var(--free-map-text); }
  .tip button { border: 0; background: transparent; cursor: pointer; min-width: 44px; min-height: 44px; margin: -.35rem -.65rem -.35rem 0; }
  .layout { height: clamp(36rem, 72svh, 49rem); min-width: 0; position: relative; }
  .map { position: absolute; inset: 0; min-width: 0; background: var(--free-map-surface-canvas); }
  .map-host, .map-state { position: absolute; inset: 0; }
  .map-state { align-items: center; display: flex; justify-content: center; padding: 2rem; text-align: center; color: var(--free-map-text-muted); }
  .map-state[hidden] { display: none; }
  .map-actions { display: flex; flex-wrap: wrap; gap: .55rem; left: .75rem; position: absolute; top: .75rem; z-index: 2; }
  .action { min-height: 40px; border: 1px solid var(--free-map-control-border); border-radius: var(--free-map-radius-pill); background: var(--free-map-control-surface); color: var(--free-map-control-text); box-shadow: var(--free-map-shadow-control); cursor: pointer; font-size: .8rem; font-weight: 700; padding: .5rem .8rem; }
  .search-area { background: var(--free-map-accent); border-color: var(--free-map-accent); color: var(--free-map-on-accent); }
  .panel { background: var(--free-map-sheet-surface); box-shadow: var(--free-map-shadow-panel); display: grid; grid-template-rows: auto minmax(0, 1fr); left: 0; min-width: 0; position: absolute; right: 0; top: 22%; bottom: 0; transform: translate3d(0, 45%, 0); will-change: transform; z-index: 3; }
  .panel[data-snap="expanded"] { transform: translate3d(0, 0, 0); }
  .panel[data-snap="collapsed"] { transform: translate3d(0, calc(100% - 72px), 0); }
  .sheet-handle { align-items: center; background: var(--free-map-sheet-surface); border: 0; border-bottom: 1px solid var(--free-map-border-color); cursor: grab; display: grid; gap: .25rem; justify-items: center; min-height: 72px; padding: .5rem 1rem; touch-action: none; }
  .sheet-handle span { background: var(--free-map-sheet-handle); border-radius: var(--free-map-radius-pill); display: block; height: 4px; width: 42px; }
  .sheet-handle strong { font-size: .78rem; }
  .rail-toggle { display: none; }
  .panel-body { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; overflow: hidden; }
  .controls { padding: 1rem; border-bottom: 1px solid var(--free-map-border-color); background: var(--free-map-surface-muted); }
  h1, h2 { font-family: var(--free-map-heading-font-family); margin: 0; line-height: 1.15; }
  .lede { color: var(--free-map-text-muted); font-size: .875rem; margin: .35rem 0 0; }
  .search { display: block; margin-top: .75rem; }
  .search span, .field span { display: block; font-size: .72rem; font-weight: 700; letter-spacing: .06em; margin-bottom: .25rem; text-transform: uppercase; }
  input, select { width: 100%; min-height: 44px; border: 1px solid var(--free-map-control-border); border-radius: var(--free-map-radius-small); background: var(--free-map-control-surface); color: var(--free-map-control-text); padding: .65rem .75rem; }
  .fields { display: grid; gap: .7rem; margin-top: .7rem; grid-template-columns: 1fr 1fr; }
  .filter-chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
  .filter-chips button { background: var(--free-map-control-surface); border: 1px solid var(--free-map-control-border); border-radius: var(--free-map-radius-pill); cursor: pointer; font-size: .8rem; font-weight: 700; min-height: 36px; padding: .4rem .75rem; }
  .filter-chips button[aria-pressed="true"] { background: var(--free-map-accent-soft); border-color: var(--free-map-accent); color: var(--free-map-accent); }
  .results { background: var(--free-map-surface); contain: strict; min-height: 0; overflow-y: auto; position: relative; scrollbar-gutter: stable; }
  .virtual { contain: layout style; position: relative; width: 100%; }
  .row { align-items: stretch; border-bottom: 1px solid var(--free-map-border-color); contain: layout paint style; display: flex; height: 88px; left: 0; position: absolute; right: 0; }
  .row button { width: 100%; border: 0; border-left: 4px solid transparent; background: transparent; cursor: pointer; padding: .8rem 1rem; text-align: left; }
  .row button:hover { background: var(--free-map-surface-muted); }
  .row button[aria-current="true"] { border-left-color: var(--free-map-accent); background: var(--free-map-surface-selected); }
  .title { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; font-family: var(--free-map-heading-font-family); font-weight: 650; }
  .score { color: var(--free-map-accent); font-family: var(--free-map-font-family); font-size: .78rem; white-space: nowrap; }
  .meta, .summary { color: var(--free-map-text-muted); font-size: .8rem; margin-top: .2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .unavailable { color: var(--free-map-accent); font-size: .75rem; font-weight: 700; }
  .empty { display: grid; min-height: 16rem; place-items: center; padding: 2rem; text-align: center; color: var(--free-map-text-muted); }
  .details { border-top: 1px solid var(--free-map-border-color); padding: 1rem; background: var(--free-map-surface-elevated); }
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
  :host([compact]) .tip, :host([compact]) .panel { display: none; }
  :host([compact]) .layout { height: 24rem; }
  :host([layout="stack"]:not([compact])) .layout { display: grid; height: auto; }
  :host([layout="stack"]:not([compact])) .map { height: clamp(18rem, 45svh, 26rem); position: relative; }
  :host([layout="stack"]:not([compact])) .panel { box-shadow: none; display: block; position: relative; inset: auto; transform: none; will-change: auto; }
  :host([layout="stack"]:not([compact])) .sheet-handle, :host([layout="stack"]:not([compact])) .rail-toggle { display: none; }
  :host([layout="stack"]:not([compact])) .panel-body { grid-template-rows: auto minmax(20rem, 34rem) auto; }
  @media (min-width: 760px) {
    .layout { display: grid; grid-template-columns: minmax(20rem, 24rem) minmax(0, 1fr); }
    .map { grid-column: 2; position: relative; }
    .loading-layout, :host([compact]) .layout { grid-template-columns: minmax(0, 1fr); }
    .loading-layout .map, :host([compact]) .map { grid-column: 1; }
    .panel { box-shadow: none; border-right: 1px solid var(--free-map-border-color); grid-column: 1; grid-row: 1; inset: auto; min-width: 0; position: relative; transform: none !important; transition: width .18s ease; will-change: auto; }
    .sheet-handle { display: none; }
    .rail-toggle { align-items: center; background: var(--free-map-surface-elevated); border: 1px solid var(--free-map-border-color); border-radius: var(--free-map-radius-pill); cursor: pointer; display: flex; font-size: 1.25rem; height: 36px; justify-content: center; position: absolute; right: -18px; top: 12px; width: 36px; z-index: 5; }
    .panel[data-collapsed="true"] { width: 3.25rem; }
    .panel[data-collapsed="true"] .panel-body { visibility: hidden; }
    .panel[data-collapsed="true"] .rail-toggle { transform: rotate(180deg); visibility: visible; }
    :host([layout="responsive"]:not([compact])) .layout:has(.panel[data-collapsed="true"]) { grid-template-columns: 3.25rem minmax(0, 1fr); }
    :host([layout="stack"]:not([compact])) .layout { display: grid; grid-template-columns: 1fr; }
    :host([layout="stack"]:not([compact])) .map, :host([layout="stack"]:not([compact])) .panel { grid-column: 1; }
  }
  @media (forced-colors: active) {
    :host { color: CanvasText; }
    .shell, .panel, .panel-body, .tip, .controls, .results, .row, .details, .map, .map-state, .empty { background: Canvas; color: CanvasText; }
    input, select, .action, .filter-chips button, .rail-toggle, .sheet-handle { background: ButtonFace; color: ButtonText; }
    .tip strong, .lede, .meta, .summary, .details p, .details-meta, .score, .unavailable { color: CanvasText; }
    .shell, .panel, .controls, .row, .details, input, select, .action, .filter-chips button, .rail-toggle { border-color: CanvasText; }
    .search-area, .filter-chips button[aria-pressed="true"] { background: Highlight; color: HighlightText; }
    .sheet-handle span { background: CanvasText; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
`;

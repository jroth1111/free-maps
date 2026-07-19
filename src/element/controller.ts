import type { ReactiveController, ReactiveControllerHost } from "lit";
import { calculateBounds, parseFreeMapDataset, type FreeMapActivation, type FreeMapDataset, type FreeMapErrorDetail, type MapRenderer, type MapRendererFactory, type MapRendererState, type MapViewportDetail } from "../core";
import { mapMountScheduler } from "./scheduler";

const markRendererUpdate = (): void => { performance.mark?.("free-maps:renderer-update"); };

type RuntimeHost = ReactiveControllerHost & HTMLElement & {
  activation: FreeMapActivation;
  renderer: MapRendererFactory | null;
  runtimeContainer(): HTMLElement | undefined;
  runtimeState(): MapRendererState | null;
  runtimeSelect(id: string | null): void;
  runtimeViewport(detail: MapViewportDetail): void;
};

let registeredRenderer: MapRendererFactory | null = null;

export function setRegisteredRenderer(renderer: MapRendererFactory | null): void {
  registeredRenderer = renderer;
}

const stablePaint = (): Promise<void> => new Promise((resolve) => {
  const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback: FrameRequestCallback) => setTimeout(callback, 0) as unknown as number;
  frame(() => frame(() => {
    const scheduler = (globalThis as typeof globalThis & { scheduler?: { postTask(callback: () => void, options: { priority: "background" }): Promise<void> } }).scheduler;
    if (scheduler) void scheduler.postTask(resolve, { priority: "background" });
    else setTimeout(resolve, 0);
  }));
});

const yieldMainThread = (): Promise<void> => {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
};

export class FreeMapRuntimeController implements ReactiveController {
  data: FreeMapDataset | null = null;
  sourceData: FreeMapDataset | null = null;
  src: string | null = null;
  phase: "idle" | "loading" | "ready" | "error" = "idle";
  failure: FreeMapErrorDetail | null = null;
  active = false;

  private abort?: AbortController;
  private observer?: IntersectionObserver;
  private rendererInstance?: MapRenderer;
  private mountPromise?: Promise<void>;
  private updatePromise?: Promise<void>;
  private pendingState?: MapRendererState;
  private mountAbort = new AbortController();
  private revision = 0;
  private connected = false;
  private stable = stablePaint();

  constructor(private host: RuntimeHost) { host.addController(this); }

  hostConnected(): void {
    this.connected = true;
    if (this.mountAbort.signal.aborted) this.mountAbort = new AbortController();
    void this.prepareActivation();
    if (this.data) this.accept(this.data);
    else if (this.src) void this.reload();
  }

  hostDisconnected(): void {
    this.connected = false;
    this.mountAbort.abort();
    this.abort?.abort();
    this.observer?.disconnect();
    this.disposeRenderer();
  }

  hostUpdated(): void {
    if (this.active && this.phase === "ready") void this.syncRenderer();
  }

  setData(value: FreeMapDataset | null): void {
    this.data = value;
    this.revision++;
    this.abort?.abort();
    if (value) {
      this.sourceData = null;
      this.accept(value);
    } else if (this.connected && this.src) void this.reload();
    else {
      this.phase = "idle";
      this.failure = null;
      this.disposeRenderer();
      this.host.requestUpdate();
    }
  }

  setSrc(value: string | null): void {
    if (this.src === value) return;
    this.src = value;
    if (!this.data && this.connected) void this.reload();
  }

  async activate(): Promise<void> {
    await this.stable;
    if (!this.connected) return;
    this.active = true;
    this.observer?.disconnect();
    if (!this.data && !this.sourceData && this.src && this.phase !== "loading") await this.reload();
    this.host.requestUpdate();
    await this.host.updateComplete;
    if (this.phase === "ready") await this.syncRenderer();
  }

  async reload(): Promise<void> {
    if (this.data) {
      this.accept(this.data);
      if (this.active) await this.syncAfterUpdate();
      return;
    }
    if (!this.src) {
      this.report("dataset-fetch", new Error("Set data or src before reloading"), false);
      return;
    }
    const revision = ++this.revision;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.phase = "loading";
    this.failure = null;
    this.host.requestUpdate();
    try {
      const response = await fetch(this.src, { signal: abort.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Dataset request failed with ${response.status}`);
      const value = await response.json();
      if (abort.signal.aborted || revision !== this.revision || this.data) return;
      try { this.sourceData = parseFreeMapDataset(value); }
      catch (cause) { this.report("dataset-schema", cause, false); return; }
      this.phase = "ready";
      this.failure = null;
      this.host.requestUpdate();
      if (this.active) await this.syncAfterUpdate();
    } catch (cause) {
      if (!abort.signal.aborted) this.report("dataset-fetch", cause, true);
    }
  }

  async syncRenderer(): Promise<void> {
    const state = this.host.runtimeState();
    const container = this.host.runtimeContainer();
    if (!state || !container || !this.active) return;
    const factory = this.host.renderer ?? registeredRenderer;
    if (!factory) { this.report("renderer-configuration", new Error("No renderer configured. Pass renderer or register a default with defineFreeMapElements({ renderer })."), false); return; }
    this.pendingState = state;
    if (!this.mountPromise) {
      if (this.mountAbort.signal.aborted) this.mountAbort = new AbortController();
      const signal = this.mountAbort.signal;
      this.mountPromise = mapMountScheduler.schedule(async () => {
        if (signal.aborted || !this.connected) throw new DOMException("Map initialization cancelled", "AbortError");
        try { this.rendererInstance = await factory(); }
        catch (cause) { if (!signal.aborted) this.report("renderer-loading", cause, true); throw cause; }
        // A dynamic renderer factory may evaluate a substantial graphics
        // module. Yield before mount so module evaluation and renderer setup
        // cannot combine into one long main-thread task. The scheduler slot is
        // still held until first paint because this yield is inside the task.
        await yieldMainThread();
        if (signal.aborted || !this.connected) { this.rendererInstance.destroy(); throw new DOMException("Map initialization cancelled", "AbortError"); }
        try {
          await this.rendererInstance.mount(container, state, (id) => this.host.runtimeSelect(id), { onViewportChange: (detail) => this.host.runtimeViewport(detail) });
          if (signal.aborted || !this.connected) { this.rendererInstance.destroy(); throw new DOMException("Map initialization cancelled", "AbortError"); }
          this.host.dispatchEvent(new CustomEvent("free-map-ready", { bubbles: true, composed: true, detail: { datasetId: state.dataset.id, pointCount: state.dataset.points.length, mappedCount: state.points.length } }));
        } catch (cause) { if (!signal.aborted && this.connected) this.report("renderer-runtime", cause, true); throw cause; }
      }, signal);
      try {
        await this.mountPromise;
        const latest = this.pendingState;
        this.pendingState = undefined;
        if (latest && latest !== state) {
          await this.rendererInstance?.update(latest);
          markRendererUpdate();
        }
      } catch { this.disposeRenderer(); }
      return;
    }
    if (!this.updatePromise) {
      this.updatePromise = Promise.resolve().then(async () => {
        try {
          await this.mountPromise;
          const latest = this.pendingState;
          this.pendingState = undefined;
          if (latest && this.connected) {
            await this.rendererInstance?.update(latest);
            markRendererUpdate();
          }
        } catch (cause) {
          if (!this.mountAbort.signal.aborted && this.connected) this.report("renderer-runtime", cause, true);
          this.disposeRenderer();
        }
      }).finally(() => { this.updatePromise = undefined; if (this.pendingState && this.connected) void this.syncRenderer(); });
    }
    await this.updatePromise;
  }

  fitAll(): void { const bounds = calculateBounds(this.host.runtimeState()?.points ?? []); if (bounds) this.rendererInstance?.fitBounds(bounds); }
  resetView(): void { this.rendererInstance?.resetView(); }
  get dataset(): FreeMapDataset | null { return this.data ?? this.sourceData; }

  report(code: FreeMapErrorDetail["code"], cause: unknown, retryable: boolean): void {
    const detail: FreeMapErrorDetail = { code, message: cause instanceof Error ? cause.message : String(cause), cause, retryable };
    this.phase = "error";
    this.failure = detail;
    this.host.requestUpdate();
    this.host.dispatchEvent(new CustomEvent("free-map-error", { bubbles: true, composed: true, detail }));
  }

  private accept(value: FreeMapDataset): void {
    try {
      this.data = parseFreeMapDataset(value);
      this.phase = "ready";
      this.failure = null;
      this.host.requestUpdate();
    } catch (cause) { this.report("dataset-schema", cause, false); }
  }

  private async prepareActivation(): Promise<void> {
    if (this.host.activation === "manual") return;
    if (this.host.activation === "eager") { await this.activate(); return; }
    await this.stable;
    if (!this.connected || this.host.activation !== "visible") return;
    if (typeof IntersectionObserver === "undefined") { await this.activate(); return; }
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void this.activate();
    }, { rootMargin: "0px" });
    this.observer.observe(this.host);
  }

  activationChanged(): void { if (this.host.activation !== "manual") void this.prepareActivation(); }

  private async syncAfterUpdate(): Promise<void> { await this.host.updateComplete; await this.syncRenderer(); }
  private disposeRenderer(): void {
    this.rendererInstance?.destroy();
    this.rendererInstance = undefined;
    this.mountPromise = undefined;
    this.updatePromise = undefined;
    this.pendingState = undefined;
  }
}

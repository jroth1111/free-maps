const entry = document.documentElement.dataset.entry;

const stablePaint = async (): Promise<void> => {
  // requestAnimationFrame callbacks run before the compositor paints. Three
  // frame boundaries ensure the static shell has been committed before route
  // enhancement begins, even when the module first executes late in a frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { postTask(callback: () => void, options: { priority: "background" }): Promise<void> } }).scheduler;
  if (scheduler) await scheduler.postTask(() => undefined, { priority: "background" });
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const load = async () => {
  if (entry === "explorer") await import("./explorer");
  else if (entry === "embed") await import("./embed");
  else if (entry === "states") await import("./states");
  else if (entry === "vanilla") await import("./vanilla");
  else if (entry === "react") await import("./react");
  else if (entry === "stress") await import("./stress");
};

const bootstrap = async () => {
  await stablePaint();
  performance.mark("free-maps:stable-paint");
  document.documentElement.dataset.stablePaint = String(performance.now());
  await load();
};

void bootstrap();

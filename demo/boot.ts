const entry = document.documentElement.dataset.entry;
const load = async () => {
  if (entry === "explorer") await import("./explorer");
  else if (entry === "embed") await import("./embed");
  else if (entry === "states") await import("./states");
  else if (entry === "vanilla") await import("./vanilla");
  else if (entry === "react") await import("./react");
  else if (entry === "stress") await import("./stress");
};
requestAnimationFrame(() => requestAnimationFrame(() => {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { postTask(callback: () => Promise<void>, options: { priority: "background" }): Promise<void> } }).scheduler;
  if (scheduler) void scheduler.postTask(load, { priority: "background" });
  else setTimeout(() => void load(), 0);
}));

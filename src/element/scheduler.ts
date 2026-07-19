interface ScheduledTask<T> {
  run: (signal: AbortSignal) => Promise<T>;
  signal: AbortSignal;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const abortError = () => new DOMException("Scheduled map initialization was cancelled", "AbortError");

/** A cancellation-aware FIFO scheduler whose single slot is held until a task settles. */
export class SerialMountScheduler {
  private queue: ScheduledTask<unknown>[] = [];
  private running = false;

  schedule<T>(run: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ run, signal, resolve, reject } as ScheduledTask<unknown>);
      void this.drain();
    });
  }

  get pending(): number { return this.queue.length + (this.running ? 1 : 0); }

  private async drain(): Promise<void> {
    if (this.running) return;
    const task = this.queue.shift();
    if (!task) return;
    if (task.signal.aborted) {
      task.reject(abortError());
      void this.drain();
      return;
    }
    this.running = true;
    try { task.resolve(await task.run(task.signal)); }
    catch (cause) { task.reject(cause); }
    finally { this.running = false; void this.drain(); }
  }
}

export const mapMountScheduler = new SerialMountScheduler();

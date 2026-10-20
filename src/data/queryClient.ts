export const DATA_ERROR = "Couldn't refresh this information. It will retry automatically.";
export const ACTION_ERROR = "Couldn't save that change. Please try again.";
export type DataTag = "dashboard" | "workspace" | "drafts" | "chats" | "preferences" | "services" | "activity" | "coaching" | "noticed" | "engine";
export interface QueryState<T> { data: T; loading: boolean; ready: boolean; error: string; }
export interface Query<T> {
  key: string;
  getSnapshot: () => QueryState<T>;
  subscribe: (listener: () => void) => () => void;
  refresh: () => Promise<T>;
  setData: (update: T | ((previous: T) => T)) => void;
}
export type Diagnostic = { at: string; operation: string; detail: string };
type Entry<T> = {
  key: string; tags: readonly DataTag[]; initial: T; load: () => Promise<T>;
  state: QueryState<T>; listeners: Set<() => void>; generation: number;
  stale: boolean; flight?: Promise<T>; fallbackMs: number; due: number;
  query: Query<T>;
};
type Connect = (invalidate: (tags?: readonly DataTag[]) => void) => () => void;
/** One client per webview. Only observed queries own timers or subscriptions. */
export class QueryClient {
  private entries = new Map<string, Entry<unknown>>();
  private timer?: ReturnType<typeof setTimeout>;
  private flush?: ReturnType<typeof setTimeout>;
  private disconnect?: () => void;
  private observers = 0;
  private diagnostics: Diagnostic[] = [];
  private diagnosticListeners = new Set<() => void>();
  constructor(private connect?: Connect, private visible = () => true) {}
  getDiagnostics = () => this.diagnostics;
  subscribeDiagnostics = (listener: () => void) => {
    this.diagnosticListeners.add(listener);
    return () => { this.diagnosticListeners.delete(listener); };
  };
  recordError(operation: string, error: unknown): string {
    // Never retain IPC arguments (which can contain provider keys or screen text).
    const detail = String(error).replace(/(bearer\s+|(?:api[_ -]?key|token|password)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]").slice(0, 4000);
    this.diagnostics = [...this.diagnostics.slice(-19), { at: new Date().toISOString(), operation, detail }];
    this.diagnosticListeners.forEach((listener) => listener());
    return ACTION_ERROR;
  }
  query<T>(key: string, tags: readonly DataTag[], initial: T, load: () => Promise<T>, fallbackMs = 30_000): Query<T> {
    const found = this.entries.get(key);
    if (found) return found.query as Query<T>;
    const entry: Entry<T> = { key, tags, initial, load, state: { data: initial, loading: false, ready: false, error: "" }, listeners: new Set(), generation: 0, stale: true, fallbackMs, due: 0, query: undefined! };
    const notify = () => entry.listeners.forEach((listener) => listener());
    entry.query = {
      key,
      getSnapshot: () => entry.state,
      subscribe: (listener) => {
        if (!entry.listeners.size) entry.stale = true;
        entry.listeners.add(listener);
        this.observers++;
        if (!this.disconnect && this.connect) this.disconnect = this.connect((tags) => this.invalidate(tags));
        if (!entry.due) entry.due = Date.now() + entry.fallbackMs;
        if (entry.stale) this.scheduleFlush();
        this.schedulePoll();
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          entry.listeners.delete(listener);
          this.observers--;
          // Strict Mode immediately resubscribes. Dispose once that cycle settles.
          queueMicrotask(() => {
            if (!this.observers) {
              this.disconnect?.(); this.disconnect = undefined;
              if (this.timer) clearTimeout(this.timer);
              if (this.flush) clearTimeout(this.flush);
              this.timer = this.flush = undefined;
            } else this.schedulePoll();
          });
        };
      },
      refresh: () => {
        if (!entry.flight && !entry.stale) { entry.generation++; entry.stale = true; }
        return this.fetch(entry);
      },
      setData: (update) => {
        entry.generation++;
        entry.state = { data: typeof update === "function" ? (update as (value: T) => T)(entry.state.data) : update, loading: false, ready: true, error: "" };
        entry.stale = false; notify();
      },
    };
    this.entries.set(key, entry as Entry<unknown>);
    return entry.query;
  }
  invalidate(tags?: readonly DataTag[], reset = false) {
    for (const entry of this.entries.values()) {
      if (tags && !entry.tags.some((tag) => tags.includes(tag))) continue;
      entry.generation++; entry.stale = true;
      if (reset) {
        entry.state = { data: entry.initial, ready: false, loading: !!entry.flight, error: "" };
        entry.listeners.forEach((listener) => listener());
      }
    }
    this.scheduleFlush();
  }
  private scheduleFlush() {
    if (this.flush) return;
    this.flush = setTimeout(() => {
      this.flush = undefined;
      if (!this.visible()) return;
      for (const entry of this.entries.values())
        if (entry.listeners.size && entry.stale) void this.fetch(entry).catch(() => {});
    }, 20);
  }
  private fetch<T>(entry: Entry<T>): Promise<T> {
    if (entry.flight) return entry.flight;
    // Install the promise before calling a loader, even a synchronously throwing one.
    entry.flight = Promise.resolve().then(async () => {
      for (;;) {
        const generation = entry.generation;
        entry.state = { ...entry.state, loading: true };
        entry.listeners.forEach((listener) => listener());
        try {
          const data = await entry.load();
          if (generation !== entry.generation) {
            if (entry.stale) continue;
            return entry.state.data;
          }
          entry.stale = false;
          entry.state = { data, loading: false, ready: true, error: "" };
          return data;
        } catch (error) {
          if (generation !== entry.generation && entry.stale) continue;
          this.recordError(entry.key, error);
          entry.state = { ...entry.state, loading: false, error: DATA_ERROR };
          throw error;
        } finally {
          entry.listeners.forEach((listener) => listener());
        }
      }
    }).finally(() => {
      entry.flight = undefined;
      entry.due = Date.now() + entry.fallbackMs;
      this.schedulePoll();
    });
    return entry.flight;
  }
  private schedulePoll() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const active = [...this.entries.values()].filter((entry) => entry.listeners.size);
    if (!active.length) return;
    const due = Math.min(...active.map((entry) => entry.due || Date.now() + entry.fallbackMs));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      for (const entry of active) {
        if (!entry.listeners.size || entry.due > Date.now()) continue;
        entry.due = Date.now() + entry.fallbackMs;
        if (this.visible()) {
          entry.stale = true;
          void this.fetch(entry).catch(() => {});
        }
      }
      this.schedulePoll();
    }, Math.max(1, due - Date.now()));
  }
}

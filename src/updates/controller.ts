export interface UpdateInfo {
  status: "current" | "unpublished" | "available";
  current_version: string;
  version: string | null;
  notes: string | null;
}
export interface UpdateProgress {
  phase: "downloading" | "installing";
  downloaded: number;
  total: number | null;
}
export interface UpdateSnapshot {
  startup: "pending" | "checking" | "updating" | "ready";
  phase: "idle" | "checking" | "downloading" | "installing";
  info: UpdateInfo | null;
  error: string;
  progress: number | null;
}
export interface UpdateTransport {
  check: () => Promise<UpdateInfo>;
  install: (
    version: string,
    onProgress: (value: UpdateProgress) => void,
  ) => Promise<void>;
}

// One controller owns both the sidebar indicator and the update dialog.
export class UpdateController {
  snapshot: UpdateSnapshot = {
    startup: "pending",
    phase: "idle",
    info: null,
    error: "",
    progress: null,
  };
  private startupPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  constructor(private transport: UpdateTransport) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private set(patch: Partial<UpdateSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  // Only the initial launch installs automatically, before workspace editing.
  // Later checks notify instead of interrupting an active session.
  start() {
    if (this.startupPromise) return this.startupPromise;
    this.startupPromise = (async () => {
      this.set({ startup: "checking" });
      await this.check();
      if (this.snapshot.info?.status === "available") {
        this.set({ startup: "updating" });
        await this.install();
        if (this.snapshot.phase === "installing") return;
      }
      // Offline/check/download failures must not prevent opening saved work.
      this.set({ startup: "ready" });
    })();
    return this.startupPromise;
  }
  async check() {
    if (this.snapshot.phase !== "idle") return;
    this.set({ phase: "checking", error: "" });
    try {
      this.set({ info: await this.transport.check() });
    } catch (error) {
      // A failed check invalidates the native pending update. Do not leave an
      // apparently installable stale badge on screen.
      this.set({ info: null, error: String(error) });
    } finally {
      this.set({ phase: "idle" });
    }
  }
  async install() {
    const info = this.snapshot.info;
    if (
      this.snapshot.phase !== "idle" ||
      info?.status !== "available" ||
      !info.version
    )
      return;
    this.set({ phase: "downloading", progress: null, error: "" });
    try {
      await this.transport.install(info.version, (event) =>
        this.set({
          phase: event.phase,
          progress:
            event.total && event.total > 0
              ? Math.min(
                  100,
                  Math.round((event.downloaded / event.total) * 100),
                )
              : null,
        }),
      );
      this.set({ phase: "installing", progress: 100 });
    } catch (error) {
      this.set({ phase: "idle", progress: null, error: String(error) });
    }
  }
}

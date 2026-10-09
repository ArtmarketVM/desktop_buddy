import { useEffect, useRef } from "react";
import {
  ArrowDownToLine,
  Check,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { desktop } from "../api/tauri";
import type { UpdateController, UpdateSnapshot } from "../updates/controller";

export function StartupUpdate({ snapshot }: { snapshot: UpdateSnapshot }) {
  const updating = snapshot.startup === "updating";
  return (
    <div className="startup-update" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={26} />
      <h1>{updating ? "Updating Buddy" : "Getting Buddy ready"}</h1>
      <p>
        {updating
          ? "Installing the latest signed release before opening your workspace."
          : "Checking for the latest signed release…"}
      </p>
      {updating && (
        <progress
          aria-label="Update progress"
          max={100}
          value={snapshot.progress ?? undefined}
        />
      )}
      <p className="helper">
        Your saved work stays on this device. If an update is unavailable, Buddy
        opens the installed version.
      </p>
    </div>
  );
}

export function UpdateEntry({
  snapshot,
  onClick,
}: {
  snapshot: UpdateSnapshot;
  onClick: () => void;
}) {
  const available = snapshot.info?.status === "available";
  return (
    <button
      className={`update-entry ${available ? "update-available" : ""}`}
      onClick={onClick}
      aria-label={available ? "Update available" : "Updates"}
      title={
        available
          ? `Update available · ${snapshot.info?.version}`
          : "Check for updates"
      }
    >
      <span className="update-icon">
        {snapshot.phase === "checking" ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowDownToLine size={18} />
        )}
      </span>
      <span>
        {available ? "Update available" : "Updates"}
        <small>
          {available
            ? `Version ${snapshot.info?.version}`
            : "Keep Buddy up to date"}
        </small>
      </span>
    </button>
  );
}

export function UpdateDialog({
  controller,
  snapshot,
  version,
  onClose,
  unsaved = false,
}: {
  controller: UpdateController;
  snapshot: UpdateSnapshot;
  version: string;
  onClose: () => void;
  unsaved?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const busy =
    snapshot.phase === "downloading" || snapshot.phase === "installing";
  const available = snapshot.info?.status === "available";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        ref={dialog}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          if (e.key !== "Tab") return;
          const items = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), a[href]",
            ) ?? [],
          );
          const first = items[0],
            last = items[items.length - 1];
          if (!first) {
            e.preventDefault();
            return;
          }
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (
            !e.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === dialog.current)
          ) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close updates"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <div className={`dialog-update-icon ${available ? "available" : ""}`}>
          {available ? <ArrowDownToLine size={24} /> : <RefreshCw size={24} />}
        </div>
        <span className="eyebrow">DESKTOP BUDDY</span>
        <h2 id="update-title">
          {busy
            ? "Updating Buddy"
            : available
              ? "A new version is ready"
              : snapshot.info?.status === "current" && !snapshot.error
                ? "You're up to date"
                : "App updates"}
        </h2>
        <p className="update-version">
          Installed version {version}
          {available ? ` → ${snapshot.info?.version}` : ""}
        </p>
        {!desktop ? (
          <p className="helper">
            Update checks are available in the Windows app.
          </p>
        ) : snapshot.phase === "checking" ? (
          <p role="status">Checking GitHub Releases…</p>
        ) : snapshot.info?.status === "unpublished" ? (
          <p className="helper">
            No published updates yet. Buddy will check again automatically.
          </p>
        ) : snapshot.info?.status === "current" ? (
          <p className="update-current">
            <Check size={16} /> You have the latest published version.
          </p>
        ) : !available && !snapshot.error ? (
          <p className="helper">Check for the latest Windows release.</p>
        ) : null}
        {available && !busy && (
          <>
            <p>
              Download the signed Windows update and restart Buddy. Your saved
              goals, profile and API keys stay on this device.
            </p>
            {snapshot.info?.notes && (
              <details className="release-notes">
                <summary>What's new</summary>
                <pre>{snapshot.info.notes}</pre>
              </details>
            )}
            <p className="helper">Save any unsaved edits before updating.</p>
          </>
        )}
        {busy && (
          <div aria-live="polite">
            <p>
              {snapshot.phase === "installing"
                ? "Installing and restarting…"
                : "Downloading and verifying…"}{" "}
              {snapshot.progress !== null ? `${snapshot.progress}%` : ""}
            </p>
            <progress max={100} value={snapshot.progress ?? undefined} />
          </div>
        )}
        {snapshot.error && (
          <p className="update-error" role="alert">
            {snapshot.error}
          </p>
        )}
        {unsaved && available && (
          <p className="helper">Save or discard your goal edits to update.</p>
        )}
        <div className="dialog-actions">
          <button className="secondary" disabled={busy} onClick={onClose}>
            {available ? "Later" : "Close"}
          </button>
          {available ? (
            <button
              disabled={!desktop || busy || unsaved}
              onClick={() => void controller.install()}
            >
              <ArrowDownToLine size={16} />
              {busy ? "Updating…" : "Update & restart"}
            </button>
          ) : (
            <button
              disabled={!desktop || busy || snapshot.phase === "checking"}
              onClick={() => void controller.check()}
            >
              <RefreshCw
                size={16}
                className={snapshot.phase === "checking" ? "spin" : ""}
              />
              Check for updates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

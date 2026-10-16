import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, desktop, safeUrl } from "../api/tauri";
import type { AvatarState, BuddyView, Goal, GoalPlan } from "../types";
import { defaultUserSettings } from "../types";
import { Avatar } from "./Avatar";
import { defaultCompanionView } from "../companion/types";
import { CompanionChat } from "../companion/CompanionChat";
import { InterventionCard } from "../companion/InterventionCard";
import { BuddyActionBar } from "../companion/BuddyActionBar";
import { useBuddyPointer } from "../companion/useBuddyPointer";
import { useBuddyActions } from "../companion/useBuddyActions";

export function DesktopBuddy({
  view,
  onDismiss,
  onDnd,
  goal = null,
  plan = null,
  onChanged = async () => {},
}: {
  view: BuddyView;
  onDismiss: () => void;
  onDnd: () => void;
  goal?: Goal | null;
  plan?: GoalPlan | null;
  onChanged?: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatState, setChatState] = useState<AvatarState>("idle");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [responseState, setResponseState] = useState<AvatarState | null>(null);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (view.activity_event === "goal_completed") {
      setResponseState("success");
      if (responseTimer.current) clearTimeout(responseTimer.current);
      responseTimer.current = setTimeout(() => setResponseState(null), 1600);
    }
  }, [view.activity_revision, view.activity_event]);
  useEffect(
    () => () => {
      if (responseTimer.current) clearTimeout(responseTimer.current);
    },
    [],
  );
  const pointer = useRef<{ x: number; y: number; dragged: boolean } | null>(
    null,
  );
  const companion = view.companion ?? defaultCompanionView;
  const actions = useBuddyActions(companion.chat_open || busy);
  useEffect(() => {
    if (!companion.chat_open) setMode("text");
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && companion.chat_open && desktop)
        void api
          .closeChat()
          .then(onChanged)
          .catch((e) => setError(String(e)));
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [companion.chat_open, onChanged]);
  const card = view.suggestion || view.decision;
  const appearance = view.avatar ?? defaultUserSettings.profile.avatar;
  const root = useRef<HTMLElement>(null);
  useBuddyPointer(
    root,
    appearance.visible || companion.chat_open,
    busy,
    () => {
      setError("Click-through is unavailable. Restart sumi to try again.");
    },
    actions.setNativeHovered,
  );
  async function action(work: () => Promise<unknown>, celebrate = false) {
    setBusy(true);
    try {
      setError("");
      await work();
      await onChanged();
      if (celebrate) {
        setResponseState("success");
        if (responseTimer.current) clearTimeout(responseTimer.current);
        responseTimer.current = setTimeout(() => setResponseState(null), 1600);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!appearance.visible && !companion.chat_open) return null;
  const state: AvatarState =
    responseState ??
    (companion.chat_open
      ? chatState
      : companion.intervention
        ? companion.intervention.kind === "movement"
          ? "stretching"
          : "attention"
        : companion.state);
  return (
    <main
      ref={root}
      className={`desktop-buddy ${companion.chat_open ? "chatting" : companion.intervention || card ? "expanded" : "compact"}`}
    >
      {companion.chat_open ? (
        <div className="desktop-compact-input">
          <CompanionChat
            view={companion}
            goal={goal}
            plan={plan}
            onChanged={onChanged}
            onState={setChatState}
            compact
            mode={mode}
            onMode={setMode}
            onClose={() => void action(api.closeChat)}
          />
        </div>
      ) : companion.intervention ? (
        <InterventionCard
          prompt={companion.intervention}
          busy={busy}
          respond={(response) =>
            void action(
              () => api.companionRespond(companion.intervention!.id, response),
              response === "accept" &&
                ["new_task", "completion"].includes(
                  companion.intervention!.kind,
                ),
            )
          }
        />
      ) : (
        card && (
          <section className="suggestion-card" aria-live="polite">
            <span className="eyebrow">
              {view.suggestion
                ? "A LITTLE HELP FOR YOUR GOAL"
                : "A LITTLE CHECK-IN"}
            </span>
            <h2>{view.suggestion?.title || "Want a little help?"}</h2>
            <p>{card.reason}</p>
            {view.suggestion && (
              <button
                onClick={() =>
                  void action(async () => {
                    const url = safeUrl(view.suggestion!.url);
                    if (url) await openUrl(url);
                  })
                }
              >
                Open resource ↗
              </button>
            )}
            <div className="settings-actions">
              {view.decision?.id && (
                <button
                  className="text-button"
                  onClick={() =>
                    void action(() => api.feedback(view.decision!.id!, true))
                  }
                >
                  This is related
                </button>
              )}
              <button className="text-button" onClick={onDismiss}>
                Not now · 1 hour
              </button>
              <button className="text-button" onClick={onDnd}>
                Do not disturb
              </button>
            </div>
            <small>Closes after 45 seconds.</small>
          </section>
        )
      )}
      <button
        {...actions.events}
        className="desktop-character"
        aria-label="Open sumi mini chat"
        title="Click to chat · drag to move · right-click for actions"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pointer.current = {
            x: event.clientX,
            y: event.clientY,
            dragged: false,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const origin = pointer.current;
          if (
            desktop &&
            origin &&
            !origin.dragged &&
            Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 6
          ) {
            origin.dragged = true;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            void action(() => getCurrentWindow().startDragging());
          }
        }}
        onPointerUp={() => {
          const origin = pointer.current;
          pointer.current = null;
          if (origin && !origin.dragged && desktop)
            void action(() =>
              companion.chat_open ? api.closeChat() : api.openChat(),
            );
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onClick={(event) => {
          if (event.detail === 0 && desktop)
            void action(() =>
              companion.chat_open ? api.closeChat() : api.openChat(),
            );
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (desktop) void action(api.companionMenu);
        }}
      >
        <Avatar appearance={{ ...appearance, visible: true }} state={state} />
      </button>
      <BuddyActionBar
        color={appearance.color}
        actions={actions}
        onWrite={() => {
          setMode("text");
          if (desktop) void action(api.openChat);
        }}
        onTalk={() => {
          setMode("voice");
          if (desktop) void action(api.openChat);
        }}
      />
      {error && (
        <small className="companion-error" role="alert">
          {error}
        </small>
      )}
    </main>
  );
}

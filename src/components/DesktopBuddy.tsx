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
  const floating = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("buddy-chat-card-size") ?? "null",
      );
      return {
        width: Number.isFinite(saved?.width) ? Math.max(280, saved.width) : 360,
        height: Number.isFinite(saved?.height)
          ? Math.max(280, saved.height)
          : 460,
      };
    } catch {
      return { width: 360, height: 460 };
    }
  });
  const cardDrag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [cardPosition, setCardPosition] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("buddy-chat-card") ?? "null",
      );
      return {
        left: Number.isFinite(saved?.left) ? Math.max(0, saved.left) : 8,
        top: Number.isFinite(saved?.top) ? Math.max(0, saved.top) : 8,
      };
    } catch {
      return { left: 8, top: 8 };
    }
  });
  useEffect(() => {
    localStorage.setItem("buddy-chat-card", JSON.stringify(cardPosition));
  }, [cardPosition]);
  const positionCard = (left: number, top: number) => {
    const bounds = floating.current?.getBoundingClientRect();
    const next = {
      left: Math.max(0, Math.min(left, innerWidth - (bounds?.width ?? 360))),
      top: Math.max(0, Math.min(top, innerHeight - (bounds?.height ?? 440))),
    };
    setCardPosition((previous) =>
      previous.left === next.left && previous.top === next.top
        ? previous
        : next,
    );
  };
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
  useEffect(() => {
    const fit = () => positionCard(cardPosition.left, cardPosition.top);
    if (companion.chat_open) fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [cardPosition.left, cardPosition.top, companion.chat_open]);
  useEffect(() => {
    const node = floating.current;
    if (!node || !companion.chat_open) return;
    const observer = new ResizeObserver(() => {
      const size = { width: node.offsetWidth, height: node.offsetHeight };
      setCardSize((previous) =>
        previous.width === size.width && previous.height === size.height
          ? previous
          : size,
      );
      localStorage.setItem("buddy-chat-card-size", JSON.stringify(size));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [companion.chat_open]);
  const card = view.suggestion || view.decision;
  const appearance = view.avatar ?? defaultUserSettings.profile.avatar;
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
      className={`desktop-buddy ${companion.chat_open ? "chatting" : companion.intervention || card ? "expanded" : "compact"}`}
      onPointerMove={(event) => {
        const drag = cardDrag.current;
        if (drag)
          positionCard(
            drag.left + event.clientX - drag.x,
            drag.top + event.clientY - drag.y,
          );
      }}
      onPointerUp={() => {
        cardDrag.current = null;
      }}
      onPointerCancel={() => {
        cardDrag.current = null;
      }}
    >
      {companion.chat_open ? (
        <div
          className="floating-chat-card"
          ref={floating}
          style={{
            left: cardPosition.left,
            top: cardPosition.top,
            width: cardSize.width,
            height: cardSize.height,
          }}
        >
          <CompanionChat
            view={companion}
            goal={goal}
            plan={plan}
            onChanged={onChanged}
            onState={setChatState}
            onMove={(event) => {
              if (
                event.button !== 0 ||
                (event.target as HTMLElement).closest("button")
              )
                return;
              cardDrag.current = {
                x: event.clientX,
                y: event.clientY,
                ...cardPosition,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onResize={() => {
              if (desktop)
                void action(() =>
                  getCurrentWindow().startResizeDragging("SouthEast"),
                );
            }}
          />
          <div
            className="card-position-controls"
            aria-label="Move chat relative to Buddy"
          >
            {(
              [
                [-16, 0, "left"],
                [16, 0, "right"],
                [0, -16, "up"],
                [0, 16, "down"],
              ] as const
            ).map(([x, y, label]) => (
              <button
                className="text-button"
                key={label}
                aria-label={`Move chat card ${label}`}
                onClick={() =>
                  positionCard(cardPosition.left + x, cardPosition.top + y)
                }
              >
                {label === "left"
                  ? "←"
                  : label === "right"
                    ? "→"
                    : label === "up"
                      ? "↑"
                      : "↓"}
              </button>
            ))}
          </div>
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
        className="desktop-character"
        aria-label="Open Buddy mini chat"
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
      {error && (
        <small className="companion-error" role="alert">
          {error}
        </small>
      )}
    </main>
  );
}

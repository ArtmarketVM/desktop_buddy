import { useEffect, useLayoutEffect, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, desktop } from "../api/tauri";
import type { AvatarState, BuddyView } from "../types";
import { CHAT_POSE_EVENT, type ChatPoseMessage } from "./useChatPose";
export type BuddySurface = "combined" | "mascot" | "panel";

/** Prepare styles and fonts before showing; occluded WKWebViews may suspend animation frames. */
export function afterBuddyPaint(work: () => void): () => void {
  let cancelled = false;
  let first = 0;
  let second = 0;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const ready = () => {
    if (cancelled || finished) return;
    finished = true;
    clearTimeout(fallback);
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
    work();
  };
  void (document.fonts?.ready ?? Promise.resolve()).then(() => {
    if (cancelled) return;
    // Resolve computed styles before the first native presentation, even while occluded.
    void getComputedStyle(document.documentElement).backgroundColor;
    fallback = setTimeout(ready, 150);
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(ready);
    });
  });
  return () => {
    cancelled = true;
    clearTimeout(fallback);
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}
export function useBuddySurface(
  root: RefObject<HTMLElement | null>,
  surface: BuddySurface,
  view: BuddyView,
  setPose: (state: AvatarState | null) => void,
) {
  const generation = surface === "panel" ? view.panel?.generation : undefined;
  const chat = view.panel?.mode === 3;
  useLayoutEffect(() => {
    if (!desktop || surface === "combined") return;
    if (surface === "panel" && generation == null) return;
    return afterBuddyPaint(() => {
      void (
        surface === "mascot"
          ? api.mascotFrameReady()
          : api.buddyPanelReady(generation!)
      ).catch(() => {});
    });
  }, [surface, generation]);
  useLayoutEffect(() => {
    if (
      !desktop ||
      surface !== "panel" ||
      chat ||
      !root.current ||
      typeof ResizeObserver === "undefined"
    )
      return;
    const card = root.current.querySelector<HTMLElement>(
      ".companion-prompt, .suggestion-card",
    );
    if (!card) return;
    let last = 0;
    const measure = () => {
      const height = Math.max(
        140,
        Math.min(
          640,
          Math.ceil(
            card.scrollHeight +
              parseFloat(getComputedStyle(card).borderTopWidth || "0") +
              parseFloat(getComputedStyle(card).borderBottomWidth || "0") +
              (root.current?.querySelector<HTMLElement>(".companion-error")
                ?.scrollHeight ?? 0),
          ) + 16,
        ),
      );
      if (height !== last) {
        last = height;
        void api.measureBuddyPanel(height).catch(() => {});
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    measure();
    return () => observer.disconnect();
  }, [surface, chat, view.companion?.intervention?.id, root]);
  useEffect(() => {
    if (!desktop || surface !== "mascot") return;
    let stopped = false;
    let off: (() => void) | undefined;
    const poses = new Map<string, AvatarState>();
    void listen<ChatPoseMessage>(CHAT_POSE_EVENT, ({ payload }) => {
      if (!payload || !["workspace", "panel"].includes(payload.source)) return;
      if (["listening", "thinking", "success"].includes(payload.state))
        poses.set(payload.source, payload.state);
      else if (payload.state === "idle") poses.delete(payload.source);
      else return;
      setPose(
        (["listening", "thinking", "success"].find((state) =>
          [...poses.values()].includes(state as AvatarState),
        ) as AvatarState | undefined) ?? null,
      );
    })
      .then((unlisten) => {
        if (stopped) unlisten();
        else off = unlisten;
      })
      .catch(() => {});
    return () => {
      stopped = true;
      off?.();
    };
  }, [surface, setPose]);
}

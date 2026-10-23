import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import type { AvatarState } from "../types";

export const CHAT_POSE_EVENT = "buddy://chat-pose";
export type ChatPoseMessage = {
  source: "workspace" | "panel";
  state: AvatarState;
};

/** One producer per chat surface; closing one must not clear another surface's work. */
export function useChatPose(source: ChatPoseMessage["source"], enabled = true) {
  const [state, setState] = useState<AvatarState>("idle");
  useEffect(() => {
    if (!desktop || !enabled) return;
    void emit(CHAT_POSE_EVENT, {
      source,
      state,
    } satisfies ChatPoseMessage).catch(() => {});
  }, [source, state, enabled]);
  useEffect(() => {
    if (!desktop || !enabled) return;
    return () => {
      void emit(CHAT_POSE_EVENT, {
        source,
        state: "idle",
      } satisfies ChatPoseMessage).catch(() => {});
    };
  }, [source, enabled]);
  useEffect(() => {
    if (state !== "success") return;
    const timer = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(timer);
  }, [state]);
  return [state, setState] as const;
}

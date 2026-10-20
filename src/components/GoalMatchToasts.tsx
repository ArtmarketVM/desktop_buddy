import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import { coreApi } from "../core/api";
import { toast } from "./Toasts";

interface GoalMatchSuggestion {
  goal_id: number;
  confidence: number;
  reason: string;
}

export function GoalMatchToasts({ onChanged }: { onChanged: () => Promise<void> }) {
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    let stop: (() => void) | undefined;
    const show = async (suggestion: GoalMatchSuggestion | null) => {
      if (!suggestion || !live) return;
      const snapshot = await coreApi.snapshot();
      const goal = snapshot.goals.find(
        (g) => g.id === suggestion.goal_id && g.status === "open",
      );
      if (!live || !goal) return;
      toast({
        key: "goal-match-suggestion",
        message: `Working on ${goal.title}?`,
        durationMs: 30000,
        actions: ([
          ["Yes", "yes"],
          ["No", "no"],
          ["Not now", "not_now"],
        ] as const).map(([label, action]) => ({
          label,
          run: async () => {
            await invoke("respond_goal_match_suggestion", {
              goalId: suggestion.goal_id,
              action,
            });
            // Focus has already been applied by the shared backend focus path.
            await onChanged().catch(() => {});
          },
        })),
      });
    };
    void listen<GoalMatchSuggestion>("goal_match_suggestion", (event) => {
      void show(event.payload).catch(() => {});
    }).then((unlisten) => {
      if (!live) { unlisten(); return; }
      stop = unlisten;
      // Recover an offer emitted while the workspace window was closed.
      void invoke<GoalMatchSuggestion | null>("get_goal_match_suggestion")
        .then(show).catch(() => {});
    }).catch(() => {});
    return () => { live = false; stop?.(); };
  }, [onChanged]);
  return null;
}

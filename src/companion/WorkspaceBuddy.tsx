import { api } from "../api/tauri";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "../components/Avatar";
import {
  defaultUserSettings,
  type AvatarState,
  type Dashboard,
  type Goal,
  type GoalPlan,
} from "../types";
import type { CoreGoal } from "../core/types";
import { Conversation } from "./Conversation";
import { defaultCompanionView } from "./types";
import { BuddyActionBar } from "./BuddyActionBar";
import { useBuddyActions } from "./useBuddyActions";
import { interventionState } from "./interventionPresentation";

export function WorkspaceBuddy({
  dashboard,
  onChanged,
  showLauncher = true,
}: {
  dashboard: Dashboard;
  onChanged: () => Promise<void>;
  showLauncher?: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "text" | "voice">("idle");
  const actions = useBuddyActions(mode !== "idle");
  const [state, setState] = useState<AvatarState>("idle");
  const [context, setContext] = useState<{ goal: Goal; plan: GoalPlan } | null>(
    null,
  );
  const root = useRef<HTMLDivElement>(null);
  const quietMode = !!(
    dashboard.status?.dnd || dashboard.buddy.companion?.quiet_mode
  );

  useEffect(() => {
    const ask = (event: Event) => {
      if (quietMode) {
        void api.openChat("ask");
        return;
      }
      const goal = (event as CustomEvent<CoreGoal>).detail;
      setContext({
        goal: { id: goal.id, text: goal.title, created_at: "" },
        plan: goal.plan,
      });
      setMode("text");
    };
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMode("idle");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMode("idle");
    };
    window.addEventListener("buddy:ask-goal", ask);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("buddy:ask-goal", ask);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [quietMode]);
  const appearance =
    dashboard.buddy.avatar ??
    dashboard.user_settings?.profile.avatar ??
    defaultUserSettings.profile.avatar;
  useEffect(() => {
    if (quietMode) {
      setMode("idle");
      setState("idle");
    }
  }, [quietMode]);
  if (!showLauncher && mode === "idle") return null;
  return (
    <div className="workspace-buddy" ref={root}>
      {!quietMode && mode !== "idle" && (
        <div className="workspace-buddy-input">
          {context && (
            <div className="compact-goal-context">
              {context.goal.text}
              <button
                className="text-button"
                aria-label="Clear goal context"
                onClick={() => setContext(null)}
              >
                <X size={12} />
              </button>
            </div>
          )}
          <Conversation
            view={dashboard.buddy.companion ?? defaultCompanionView}
            goal={context?.goal ?? dashboard.goal}
            plan={context?.plan ?? dashboard.goal_plan}
            compact
            mode={mode}
            onMode={setMode}
            onClose={() => setMode("idle")}
            onChanged={onChanged}
            onState={setState}
          />
        </div>
      )}
      {showLauncher && (
        <>
          <button
            {...actions.events}
            className="workspace-buddy-avatar"
            aria-label="Open sumi chat"
            onClick={() =>
              quietMode
                ? void api.openChat("ask")
                : setMode(mode === "idle" ? "text" : "idle")
            }
          >
            <Avatar
              appearance={{ ...appearance, visible: true }}
              state={
                quietMode
                  ? "sleeping"
                  : dashboard.buddy.companion?.intervention
                    ? interventionState(dashboard.buddy.companion.intervention)
                    : state
              }
            />
          </button>
          <BuddyActionBar
            color={appearance.color}
            actions={actions}
            onWrite={() =>
              quietMode ? void api.openChat("ask") : setMode("text")
            }
            onTalk={() =>
              quietMode ? void api.openChat("ask") : setMode("voice")
            }
          />
        </>
      )}
    </div>
  );
}

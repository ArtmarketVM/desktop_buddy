import { useEffect, useRef, useState } from "react";
import { Mic, SquarePen, X } from "lucide-react";
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

export function WorkspaceBuddy({
  dashboard,
  onChanged,
}: {
  dashboard: Dashboard;
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "text" | "voice">("idle");
  const [state, setState] = useState<AvatarState>("idle");
  const [context, setContext] = useState<{ goal: Goal; plan: GoalPlan } | null>(
    null,
  );
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ask = (event: Event) => {
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
  }, []);
  const appearance =
    dashboard.buddy.avatar ??
    dashboard.user_settings?.profile.avatar ??
    defaultUserSettings.profile.avatar;
  return (
    <div className="workspace-buddy" ref={root}>
      {mode !== "idle" && (
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
      <button
        className="workspace-buddy-avatar"
        aria-label="Open Buddy chat"
        onClick={() => setMode(mode === "idle" ? "text" : "idle")}
      >
        <Avatar appearance={{ ...appearance, visible: true }} state={state} />
      </button>
      <div className="buddy-action-bar" aria-label="Buddy actions">
        <button
          aria-label="Write to Buddy"
          title="Write to Buddy"
          onClick={() => setMode("text")}
        >
          <SquarePen size={17} />
        </button>
        <button
          aria-label="Talk to Buddy"
          title="Talk to Buddy"
          onClick={() => setMode("voice")}
        >
          <Mic size={17} />
        </button>
      </div>
    </div>
  );
}

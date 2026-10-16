import type { CSSProperties } from "react";
import { Mic, SquarePen } from "lucide-react";
import type { useBuddyActions } from "./useBuddyActions";

export function BuddyActionBar({
  color,
  actions,
  onWrite,
  onTalk,
}: {
  color: string;
  actions: ReturnType<typeof useBuddyActions>;
  onWrite: () => void;
  onTalk: () => void;
}) {
  return (
    <div
      className="buddy-action-bar"
      role="group"
      aria-label="sumi actions"
      data-collapsed={!actions.visible}
      style={{ "--buddy-control-color": color } as CSSProperties}
    >
      <div className="buddy-action-surface" {...actions.events}>
        <div
          className="buddy-action-buttons"
          aria-hidden={!actions.visible}
          inert={!actions.visible}
        >
          <button
            aria-label="Write to sumi"
            title="Write to sumi"
            onClick={onWrite}
          >
            <SquarePen size={15} aria-hidden="true" />
          </button>
          <button
            aria-label="Talk to sumi"
            title="Talk to sumi"
            onClick={onTalk}
          >
            <Mic size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

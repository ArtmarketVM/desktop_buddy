import type { AvatarState } from "../types";
import type { Intervention } from "./types";

/** Pose follows the purpose of a message, rather than its punctuation. */
export function interventionState(prompt: Intervention): AvatarState {
  switch (prompt.kind) {
    case "movement":
      return "stretching";
    case "end_of_day":
    case "automatic_completion":
      return "success";
    case "completion":
    case "goal_completion":
    case "goal_match":
    case "new_task":
    case "unplanned_work":
    case "unplanned_completed":
      return "attention";
    default:
      return "idle";
  }
}

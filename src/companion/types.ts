import type { SearchResult } from "../types";
export interface CompanionPreferences {
  paused: boolean;
  daily_checkins: boolean;
  screen_task_detection: boolean;
  hide_fullscreen: boolean;
  morning_delay_minutes: number;
  cooldown_minutes: number;
  quiet_start_minute: number;
  quiet_end_minute: number;
  movement_reminder: boolean;
}
export const defaultCompanionPreferences: CompanionPreferences = {
  paused: false,
  daily_checkins: true,
  screen_task_detection: false,
  hide_fullscreen: true,
  morning_delay_minutes: 10,
  cooldown_minutes: 60,
  quiet_start_minute: 1140,
  quiet_end_minute: 540,
  movement_reminder: false,
};
export interface Intervention {
  id: string;
  kind:
    | "new_task"
    | "completion"
    | "no_goals"
    | "midday"
    | "end_of_day"
    | "movement";
  text: string;
  confidence: number;
  goal_id: number | null;
  plan_revision: number | null;
  step_id: string | null;
  expires_at: number;
}
export interface InboxTask {
  id: string;
  text: string;
  done: boolean;
}
export interface CompanionView {
  preferences: CompanionPreferences;
  chat_open: boolean;
  intent: "ask" | "task" | "research" | "selection";
  seed: string;
  intervention: Intervention | null;
  inbox: InboxTask[];
  activity: {
    type: "activity";
    app: string;
    window_title: string;
    timestamp: string;
    context: string;
    confidence: number;
    idle: boolean;
    fullscreen: boolean;
    meeting: boolean;
    simulated: boolean;
  } | null;
  notice: string | null;
  shortcut_available: boolean;
  state: "idle" | "sleeping" | "attention";
}
export const defaultCompanionView: CompanionView = {
  preferences: defaultCompanionPreferences,
  chat_open: false,
  intent: "ask",
  seed: "",
  intervention: null,
  inbox: [],
  activity: null,
  notice: null,
  shortcut_available: false,
  state: "idle",
};
export interface CompanionReply {
  message: string;
  resources: SearchResult[];
}
export type CompanionAction = "task" | "ask" | "research" | "explain" | "save";
export interface BuddyEvent {
  type:
    | "task.detected"
    | "task.completion_suspected"
    | "task.created"
    | "task.completed"
    | "activity"
    | "activity.started"
    | "activity.stopped"
    | "intervention.requested"
    | "goal.active"
    | "goal.created"
    | "goal.completed"
    | "goal.deferred"
    | "settings.updated";
  timestamp: string;
  payload: unknown;
}

import type { SearchResult } from "../types";
export interface CompanionPreferences {
  paused: boolean;
  daily_checkins: boolean;
  summary_minute?: number;
  quiet_hours_enabled?: boolean;
  quiet_days?: number[];
  screen_task_detection: boolean;
  use_screenshots: boolean;
  automatic_completion: boolean;
  hide_fullscreen: boolean;
  morning_delay_minutes: number;
  cooldown_minutes: number;
  quiet_start_minute: number;
  quiet_end_minute: number;
  movement_reminder: boolean;
  deadline_reminders: boolean;
}
export const defaultCompanionPreferences: CompanionPreferences = {
  paused: false,
  daily_checkins: true,
  summary_minute: 1080,
  quiet_hours_enabled: false,
  quiet_days: [],
  screen_task_detection: true,
  use_screenshots: true,
  automatic_completion: true,
  hide_fullscreen: true,
  morning_delay_minutes: 10,
  cooldown_minutes: 60,
  quiet_start_minute: 1140,
  quiet_end_minute: 540,
  movement_reminder: true,
  deadline_reminders: true,
};
export interface Intervention {
  id: string;
  kind:
    | "onboarding_completion"
    | "automatic_completion"
    | "unplanned_work"
    | "unplanned_completed"
    | "new_task"
    | "new_goal"
    | "completion"
    | "goal_match"
    | "goal_completion"
    | "no_goals"
    | "midday"
    | "research"
    | "end_of_day"
    | "movement"
    | "deadline";
  text: string;
  confidence: number;
  goal_id: number | null;
  plan_revision: number | null;
  step_id: string | null;
  expires_at: number;
}
interface InboxTask {
  id: string;
  text: string;
  done: boolean;
}
export interface CompanionView {
  progress_status?: string;
  preferences: CompanionPreferences;
  chat_open: boolean;
  quiet_mode?: boolean;
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
  quiet_mode: false,
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
export type InterventionResponse =
  | "no"
  | "on_it"
  | "chat"
  | "accept"
  | "ignore"
  | "skip_today"
  | "tomorrow"
  | "summary"
  | "today"
  | "start"
  | "reschedule";

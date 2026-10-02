import type { GoalPlan } from "../types";
export interface GoalDraft {
  title: string;
  area: string;
  steps: string[];
}
export interface CoreGoal {
  id: number;
  title: string;
  status: "open" | "deferred" | "completed";
  area_id: number;
  plan: GoalPlan;
  focused_seconds: number;
}
export interface CorePreferences {
  working_days: number[];
  movement_reminders: boolean;
  vision_model: string;
}
export interface GoalTime {
  goal_id: number;
  title: string;
  area: string;
  seconds: number;
}
export interface DayProgress {
  day: string;
  completed: string[];
  goals: GoalTime[];
}
export interface CoreSnapshot {
  date: string;
  day_mode: "unset" | "plan" | "no_plan";
  today: number[];
  areas: { id: number; title: string }[];
  goals: CoreGoal[];
  summary: DayProgress;
  week: DayProgress[];
  timer: { goal_id: number; last_tick: string } | null;
  focused_goal_id: number | null;
  preferences: CorePreferences;
}
export interface ImageInput {
  mime: string;
  data: string;
}
export interface ImportProposal {
  reply: string;
  drafts: GoalDraft[];
}
export const emptyCore = (): CoreSnapshot => ({
  date: new Date().toLocaleDateString("en-CA"),
  day_mode: "unset",
  today: [],
  areas: [],
  goals: [],
  summary: { day: "", completed: [], goals: [] },
  week: [],
  timer: null,
  focused_goal_id: null,
  preferences: {
    working_days: [1, 2, 3, 4, 5],
    movement_reminders: false,
    vision_model: "",
  },
});
export function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : minutes > 0
      ? `${minutes}m`
      : `${Math.floor(seconds)}s`;
}
export function dateLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
export function shiftDate(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

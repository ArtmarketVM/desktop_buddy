export interface Goal {
  id: number;
  text: string;
  created_at: string;
}
export interface GoalStep {
  id: string;
  text: string;
  done: boolean;
}
export interface GoalPlan {
  goal_id: number;
  revision: number;
  done_when: string;
  steps: GoalStep[];
  current_step: string | null;
}
export interface GoalProposal {
  title: string;
  done_when: string;
  steps: string[];
}
export interface SavedGoal {
  id: number;
  text: string;
  status: "deferred" | "completed";
}
export interface ActivitySnapshot {
  timestamp: string;
  process_name: string;
  window_title: string;
  idle_seconds: number;
  active_seconds: number;
}
export interface Decision {
  id?: number;
  state: "focused" | "drifting" | "stuck";
  confidence: number;
  reason: string;
  action: "intervene" | "wait" | "offer_help";
}
export interface SearchResult {
  title: string;
  url: string;
  content: string;
}
export interface Status {
  tracking: boolean;
  ai_enabled: boolean;
  dnd: boolean;
  demo: boolean;
  mock_ai: boolean;
  nebius_configured: boolean;
  tavily_configured: boolean;
}
export interface Dashboard {
  app_rules: AppRule[];
  today: Today;
  goal_plan: GoalPlan | null;
  saved_goals: SavedGoal[];
  retention_days: number;
  recommendations: Recommendation[];
  version: string;
  buddy: BuddyView;
  goal: Goal | null;
  activity: ActivitySnapshot[];
  decision: Decision | null;
  status: Status;
  last_error?: string | null;
}
export interface BuddyPreferences {
  local_nudges: boolean;
  daily_nudge_limit: number;
  nudge_interval_minutes: number;
  suggestions_only: boolean;
  proactive: boolean;
  interval_minutes: number;
  suppress_fullscreen: boolean;
  suppress_meetings: boolean;
  wait_for_input_pause: boolean;
  excluded_apps: string[];
}
export const defaultBuddyPreferences: BuddyPreferences = {
  local_nudges: false,
  daily_nudge_limit: 8,
  nudge_interval_minutes: 15,
  suggestions_only: true,
  proactive: false,
  interval_minutes: 15,
  suppress_fullscreen: true,
  suppress_meetings: true,
  wait_for_input_pause: true,
  excluded_apps: [],
};
export interface BuddyView {
  preferences: BuddyPreferences;
  suggestion: { id: number; title: string; url: string; reason: string } | null;
  decision: Decision | null;
  snoozed_until: number | null;
  quiet_reason: string | null;
}
export interface Recommendation {
  id: number;
  goal_id: number;
  goal: string;
  title: string;
  url: string;
  reason: string;
  created_at: string;
  feedback: boolean | null;
}
export type AppCategory = "work" | "distraction" | "neutral";
export interface AppRule {
  process_name: string;
  category: AppCategory;
}
export interface Today {
  date: string;
  apps: { process_name: string; seconds: number; goal_seconds: number }[];
  nudges: number;
}

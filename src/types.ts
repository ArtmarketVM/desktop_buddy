export interface Goal {
  id: number;
  text: string;
  created_at: string;
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
  version: string;
  buddy: BuddyView;
  goal: Goal | null;
  activity: ActivitySnapshot[];
  decision: Decision | null;
  status: Status;
  last_error?: string | null;
}
export interface BuddyPreferences {
  suggestions_only: boolean;
  proactive: boolean;
}
export interface BuddyView {
  preferences: BuddyPreferences;
  suggestion: { title: string; url: string; reason: string } | null;
  decision: Decision | null;
}

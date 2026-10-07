import { invoke } from "@tauri-apps/api/core";
import type {
  GoalAnalysisInput,
  GoalAnalysisResult,
  GoalEnhancement,
} from "../core/analysis";
export interface AiPreferences {
  enabled: boolean;
  share_goal_context: boolean;
  web_research: boolean;
  automatic_goal_matching: boolean;
}
export const defaultAiPreferences: AiPreferences = {
  enabled: true,
  share_goal_context: true,
  web_research: true,
  automatic_goal_matching: false,
};
export interface ChatResource {
  title: string;
  url: string;
  whyRelevant: string;
}
export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  created_at: string;
  goal_id: number | null;
  resources: ChatResource[];
}
export interface CoachingInsight {
  observed_active_minutes: number;
  relevant_active_minutes: number;
  user_expected_minutes: number | null;
  over_expected: boolean;
  measurement_note: string;
}
export interface ActivitySegment {
  goalId: string;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  state: string;
  activityMatch: { goalId: string | null; confidence: number; reason?: string };
}
export const aiApi = {
  preferences: () => invoke<AiPreferences>("get_ai_preferences"),
  savePreferences: (preferences: AiPreferences) =>
    invoke<void>("set_ai_preferences", { preferences }),
  analyze: (input: GoalAnalysisInput, researchRequested: boolean) =>
    invoke<GoalAnalysisResult>("analyze_core_goal", {
      input,
      researchRequested,
    }),
  history: () => invoke<ChatMessage[]>("get_buddy_chat_history"),
  clearHistory: () => invoke<void>("clear_buddy_chat", { confirmed: true }),
  send: (
    text: string,
    attachmentText: string | null,
    goalId: number | null = null,
  ) =>
    invoke<{ message: string; resources: ChatResource[] }>(
      "send_buddy_message",
      { text, attachmentText, goalId },
    ),
  resourceOpened: (goalId: number | null, url: string) =>
    invoke<void>("record_resource_view", { goalId, url }),
  expectedMinutes: (goalId: number, minutes: number | null) =>
    invoke<void>("set_goal_expected_minutes", { goalId, minutes }),
  coaching: (goalId: number) =>
    invoke<CoachingInsight>("get_buddy_coaching", { goalId }),
  segments: (goalId: number | null = null) =>
    invoke<ActivitySegment[]>("get_activity_segments", { goalId }),
};
export const goalEnhancement: GoalEnhancement = {
  onImprove: (input) => aiApi.analyze(input, false),
  onResearch: (input) => aiApi.analyze(input, true),
};

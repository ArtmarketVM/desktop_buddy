import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  CompanionPreferences,
  CompanionView,
  CompanionReply,
  CompanionAction,
} from "../companion/types";
import type {
  BuddyPreferences,
  Dashboard,
  Decision,
  SearchResult,
  GoalPlan,
  GoalProposal,
  AppCategory,
  TrackingSettings,
  GoalHistory,
  UserProfile,
  UserSettings,
  OnboardingState,
  ProductFeedback,
  InstalledApp,
} from "../types";
export const desktop = isTauri();
export const api = {
  companionView: () => invoke<CompanionView>("get_companion_view"),
  companionGoalContext: () => invoke<unknown>("get_companion_goal_context"),
  companionPreferences: (preferences: CompanionPreferences) =>
    invoke<void>("set_companion_preferences", { preferences }),
  openChat: (intent: "ask" | "task" | "research" | "selection" = "ask") =>
    invoke<void>("open_companion_chat", { intent }),
  closeChat: () => invoke<void>("close_companion_chat"),
  companionMenu: () => invoke<void>("open_companion_context"),
  voiceInput: () => invoke<void>("companion_voice_input"),
  companionSubmit: (
    text: string,
    action: CompanionAction,
    goalId: number | null,
    revision: number | null,
  ) =>
    invoke<CompanionReply>("companion_submit", {
      text,
      action,
      goalId,
      revision,
    }),
  companionRespond: (
    id: string,
    action: "accept" | "ignore" | "tomorrow" | "summary",
  ) => invoke<void>("respond_companion_intervention", { id, action }),
  companionInbox: (id: string, action: "complete" | "remove") =>
    invoke<void>("update_companion_inbox", { id, action }),
  theme: (theme: "light" | "dark") => invoke<void>("set_user_theme", { theme }),
  resetProfile: () => invoke<void>("reset_local_profile"),
  installedApps: () => invoke<InstalledApp[]>("get_installed_apps"),
  showBuddy: (visible: boolean) =>
    invoke<void>("show_desktop_buddy", { visible }),
  feedbackDraft: (message: string, replyEmail: string) =>
    invoke<void>("open_feedback_draft", { message, replyEmail }),
  contactEndpoint: () => invoke<string | null>("get_contact_endpoint"),
  saveContactEndpoint: (url: string) =>
    invoke<void>("set_contact_endpoint", { url }),
  sendContactFeedback: (message: string, replyEmail: string) =>
    invoke<void>("send_contact_feedback", { message, replyEmail }),
  subscribeEmail: (consent: boolean) =>
    invoke<void>("subscribe_contact_email", { consent }),
  shareRoleProfile: (profile: UserProfile, consent: boolean) =>
    invoke<void>("share_role_profile", { profile, consent }),
  saveOnboarding: (profile: UserProfile, draft: OnboardingState) =>
    invoke<UserSettings>("save_onboarding", { profile, draft }),
  onboardingGoal: (text: string) => invoke("create_onboarding_goal", { text }),
  finishOnboarding: (allowTracking: boolean) =>
    invoke<void>("finish_onboarding", { allowTracking }),
  saveUserProfile: (profile: UserProfile, autostart: boolean) =>
    invoke<void>("save_user_profile", { profile, autostart }),
  productFeedback: (feedback: ProductFeedback) =>
    invoke<void>("save_product_feedback", { feedback }),
  trackingSettings: () => invoke<TrackingSettings>("get_tracking_settings"),
  saveTrackingSettings: (settings: TrackingSettings) =>
    invoke<void>("set_tracking_settings", { settings }),
  goalHistory: (goalId: number | null = null) =>
    invoke<GoalHistory[]>("get_goal_history", { goalId }),
  appRule: (
    goalId: number,
    processName: string,
    category: AppCategory | null,
  ) => invoke<void>("set_app_rule", { goalId, processName, category }),
  saveGoalPlan: (title: string, plan: GoalPlan) =>
    invoke<void>("save_goal_plan", { title, plan }),
  transitionGoal: (
    id: number,
    action: "complete" | "defer" | "resume",
    confirmed = false,
  ) => invoke<void>("transition_goal", { id, action, confirmed }),
  refineGoal: (id: number, revision: number) =>
    invoke<GoalProposal>("refine_goal", { id, revision }),
  snooze: (enabled: boolean) => invoke<void>("snooze_buddy", { enabled }),
  rateRecommendation: (id: number, helpful: boolean | null) =>
    invoke<void>("rate_recommendation", { id, helpful }),
  privacyPreview: () => invoke<unknown>("get_privacy_preview"),
  retention: (days: number) => invoke<void>("set_retention", { days }),
  clearHistory: () => invoke<void>("clear_local_history", { confirmed: true }),
  testConnection: (provider: "nebius" | "tavily") =>
    invoke<string>("test_provider_connection", { provider }),
  quit: () => invoke<void>("quit_app"),
  buddyPreferences: (preferences: BuddyPreferences) =>
    invoke<void>("set_buddy_preferences", { preferences }),
  openWorkspace: () => invoke<void>("open_workspace"),
  providerKey: (provider: "nebius" | "tavily", key: string | null) =>
    invoke<void>("set_provider_key", { provider, key }),
  dashboard: () => invoke<Dashboard>("get_dashboard"),
  setGoal: (text: string) => invoke("set_goal", { text }),
  tracking: (enabled: boolean) => invoke("set_tracking", { enabled }),
  ai: (enabled: boolean) => invoke("set_ai_enabled", { enabled }),
  dnd: (enabled: boolean) => invoke("set_dnd", { enabled }),
  analyze: () => invoke<Decision>("analyze_focus"),
  search: (query: string) => invoke<SearchResult[]>("search_web", { query }),
  feedback: (decisionId: number, related: boolean) =>
    invoke("save_feedback", { decisionId, related }),
  dismiss: () => invoke("dismiss_buddy"),
};
export function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

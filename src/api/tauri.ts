import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  BuddyPreferences,
  Dashboard,
  Decision,
  SearchResult,
} from "../types";
export const desktop = isTauri();
export const api = {
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

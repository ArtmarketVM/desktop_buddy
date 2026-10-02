import { invoke } from "@tauri-apps/api/core";
import type { GoalPlan, AvatarPreferences } from "../types";
import type {
  CoreSnapshot,
  CorePreferences,
  GoalDraft,
  ImageInput,
  ImportProposal,
} from "./types";
export const coreApi = {
  snapshot: (anchor: string | null = null) =>
    invoke<CoreSnapshot>("get_core_snapshot", { anchor }),
  add: (drafts: GoalDraft[], batch: string = crypto.randomUUID()) =>
    invoke<CoreSnapshot>("add_core_goals", { drafts, batch }),
  save: (title: string, area: string, plan: GoalPlan) =>
    invoke<CoreSnapshot>("save_core_goal", { title, area, plan }),
  transition: (id: number, action: string, confirmed = false) =>
    invoke<CoreSnapshot>("transition_core_goal", { id, action, confirmed }),
  today: (id: number, include: boolean) =>
    invoke<CoreSnapshot>("set_core_today", { id, include }),
  planDay: (noPlan: boolean) =>
    invoke<CoreSnapshot>("plan_core_day", { noPlan }),
  timer: (id: number | null) => invoke<CoreSnapshot>("set_core_timer", { id }),
  tick: () => invoke<CoreSnapshot>("tick_core_timer"),
  preferences: (preferences: CorePreferences) =>
    invoke<void>("set_core_preferences", { preferences }),
  propose: (text: string, images: ImageInput[], confirmed: boolean) =>
    invoke<ImportProposal>("propose_core_import", { text, images, confirmed }),
  transcribe: (audio: Uint8Array) =>
    invoke<string>("transcribe_core_voice", { audio: Array.from(audio) }),
  setup: (
    name: string,
    drafts: GoalDraft[],
    allowTracking: boolean,
    batch: string,
  ) =>
    invoke<void>("finish_core_setup", { name, drafts, allowTracking, batch }),
  identity: (
    name: string,
    autostart: boolean,
    avatar: AvatarPreferences | null = null,
  ) => invoke<void>("save_core_identity", { name, autostart, avatar }),
};

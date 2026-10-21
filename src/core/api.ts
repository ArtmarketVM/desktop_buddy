import { invoke } from "../data/ipc";
import type { GoalPlan, AvatarPreferences } from "../types";
import type {
  CoreSnapshot,
  CorePreferences,
  ProgressPeriod,
  GoalDraft,
  ImageInput,
  ImportProposal,
  GoalDetails,
} from "./types";
export const coreApi = {
  retryAnalysis: (id: number) =>
    invoke<void>("retry_core_goal_analysis", { id }),
  focus: (id: number) => invoke<void>("select_core_goal", { id }),
  drafts: () => invoke<Array<{ id: string; text: string }>>("get_core_drafts"),
  resolveDraft: (id: string, title: string | null) =>
    invoke<void>("resolve_core_draft", { id, title }),
  create: (title: string, batch: string = crypto.randomUUID()) =>
    invoke<CoreSnapshot>("create_core_goal", { title, batch }),
  snapshot: (anchor: string | null = null, period: ProgressPeriod = "week") =>
    invoke<CoreSnapshot>("get_core_snapshot", { anchor, period }),
  add: (drafts: GoalDraft[], batch: string = crypto.randomUUID()) =>
    invoke<CoreSnapshot>("add_core_goals", { drafts, batch }),
  save: (
    title: string,
    area: string,
    plan: GoalPlan,
    details: GoalDetails | null = null,
  ) => invoke<CoreSnapshot>("save_core_goal", { title, area, plan, details }),
  priority: (id: number, priority: GoalDetails["priority"]) =>
    invoke<CoreSnapshot>("set_core_goal_priority", { id, priority }),
  deleteGoal: (id: number) => invoke<number>("delete_core_goal", { id }),
  restoreGoal: (backupId: number) =>
    invoke<CoreSnapshot>("restore_core_goal", { backupId }),
  estimate: (id: number, minutes: number | null) =>
    invoke<CoreSnapshot>("set_core_goal_estimate", { id, minutes }),
  dismissCarryover: (id: number) =>
    invoke<CoreSnapshot>("dismiss_core_carryover", { id }),
  transition: (id: number, action: string, confirmed = false) =>
    invoke<CoreSnapshot>("transition_core_goal", { id, action, confirmed }),
  today: (id: number, include: boolean) =>
    invoke<CoreSnapshot>("set_core_today", { id, include }),
  reorder: (ids: number[]) =>
    invoke<CoreSnapshot>("reorder_core_goals", { ids }),
  planDay: (noPlan: boolean) =>
    invoke<CoreSnapshot>("plan_core_day", { noPlan }),
  planGoals: (ids: number[], date?: string) =>
    invoke<CoreSnapshot>("plan_core_goals", { ids, date: date ?? null }),
  timer: (id: number | null) => invoke<CoreSnapshot>("set_core_timer", { id }),
  tick: () => invoke<CoreSnapshot>("tick_core_timer"),
  preferences: (preferences: CorePreferences) =>
    invoke<void>("set_core_preferences", { preferences }),
  propose: (text: string, images: ImageInput[], confirmed: boolean) =>
    invoke<ImportProposal>("propose_core_import", { text, images, confirmed }),
  voiceLanguages: () => invoke<string[]>("get_local_voice_languages"),
  transcribe: (audio: Uint8Array, language = "auto") =>
    invoke<string>("transcribe_core_voice", {
      audio: Array.from(audio),
      language,
    }),
  setup: (
    name: string,
    drafts: GoalDraft[],
    allowTracking: boolean,
    batch: string,
    email: string | null = null,
    avatar: AvatarPreferences | null = null,
  ) =>
    invoke<void>("finish_core_setup", {
      name,
      drafts,
      allowTracking,
      batch,
      email,
      avatar,
    }),
  identity: (
    name: string,
    autostart: boolean,
    avatar: AvatarPreferences | null = null,
    email: string | null = null,
  ) => invoke<void>("save_core_identity", { name, autostart, avatar, email }),
};

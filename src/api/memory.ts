import { invoke } from "@tauri-apps/api/core";
export type MemoryControls = {
  enabled: boolean;
  remember_work_context: boolean;
  remember_preferences: boolean;
  learn_from_feedback: boolean;
  remember_conversation_context: boolean;
};
export const defaultMemoryControls: MemoryControls = {
  enabled: true,
  remember_work_context: true,
  remember_preferences: true,
  learn_from_feedback: true,
  remember_conversation_context: true,
};
export type MemoryItem = {
  id: number;
  memory_type:
    | "explicit_fact"
    | "explicit_preference"
    | "inferred_preference"
    | "behavioral_pattern"
    | "episodic";
  scope: {
    scope_type: "global" | "goal" | "conversation";
    scope_id: number | null;
  };
  content: string;
  event_kind: string | null;
  updated_at: string;
  pinned: boolean;
  archived: boolean;
  confidence: number;
  evidence_count: number;
  source: string;
};
type ResearchAttachment = {
  research_id: number;
  step_id: string | null;
  summary: string;
  next_action: string;
  sources: { title: string; url: string; content: string }[];
};
export type WorkContext = {
  research?: ResearchAttachment[];
  id: number;
  goal_id: number;
  step_id: string | null;
  summary: string;
  next_action: string | null;
  status: "active" | "paused" | "waiting" | "completed";
  last_app: string | null;
  last_window: string | null;
  waiting_for: string | null;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  last_result?: string | null;
  parked_at?: string | null;
  resumed_at?: string | null;
};
export type MemoryOverview = {
  controls: MemoryControls;
  memories: MemoryItem[];
  contexts: WorkContext[];
  goals: { id: number; title: string }[];
  proposals: { id: number; content: string; created_at: string }[];
  more: boolean;
};
export const memoryApi = {
  overview: (offset = 0) =>
    invoke<MemoryOverview>("get_memory_overview", { offset }),
  controls: (controls: MemoryControls) =>
    invoke<void>("set_memory_controls", { controls }),
  edit: (item: MemoryItem, content: string) =>
    invoke<MemoryItem>("update_memory", {
      id: item.id,
      input: { content, expected_updated_at: item.updated_at },
      confirmed: true,
    }),
  forget: (id: number) =>
    invoke<void>("forget_memory", { id, confirmed: true }),
  pin: (id: number, pinned: boolean) =>
    invoke<void>("pin_memory", { id, pinned }),
  clearGoal: (id: number) =>
    invoke<void>("clear_memory_scope", {
      scope: { scope_type: "goal", scope_id: id },
      confirmed: true,
    }),
  clear: () => invoke<void>("clear_personal_memory", { confirmed: true }),
  editContext: (
    context: WorkContext,
    summary: string,
    nextAction: string,
    waitingFor: string,
  ) => {
    const {
      id: _id,
      created_at: _created,
      updated_at,
      pinned: _pinned,
      last_result: _result,
      parked_at: _parked,
      resumed_at: _resumed,
      ...input
    } = context;
    return invoke<WorkContext>("save_work_context", {
      input: {
        ...input,
        summary,
        next_action: nextAction.trim() || null,
        waiting_for: waitingFor.trim() || null,
      },
      expectedUpdatedAt: updated_at,
      confirmed: true,
    });
  },
  forgetContext: (goalId: number) =>
    invoke<void>("forget_work_context", { goalId, confirmed: true }),
  pinContext: (goalId: number, pinned: boolean) =>
    invoke<void>("pin_work_context", { goalId, pinned }),
  resolveProposal: (id: number, accept: boolean) =>
    invoke<void>("resolve_memory_proposal", { id, accept, confirmed: true }),
  debug: () => invoke<unknown>("get_memory_retrieval_debug"),
};

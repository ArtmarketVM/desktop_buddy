import { invoke } from "../data/ipc";

export interface CoachingTarget {
  goal_id: number;
  title: string;
  step_id: string | null;
  step_title: string | null;
  revision: number;
}
export interface CoachingSession {
  id: number;
  conversation_id: number;
  goal_id: number;
  step_id: string | null;
  revision: number;
  status:
    "active" | "paused" | "completed" | "declined" | "blocked" | "invalidated";
  step: string;
  data: {
    action: { title: string; estimated_seconds: number } | null;
    anchor: string | null;
    revision_count: number;
    attempt_count: number;
  };
}
export interface CoachingView {
  session: CoachingSession;
  target: CoachingTarget | null;
  fresh: boolean;
  can_remember: boolean;
  chat_bound: boolean;
}
export type CoachingReply =
  | { type: "ready"; ready: boolean }
  | { type: "barrier"; barrier: string }
  | { type: "ease"; score: number }
  | { type: "anchor"; anchor: string | null }
  | { type: "commit"; accepted: boolean }
  | { type: "report"; completed: boolean; remember: boolean };
export type CoachingControl =
  | { type: "reply"; reply: CoachingReply }
  | { type: "pause" | "resume" | "stop" };
export const coachingApi = {
  prepare: (goalId: number, stepId: string | null = null) =>
    invoke<{ target: CoachingTarget; conversation_id: number }>(
      "prepare_coaching",
      { goalId, stepId },
    ),
  start: (
    entry: { target: CoachingTarget; conversation_id: number },
    requestId: string,
  ) =>
    invoke<CoachingView>("start_coaching_session", {
      input: {
        request_id: requestId,
        goal_id: entry.target.goal_id,
        step_id: entry.target.step_id,
        conversation_id: entry.conversation_id,
        expected_target_revision: entry.target.revision,
        strategy_id: "tiny_habits",
        strategy_version: 1,
      },
    }),
  inspect: (conversationId?: number) =>
    invoke<CoachingView | null>("get_coaching_session", {
      conversationId: conversationId ?? null,
    }),
  reply: (
    session: CoachingSession,
    control: CoachingControl,
    requestId: string,
  ) =>
    invoke<CoachingView>("reply_coaching_session", {
      sessionId: session.id,
      conversationId: session.conversation_id,
      expectedRevision: session.revision,
      requestId,
      control,
    }),
  propose: (session: CoachingSession, requestId: string) =>
    invoke<CoachingView>("propose_coaching_action", {
      sessionId: session.id,
      conversationId: session.conversation_id,
      expectedRevision: session.revision,
      requestId,
    }),
};

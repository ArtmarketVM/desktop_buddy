import { queryClient } from "./client";
import { coreApi } from "../core/api";
import { emptyCore, type ProgressPeriod } from "../core/types";
import {
  aiApi,
  defaultAiPreferences,
  type ChatMessage,
  type ChatConversation,
} from "../ai/api";
import { serviceStatusApi, type ServiceSnapshot } from "../ai/serviceStatus";
import { coachingApi, type CoachingView } from "../coaching/api";
import { invoke } from "./ipc";
import type { ActivityReviewData } from "../core/activityReviewTypes";
export const activityReviewQuery = queryClient.query(
  "activity-review",
  ["activity", "workspace"],
  {
    pending_seconds: 0,
    pending_summary_count: 0,
    blocks: [],
    summaries: [],
  } as ActivityReviewData,
  () => invoke<ActivityReviewData>("get_activity_review"),
  15_000,
);
export const workspaceQuery = (anchor: string | null, period: ProgressPeriod) =>
  queryClient.query(
    `workspace:${JSON.stringify([anchor, period])}`,
    ["workspace"],
    emptyCore(),
    () => coreApi.snapshot(anchor, period),
    15_000,
  );
export const draftsQuery = queryClient.query(
  "drafts",
  ["drafts"],
  [] as Array<{ id: string; text: string }>,
  () => coreApi.drafts(),
);
export const preferencesQuery = queryClient.query(
  "ai-preferences",
  ["preferences"],
  defaultAiPreferences,
  () => aiApi.preferences(),
);
export const conversationsQuery = queryClient.query(
  "conversations",
  ["chats"],
  [] as ChatConversation[],
  () => aiApi.conversations(),
);
export const chatHistoryQuery = (conversationId?: number) =>
  queryClient.query(
    `chat-history:${conversationId ?? "current"}`,
    [
      "chats",
      ...(conversationId === undefined ? ["current-chat" as const] : []),
    ],
    [] as ChatMessage[],
    () => aiApi.history(conversationId),
  );
export const coachingQuery = (conversationId?: number) =>
  queryClient.query(
    `coaching:${conversationId ?? "current"}`,
    ["coaching"],
    null as CoachingView | null,
    () => coachingApi.inspect(conversationId),
  );
export const servicesQuery = queryClient.query(
  "services",
  ["services"],
  null as ServiceSnapshot | null,
  () => serviceStatusApi.read(),
);
export type NoticedSuggestion = {
  completed?: boolean;
  id: string;
  title: string;
  seconds: number;
  app: string;
};
export const noticedQuery = queryClient.query(
  "noticed-work",
  ["noticed"],
  null as NoticedSuggestion | null,
  () => invoke<NoticedSuggestion | null>("get_unplanned_work_suggestion"),
  5000,
);

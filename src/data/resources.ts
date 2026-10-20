import { queryClient } from "./client";
import { coreApi } from "../core/api";
import { emptyCore, type ProgressPeriod } from "../core/types";
import { aiApi, defaultAiPreferences, type ChatMessage, type ChatConversation, type ActivitySegment } from "../ai/api";
import { serviceStatusApi, type ServiceSnapshot } from "../ai/serviceStatus";
import { coachingApi, type CoachingView } from "../coaching/api";
import { invoke } from "./ipc";
export const workspaceQuery = (anchor: string | null, period: ProgressPeriod) =>
  queryClient.query(`workspace:${JSON.stringify([anchor, period])}`, ["workspace"], emptyCore(), () => coreApi.snapshot(anchor, period), 15_000);
export const draftsQuery = queryClient.query("drafts", ["drafts"], [] as Array<{ id: string; text: string }>, () => coreApi.drafts());
export const preferencesQuery = queryClient.query("ai-preferences", ["preferences"], defaultAiPreferences, () => aiApi.preferences());
export const conversationsQuery = queryClient.query("conversations", ["chats"], [] as ChatConversation[], () => aiApi.conversations());
// The backend history command is scoped to its current conversation, not an id.
// Selection clears this entry and both webviews refetch on the chat event.
export const chatHistoryQuery = queryClient.query("current-chat-history", ["chats"], [] as ChatMessage[], () => aiApi.history());
export const coachingQuery = (conversationId?: number) => queryClient.query(`coaching:${conversationId ?? "current"}`, ["coaching"], null as CoachingView | null, () => coachingApi.inspect(conversationId));
export const servicesQuery = queryClient.query("services", ["services"], null as ServiceSnapshot | null, () => serviceStatusApi.read());
export const segmentsQuery = (goalId: number | null = null) => queryClient.query(`segments:${goalId ?? "all"}`, ["activity"], [] as ActivitySegment[], () => aiApi.segments(goalId), 15_000);
export type NoticedSuggestion = { id: string; title: string; seconds: number; app: string };
export const noticedQuery = queryClient.query("noticed-work", ["noticed"], null as NoticedSuggestion | null, () => invoke<NoticedSuggestion | null>("get_unplanned_work_suggestion"), 15_000);

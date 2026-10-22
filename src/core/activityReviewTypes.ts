export interface ActivityBlock {
  key: string;
  period_id: number;
  day: string;
  started_at: string;
  ended_at: string;
  seconds: number;
  apps: string;
  title: string;
  description: string;
  proposed_title: string;
  reason: string;
  status: "pending" | "assigned" | "outside";
  goal_id: number | null;
  goal_title: string | null;
  evidence_ids: number[];
  finalized: boolean;
}
export interface ActivitySummary {
  period_id: number;
  day: string;
  saved_at: string;
  blocks: ActivityBlock[];
  results: string[];
}
export interface ActivityReviewData {
  pending_seconds: number;
  pending_summary_count: number;
  blocks: ActivityBlock[];
  summaries: ActivitySummary[];
}

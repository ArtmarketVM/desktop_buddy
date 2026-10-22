import { useState } from "react";
import { desktop } from "../api/tauri";
import { invoke } from "../data/ipc";
import { activityReviewQuery } from "../data/resources";
import { useQuery } from "../data/useQuery";
import { queryClient } from "../data/client";
import { duration, type CoreGoal } from "./types";
import type { ActivityBlock, ActivitySummary } from "./activityReviewTypes";
import { Pager, usePage } from "./Pager";

function ReviewBlock({
  block,
  goals,
  onChanged,
}: {
  block: ActivityBlock;
  goals: CoreGoal[];
  onChanged: () => Promise<void>;
}) {
  const [goal, setGoal] = useState(
    goals.some((g) => g.id === block.goal_id && g.status === "open")
      ? block.goal_id!.toString()
      : "",
  );
  const [title, setTitle] = useState(block.proposed_title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [editing, setEditing] = useState(block.status === "pending");
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await invoke("review_activity", {
        periodId: block.period_id,
        key: block.key,
        action,
        goalId: goal ? Number(goal) : null,
        title: title.trim() || null,
      });
      queryClient.invalidate(["activity", "workspace", "noticed"]);
      await activityReviewQuery.refresh();
      await onChanged();
    } catch (e) {
      setError(queryClient.recordError("activity review", e));
    } finally {
      setBusy(false);
    }
  }
  async function showImage(id: number) {
    setError("");
    try {
      setImage(await invoke<string>("get_activity_evidence", { id }));
    } catch {
      setError(
        "This screenshot is no longer available. It is deleted after the daily summary.",
      );
    }
  }
  const time = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <li className="review-block">
      <div className="review-block-heading">
        <span>
          {time(block.started_at)}–{time(block.ended_at)} ·{" "}
          {duration(block.seconds)} active
        </span>
        <span>
          {block.status === "pending"
            ? "Pending review"
            : block.status === "outside"
              ? "Outside goals"
              : (block.goal_title ?? "Goal removed")}
        </span>
      </div>
      <p>
        {block.description ||
          block.title ||
          "Not enough context to describe this activity."}
      </p>
      <small>
        {block.apps} · {block.reason}
      </small>
      {block.proposed_title && block.status === "pending" && (
        <p>Possible new goal: {block.proposed_title}</p>
      )}
      <div className="review-actions">
        {block.evidence_ids.map((id, index) => (
          <button
            type="button"
            key={id}
            className="text-button"
            onClick={() => void showImage(id)}
          >
            Screenshot {index + 1}
          </button>
        ))}
        {!editing && (
          <button
            type="button"
            className="text-button"
            onClick={() => setEditing(true)}
          >
            Change assignment
          </button>
        )}
      </div>
      {image && (
        <div className="review-evidence">
          <img
            src={image}
            alt="Retained active-window screenshot for this activity"
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setImage(null)}
          >
            Close screenshot
          </button>
        </div>
      )}
      {editing && (
        <div className="review-editor">
          <label>
            Existing goal
            <select
              aria-label="Assign activity to goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a goal</option>
              {goals
                .filter((g) => g.status === "open")
                .map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.title}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !goal}
            onClick={() => void act("assign")}
          >
            Assign to goal
          </button>
          <label>
            New goal
            <input
              aria-label="New goal for activity"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void act("create")}
          >
            Add goal to Today
          </button>
          <div className="review-actions">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void act("outside")}
            >
              Outside goals
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Decide later
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </li>
  );
}

function SummaryReview({
  summary,
  goals,
  onChanged,
}: {
  summary: ActivitySummary;
  goals: CoreGoal[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { page, pages, visible, setPage } = usePage(
    summary.blocks,
    summary.period_id,
  );
  const totals = new Map<string, { label: string; seconds: number }>();
  for (const block of summary.blocks) {
    const key =
      block.status === "assigned" ? `goal:${block.goal_id}` : block.status;
    const previous = totals.get(key);
    totals.set(key, {
      label:
        block.status === "assigned"
          ? (block.goal_title ?? "Goal removed")
          : block.status === "outside"
            ? "Outside goals"
            : "Unresolved activity",
      seconds: (previous?.seconds ?? 0) + block.seconds,
    });
  }
  return (
    <details
      className="review-summary"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        Daily summary · {summary.day} ·{" "}
        {duration(summary.blocks.reduce((sum, b) => sum + b.seconds, 0))}{" "}
        observed
      </summary>
      {open && (
        <>
          <p className="helper">
            Saved at {new Date(summary.saved_at).toLocaleString()}. Temporary
            screenshots and raw context were deleted.
          </p>
          <ul className="review-totals">
            {Array.from(totals, ([key, total]) => (
              <li key={key}>
                <span>{total.label}</span>
                <span>{duration(total.seconds)}</span>
              </li>
            ))}
          </ul>
          {summary.results.length > 0 && (
            <ul>
              {summary.results.map((result, index) => (
                <li key={index}>{result}</li>
              ))}
            </ul>
          )}
          <ol className="review-blocks">
            {visible.map((block) => (
              <ReviewBlock
                key={`${block.period_id}:${block.key}:${block.status}`}
                block={block}
                goals={goals}
                onChanged={onChanged}
              />
            ))}
          </ol>
          <Pager
            page={page}
            pages={pages}
            onChange={setPage}
            label="Daily summary activity"
          />
        </>
      )}
    </details>
  );
}

export function ActivityReview({
  goals,
  onChanged,
  history = false,
}: {
  goals: CoreGoal[];
  onChanged: () => Promise<void>;
  history?: boolean;
}) {
  const query = useQuery(activityReviewQuery, desktop);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const data = query.data;
  const blocks = data.blocks.filter((b) => all || b.status === "pending");
  const { page, pages, visible, setPage } = usePage(
    blocks,
    `${all}|${data.blocks.length}`,
  );
  if (
    !desktop ||
    (!data.blocks.length && !data.summaries.length && !query.error)
  )
    return null;
  return (
    <section className="activity-review" aria-label="Activity review">
      {data.pending_summary_count > 0 && (
        <p className="callout" role="status">
          Daily summary pending. Review context remains saved until the summary
          succeeds.
        </p>
      )}
      {query.error && (
        <p role="alert" className="error">
          Activity review is unavailable. It will retry automatically.
        </p>
      )}
      <button
        type="button"
        className="text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {duration(data.pending_seconds)} pending review
      </button>
      {open && (
        <>
          <p className="helper">
            Measured time is saved before a goal is identified. Context and
            permitted screenshots remain until the daily summary is saved at the
            configured Daily summary time.
          </p>
          <label className="review-filter">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
            />{" "}
            Include assigned activity and activity outside goals
          </label>
          <ol className="review-blocks">
            {visible.map((block) => (
              <ReviewBlock
                key={`${block.period_id}:${block.key}:${block.status}`}
                block={block}
                goals={goals}
                onChanged={onChanged}
              />
            ))}
          </ol>
          {!blocks.length && (
            <p className="helper">No activity waiting for review.</p>
          )}
          <Pager
            page={page}
            pages={pages}
            onChange={setPage}
            label="Activity review"
          />
        </>
      )}
      {(history || open) &&
        data.summaries.map((summary) => (
          <SummaryReview
            key={summary.period_id}
            summary={summary}
            goals={goals}
            onChanged={onChanged}
          />
        ))}
    </section>
  );
}

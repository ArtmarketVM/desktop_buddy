import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { aiApi } from "../ai/api";
import { desktop } from "../api/tauri";
import { sentenceCase, type CoreSnapshot } from "./types";

export function useGoalSuggestions(
  query: string,
  snapshot: CoreSnapshot,
  enabled: boolean,
) {
  const prefix = query.trim();
  const exact = snapshot.goals.some(
    (goal) =>
      goal.title.trim().toLocaleLowerCase() === prefix.toLocaleLowerCase(),
  );
  const [result, setResult] = useState({
    prefix: "",
    items: [] as string[],
    failed: false,
  });
  const active =
    enabled && desktop && !!prefix && [...prefix].length < 200 && !exact;
  useEffect(() => {
    if (!active) return;
    let current = true;
    const timer = setTimeout(() => {
      void aiApi.completeGoal(prefix).then(
        (items) => {
          if (current) setResult({ prefix, items, failed: false });
        },
        () => {
          if (current) setResult({ prefix, items: [], failed: true });
        },
      );
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [prefix, active]);
  const ready = active && result.prefix === prefix;
  const taken = new Set(
    snapshot.goals.map((g) => g.title.trim().toLocaleLowerCase()),
  );
  const seen = new Set<string>();
  const items = ready
    ? result.items
        .filter((text) => {
          const key = text.trim().toLocaleLowerCase();
          if (
            !key.startsWith(prefix.toLocaleLowerCase()) ||
            key === prefix.toLocaleLowerCase() ||
            text.length > 500 ||
            taken.has(key) ||
            seen.has(key)
          )
            return false;
          seen.add(key);
          return true;
        })
        .slice(0, 4)
    : [];
  return {
    items,
    exact,
    loading: active && !ready,
    failed: ready && result.failed,
  };
}

export function GoalSuggestionRows({
  items,
  loading,
  failed,
  selected,
  offset = 0,
  choose,
}: {
  items: string[];
  loading: boolean;
  failed: boolean;
  selected: number;
  offset?: number;
  choose: (title: string) => void;
}) {
  return (
    <>
      {(items.length > 0 || loading || failed) && (
        <li className="finder-label" role="presentation">
          <span role="status">
            {loading
              ? "Finding goal ideas…"
              : failed
                ? "Goal ideas unavailable. You can still add your goal."
                : "Goal ideas · Tab to use"}
          </span>
        </li>
      )}
      {items.map((title, i) => (
        <li
          key={title}
          className={`finder-row ${selected === offset + i ? "selected" : ""}`}
          role="option"
          aria-selected={selected === offset + i}
        >
          <button type="button" onClick={() => choose(title)}>
            <span className="core-goal-title">{sentenceCase(title)}</span>
            <Plus size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </>
  );
}

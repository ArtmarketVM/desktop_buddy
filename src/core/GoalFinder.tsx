import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Plus, Search } from "lucide-react";
import type { CoreGoal, CoreSnapshot } from "./types";
import { sentenceCase } from "./types";
import { stepCount } from "./Goals";
import { GoalSuggestionRows, useGoalSuggestions } from "./GoalSuggestions";

const RECENT = 5;

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}
/** Open goals not on Today, filtered by every word of the query (title, description, steps). */
export function matchGoals(
  snapshot: Pick<CoreSnapshot, "goals" | "today">,
  query: string,
): CoreGoal[] {
  const terms = words(query);
  return snapshot.goals.filter((goal) => {
    if (goal.status !== "open" || snapshot.today.includes(goal.id))
      return false;
    if (!terms.length) return true;
    const haystack = [
      goal.title,
      goal.description ?? "",
      ...goal.plan.steps.map((step) => step.text),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
/** Unfinished goals from earlier days first, then the goals with the most focused time. */
export function browseGoals(
  snapshot: Pick<CoreSnapshot, "goals" | "today" | "carryover">,
): CoreGoal[] {
  const open = matchGoals(snapshot, "");
  const carry = open.filter((goal) => snapshot.carryover.includes(goal.id));
  const rest = open
    .filter((goal) => !snapshot.carryover.includes(goal.id))
    .sort(
      (a, b) =>
        b.focused_seconds - a.focused_seconds ||
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
  return [...carry, ...rest];
}
export function recentGoals(
  snapshot: Pick<CoreSnapshot, "goals" | "today" | "carryover">,
): CoreGoal[] {
  return browseGoals(snapshot).slice(0, RECENT);
}

function Row({
  goal,
  selected,
  carryover,
  action,
}: {
  goal: CoreGoal;
  selected?: boolean;
  carryover?: boolean;
  action: () => void;
}) {
  return (
    <li
      className={`finder-row ${selected ? "selected" : ""}`}
      role="option"
      aria-selected={selected}
    >
      <button type="button" onClick={action}>
        <span className="core-goal-title">
          {sentenceCase(goal.title)}
          <small>{stepCount(goal.plan.steps.length)}</small>
          {carryover && <em>unfinished</em>}
        </span>
      </button>
    </li>
  );
}

/** One field: typing filters saved goals, Enter adds the highlighted one or creates a new goal. */
export function GoalFinder({
  snapshot,
  disabled,
  onDirty,
  create,
  addToToday,
  showRecent,
}: {
  snapshot: CoreSnapshot;
  disabled: boolean;
  onDirty?: (dirty: boolean) => void;
  create: (title: string, batch: string) => Promise<boolean>;
  addToToday: (id: number) => Promise<boolean>;
  /** Show the recent goals under the field even when it is not focused (empty Today). */
  showRecent: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const batch = useRef(crypto.randomUUID());
  const trimmed = query.trim();
  useEffect(() => {
    onDirty?.(!!trimmed);
  }, [trimmed, onDirty]);
  const matches = useMemo(
    () =>
      trimmed
        ? matchGoals(snapshot, trimmed)
            .sort(
              (a, b) =>
                Number(
                  b.title.trim().toLocaleLowerCase() ===
                    trimmed.toLocaleLowerCase(),
                ) -
                Number(
                  a.title.trim().toLocaleLowerCase() ===
                    trimmed.toLocaleLowerCase(),
                ),
            )
            .slice(0, 6)
        : [],
    [snapshot, trimmed],
  );
  const recent = useMemo(() => recentGoals(snapshot), [snapshot]);
  const all = useMemo(() => browseGoals(snapshot), [snapshot]);
  const suggestions = useGoalSuggestions(query, snapshot, focused && !disabled);
  const { exact } = suggestions;
  // Saved matches, personalized ideas, then creation using the user's own text.
  const options = trimmed
    ? matches.length + suggestions.items.length + (exact ? 0 : 1)
    : 0;
  useEffect(() => {
    setIndex(matches.length ? 0 : -1);
  }, [trimmed, matches.length]);
  const listOpen = focused && (trimmed ? options > 0 : all.length > 0);
  const inlineRecent = !focused && showRecent && recent.length > 0 && !trimmed;
  const highlighted =
    trimmed && index >= 0 && index < matches.length ? matches[index] : null;

  async function add(id: number) {
    if (disabled) return;
    if (await addToToday(id)) setQuery("");
  }
  async function createTitle(title: string) {
    if (disabled) return;
    if (await create(title, batch.current)) {
      setQuery("");
      batch.current = crypto.randomUUID();
    }
  }
  async function submit() {
    if (!trimmed || disabled) return;
    const saved = snapshot.goals.find(
      (goal) =>
        goal.title.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    if (saved && snapshot.today.includes(saved.id)) return;
    if (highlighted) return add(highlighted.id);
    const idea =
      index >= matches.length
        ? suggestions.items[index - matches.length]
        : undefined;
    return createTitle(idea ?? trimmed);
  }
  function key(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options) {
      event.preventDefault();
      setIndex((i) => (i + 1) % options);
    } else if (event.key === "ArrowUp" && options) {
      event.preventDefault();
      setIndex((i) => (i < 0 ? options - 1 : (i - 1 + options) % options));
    } else if (event.key === "Tab" && suggestions.items.length) {
      event.preventDefault();
      setQuery(
        suggestions.items[Math.max(0, index - matches.length)] ??
          suggestions.items[0],
      );
    } else if (event.key === "Escape") {
      (event.target as HTMLInputElement).blur();
    }
  }
  const list = (goals: CoreGoal[], withCreate: boolean) => (
    <ul className="finder-list" role="listbox" aria-label="Saved goals">
      {goals.map((goal, i) => (
        <Row
          key={goal.id}
          goal={goal}
          selected={focused && trimmed !== "" && i === index}
          carryover={snapshot.carryover.includes(goal.id)}
          action={() => void add(goal.id)}
        />
      ))}
      {withCreate && (
        <GoalSuggestionRows
          {...suggestions}
          selected={index}
          offset={matches.length}
          choose={(title) => void createTitle(title)}
        />
      )}
      {withCreate && (
        <li
          className={`finder-row create ${index === matches.length + suggestions.items.length ? "selected" : ""}`}
          role="option"
          aria-selected={index === matches.length + suggestions.items.length}
        >
          <button type="button" onClick={() => void createTitle(trimmed)}>
            <span className="core-goal-title">
              Create “{sentenceCase(trimmed)}”
            </span>
            <Plus size={14} aria-hidden="true" />
          </button>
        </li>
      )}
    </ul>
  );
  return (
    <div className="goal-finder">
      <form
        className="quick-goal search-field"
        role="combobox"
        aria-expanded={listOpen}
        aria-haspopup="listbox"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Search
          size={16}
          aria-hidden="true"
          className="finder-icon search-field-icon"
        />
        <input
          aria-label="Search or add a goal"
          placeholder="Search your goals, or type a new one…"
          maxLength={500}
          value={query}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          // Let a click on a suggestion land before the list closes.
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={key}
        />
        <button disabled={disabled || !trimmed}>
          {highlighted ? "Add to Today" : "Add goal"}
        </button>
      </form>
      {listOpen && (
        <div
          className="finder-dropdown"
          onMouseDown={(event) => event.preventDefault()}
        >
          {!trimmed && (
            <p className="finder-label">Saved goals · {all.length}</p>
          )}
          {list(trimmed ? matches : all, trimmed !== "" && !exact)}
        </div>
      )}
      {inlineRecent && (
        <div className="finder-inline">
          <p className="finder-label">Pick up a saved goal</p>
          {list(recent, false)}
        </div>
      )}
    </div>
  );
}

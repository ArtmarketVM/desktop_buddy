import { useEffect, useState } from "react";
import { desktop } from "../api/tauri";
import { aiApi, defaultAiPreferences, type AiPreferences } from "./api";
import { Hint } from "../core/Hint";
export function AiSettings({
  onChanged,
  compact = false,
}: {
  onChanged: () => Promise<void>;
  /** Two plain switches with hints, no small print. */
  compact?: boolean;
}) {
  const [preferences, setPreferences] = useState(defaultAiPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (desktop)
      void aiApi
        .preferences()
        .then(setPreferences)
        .catch((e) => setError(String(e)));
  }, []);
  async function save(patch: Partial<AiPreferences>) {
    setBusy(true);
    setError("");
    try {
      const next = { ...preferences, ...patch };
      await aiApi.savePreferences(next);
      setPreferences(next);
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (compact)
    return (
      <section aria-label="sumi AI sharing">
        <label className="toggle-row">
          <span className="lbl">
            Use AI
            <Hint text="Coach chat, goal suggestions and web search through the services above. Off stops every request." />
          </span>
          <input
            type="checkbox"
            checked={preferences.enabled}
            disabled={!desktop || busy}
            onChange={(e) => void save({ enabled: e.target.checked })}
          />
        </label>
        <label className="toggle-row">
          <span className="lbl">
            Match my activity to goals
            <Hint text="Sends your open goals, foreground app, window/page titles and browser domain to Nebius. With on-screen task detection enabled, also sends up to 400 characters of redacted visible text." />
          </span>
          <input
            type="checkbox"
            checked={preferences.automatic_goal_matching}
            disabled={!desktop || busy}
            onChange={(e) =>
              void save({ automatic_goal_matching: e.target.checked })
            }
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <section aria-label="sumi AI sharing">
      <label className="toggle-row">
        <span>
          Allow sumi AI assistance
          <small>
            Automatically analyze new goals; send requests, conversation history
            and attachments you choose to Nebius. Goal suggestions stay separate
            until you accept them. Provider charges may apply.
          </small>
        </span>
        <input
          type="checkbox"
          checked={preferences.enabled}
          disabled={!desktop || busy}
          onChange={(e) => void save({ enabled: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          Include Today goals in sumi chat
          <small>
            Share their titles, steps, deadlines and relevant activity totals
            and app names. Your profile, screen contents and window titles are
            excluded.
          </small>
        </span>
        <input
          type="checkbox"
          checked={preferences.share_goal_context}
          disabled={!desktop || busy}
          onChange={(e) => void save({ share_goal_context: e.target.checked })}
        />
      </label>
      <label className="toggle-row">
        <span>
          Allow Tavily web research
          <small>
            sumi searches only when current information or an official workflow
            is useful. Tavily receives the search query; Nebius receives
            returned source snippets.
          </small>
        </span>
        <input
          type="checkbox"
          checked={preferences.web_research}
          disabled={!desktop || busy}
          onChange={(e) => void save({ web_research: e.target.checked })}
        />
      </label>
      <p className="helper">
        Automatic goal matching does not need a running timer.
      </p>
      <label className="toggle-row">
        <span>
          Let Nebius identify the active goal
          <small>
            With tracking and AI assistance on, send up to 20 open goal titles
            and their next steps, plus the foreground app, available browser
            domain and window/page titles (up to 160 characters each), to Nebius
            Token Factory. With on-screen task detection enabled, also send up
            to 400 characters of redacted visible text. A matching attempt
            starts at most once per minute; transient errors may be retried.
            Uncertain activity stays unassigned.
          </small>
        </span>
        <input
          type="checkbox"
          checked={preferences.automatic_goal_matching}
          disabled={!desktop || busy}
          onChange={(e) =>
            void save({ automatic_goal_matching: e.target.checked })
          }
        />
      </label>
      <p className="helper">
        AI assistance is {preferences.enabled ? "on" : "off"}. Activity tracking
        and automatic screen sampling have separate controls.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

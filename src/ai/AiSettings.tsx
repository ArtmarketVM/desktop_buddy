import { useEffect, useState } from "react";
import { desktop } from "../api/tauri";
import { aiApi, defaultAiPreferences, type AiPreferences } from "./api";
export function AiSettings({ onChanged }: { onChanged: () => Promise<void> }) {
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
  return (
    <section aria-label="Buddy AI sharing">
      <label className="toggle-row">
        <span>
          Allow Buddy AI assistance
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
          Include Today goals in Buddy chat
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
            Buddy searches only when current information or an official workflow
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
            and their next steps, plus the foreground app and up to 160
            characters of its window title, to Nebius Token Factory. A matching
            attempt starts at most once per minute; transient errors may be
            retried. Uncertain activity stays unassigned.
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

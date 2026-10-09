import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { desktop } from "../api/tauri";
import { aiApi, type ChatConversation } from "../ai/api";
import type { Dashboard } from "../types";
import { defaultCompanionView } from "./types";
import { Conversation } from "./Conversation";

export function Chats({
  dashboard,
  onChanged,
}: {
  dashboard: Dashboard;
  onChanged: () => Promise<void>;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    const refresh = () => {
      if (desktop)
        void aiApi
          .conversations()
          .then((items) => {
            if (active) setConversations(items);
          })
          .catch((e) => {
            if (active) setError(String(e));
          });
    };
    refresh();
    if (desktop)
      void listen("buddy://chat-updated", refresh)
        .then((unlisten) => {
          if (active) stop = unlisten;
          else unlisten();
        })
        .catch(e => { if (active) setError(String(e)); });
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      setConversations(await aiApi.conversations());
      await onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const current = conversations.find((item) => item.active);
  return (
    <div className="chats-layout">
      <aside className="chat-conversations" aria-label="Saved conversations">
        <button
          className="outline-button"
          disabled={!desktop || busy}
          onClick={() => void run(aiApi.newConversation)}
        >
          <MessageSquarePlus size={16} />
          New chat
        </button>
        {conversations.map((item) => (
          <div
            className={`chat-history-row ${item.active ? "selected" : ""}`}
            key={item.id}
          >
            <button
              className="text-button"
              disabled={busy}
              aria-pressed={item.active}
              onClick={() => void run(() => aiApi.selectConversation(item.id))}
            >
              <span>{item.title}</span>
              <small>{new Date(item.updated_at).toLocaleDateString()}</small>
            </button>
            <button
              className="text-button"
              aria-label={`Delete chat: ${item.title}`}
              disabled={busy}
              onClick={() => setDeleting(item.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!conversations.length && (
          <p className="helper">Your conversations will appear here.</p>
        )}
        {deleting !== null && (
          <div role="alert">
            <p>Delete this conversation?</p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await aiApi.deleteConversation(deleting);
                  setDeleting(null);
                })
              }
            >
              Delete
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </aside>
      <Conversation
        key={current?.id ?? "preview"}
        view={dashboard.buddy.companion ?? defaultCompanionView}
        goal={dashboard.goal}
        plan={dashboard.goal_plan}
        embedded
        onState={() => {}}
        onChanged={onChanged}
      />
    </div>
  );
}

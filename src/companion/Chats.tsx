import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";
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
        .catch((e) => {
          if (active) setError(String(e));
        });
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
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState<number | null>(null);
  useEffect(() => {
    if (rowMenu === null && !menu) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !(event.target as Element | null)?.closest(
              ".chat-menu, .chat-item-menu, .chat-menu-button",
            )
      ) {
        setRowMenu(null);
        setMenu(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [rowMenu, menu]);
  useEffect(() => {
    const text = query.trim();
    if (!text || !desktop) {
      setMatches(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void aiApi
        .searchConversations(text)
        .then((ids) => {
          if (active) setMatches(ids);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, conversations]);
  const visible = useMemo(
    () =>
      matches === null
        ? conversations
        : conversations.filter((item) => matches.includes(item.id)),
    [conversations, matches],
  );
  const current = conversations.find((item) => item.active);
  const searching = query.trim() !== "";
  return (
    <div className="chats-layout">
      <aside className="chat-conversations" aria-label="Saved conversations">
        <h1>Chats</h1>
        <div className="chat-search-bar">
          <label className="chat-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Search chats"
              aria-label="Search chats"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={13} />
              </button>
            )}
          </label>
          <button
            type="button"
            className="chat-new"
            aria-label="New chat"
            title="New chat"
            disabled={!desktop || busy}
            onClick={() => {
              setQuery("");
              void run(aiApi.newConversation);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        {searching && <p className="chat-group">Results</p>}
        {visible.map((item) => (
          <div
            key={item.id}
            className={`chat-item ${item.active ? "selected" : ""} ${rowMenu === item.id ? "open" : ""}`}
          >
            <button
              className="chat-row"
              disabled={busy}
              aria-pressed={item.active}
              onClick={() => void run(() => aiApi.selectConversation(item.id))}
            >
              {item.title}
            </button>
            <button
              type="button"
              className="chat-item-menu"
              aria-label={`Options for ${item.title}`}
              aria-expanded={rowMenu === item.id}
              onClick={() =>
                setRowMenu((open) => (open === item.id ? null : item.id))
              }
            >
              <MoreHorizontal size={15} />
            </button>
            {rowMenu === item.id && (
              <div className="chat-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setRowMenu(null);
                    setDeleting(item.id);
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {!conversations.length && (
          <p className="helper">Your conversations will appear here.</p>
        )}
        {!!conversations.length && !visible.length && (
          <p className="helper">No chats match “{query.trim()}”.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </aside>
      <div className="chat-pane">
        <header className="chat-pane-head">
          <span className="chat-pane-title">
            {current?.title ?? "New chat"}
          </span>
          <div className="chat-menu-wrap">
            <button
              type="button"
              className="chat-menu-button"
              aria-label="Chat options"
              aria-expanded={menu}
              disabled={!current || busy}
              onClick={() => setMenu((open) => !open)}
            >
              <MoreHorizontal size={16} />
            </button>
            {menu && current && (
              <div className="chat-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setMenu(false);
                    setDeleting(current.id);
                  }}
                >
                  <Trash2 size={14} />
                  Delete chat
                </button>
              </div>
            )}
          </div>
        </header>
        {deleting !== null && (
          <div className="chat-confirm" role="alert">
            <span>
              Delete “
              {conversations.find((c) => c.id === deleting)?.title ??
                "this chat"}
              ”? This can’t be undone.
            </span>
            <button
              className="danger"
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
            <button disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </button>
          </div>
        )}
        <Conversation
          key={current?.id ?? "preview"}
          conversationId={current?.id}
          view={dashboard.buddy.companion ?? defaultCompanionView}
          goal={dashboard.goal}
          plan={dashboard.goal_plan}
          embedded
          headerless
          onState={() => {}}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

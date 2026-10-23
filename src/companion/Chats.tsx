import { useChatPose } from "./useChatPose";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "../data/useQuery";
import { conversationsQuery } from "../data/resources";
import { queryClient } from "../data/client";
import { MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";
import { desktop } from "../api/tauri";
import { aiApi } from "../ai/api";
import type { Dashboard } from "../types";
import { defaultCompanionView } from "./types";
import { Conversation } from "./Conversation";
import { toast } from "../components/Toasts";

export function Chats({
  dashboard,
  onChanged,
}: {
  dashboard: Dashboard;
  onChanged: () => Promise<void>;
}) {
  const [, setPose] = useChatPose("workspace");
  const conversationState = useQuery(conversationsQuery, desktop);
  const conversations = conversationState.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A deleted chat leaves the list at once and is removed for real when the undo toast expires.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const pendingTimer = useRef<{ id: number; timer: number } | null>(null);
  useEffect(
    () => () => {
      const pending = pendingTimer.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      void aiApi.deleteConversation(pending.id).catch(() => undefined);
    },
    [],
  );
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await conversationsQuery.refresh();
      await onChanged();
    } catch (e) {
      setError(queryClient.recordError("chat list action", e));
    } finally {
      setBusy(false);
    }
  }
  function deleteWithUndo(id: number) {
    const item = conversations.find((c) => c.id === id);
    if (!item) return;
    setMenu(false);
    setRowMenu(null);
    setPendingDelete(id);
    // Show the next chat straight away instead of the one that is going.
    const next = item.active
      ? conversations.find((c) => c.id !== id && c.id !== pendingDelete)
      : undefined;
    if (next) void run(() => aiApi.selectConversation(next.id));
    const timer = window.setTimeout(() => {
      pendingTimer.current = null;
      setPendingDelete(null);
      void run(() => aiApi.deleteConversation(id));
    }, 8000);
    pendingTimer.current = { id, timer };
    toast({
      message: `Deleted “${item.title}”`,
      undo: async () => {
        window.clearTimeout(timer);
        pendingTimer.current = null;
        setPendingDelete(null);
        if (next) await run(() => aiApi.selectConversation(id));
      },
    });
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
          if (active) setError(queryClient.recordError("chat list action", e));
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, conversations]);
  const visible = useMemo(
    () =>
      (matches === null
        ? conversations
        : conversations.filter((item) => matches.includes(item.id))
      ).filter((item) => item.id !== pendingDelete),
    [conversations, matches, pendingDelete],
  );
  const current = conversations.find(
    (item) => item.active && item.id !== pendingDelete,
  );
  const searching = query.trim() !== "";
  return (
    <div className="chats-layout">
      <aside className="chat-conversations" aria-label="Saved conversations">
        <h1>Chats</h1>
        <div className="chat-search-bar">
          <label className="chat-search search-field">
            <Search
              size={16}
              aria-hidden="true"
              className="search-field-icon"
            />
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
                  onClick={() => deleteWithUndo(item.id)}
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
        {(error || conversationState.error) && (
          <p role="alert">{error || conversationState.error}</p>
        )}
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
                  onClick={() => deleteWithUndo(current.id)}
                >
                  <Trash2 size={14} />
                  Delete chat
                </button>
              </div>
            )}
          </div>
        </header>
        <Conversation
          key={current?.id ?? "preview"}
          conversationId={current?.id}
          view={dashboard.buddy.companion ?? defaultCompanionView}
          goal={dashboard.goal}
          plan={dashboard.goal_plan}
          embedded
          headerless
          onState={setPose}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

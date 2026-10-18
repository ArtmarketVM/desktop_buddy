import { InterventionCard } from "./InterventionCard";
import { CoachingPanel } from "../coaching/CoachingPanel";
import { Markdown } from "./Markdown";
import { MessageMeta, Sources } from "./MessageParts";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./conversation.css";
import {
  ArrowUpRight,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Square,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, desktop, safeUrl } from "../api/tauri";
import { aiApi, defaultAiPreferences, type ChatMessage } from "../ai/api";
import { readAttachment, recordVoice } from "../core/media";
import { coreApi } from "../core/api";
import type { AvatarState, Goal, GoalPlan } from "../types";
import type { CompanionView } from "./types";
import { coachingApi, type CoachingView } from "../coaching/api";

type PendingMessage = {
  text: string;
  attachment: string | null;
  voiceMessage: boolean;
  requestId: string;
  goalId: number | null;
  coachingSessionId: number | null;
  coachingRevision: number | null;
  rememberResult: boolean;
};

export function Conversation({
  view,
  goal,
  plan,
  onChanged,
  onState,
  embedded = false,
  headerless = false,
  onMove,
  onResize,
  compact = false,
  mode = "text",
  onMode,
  onClose,
  conversationId,
}: {
  view: CompanionView;
  goal: Goal | null;
  plan: GoalPlan | null;
  onChanged: () => Promise<void>;
  onState: (state: AvatarState) => void;
  embedded?: boolean;
  headerless?: boolean;
  onMove?: (event: React.PointerEvent<HTMLElement>) => void;
  onResize?: () => void;
  compact?: boolean;
  mode?: "text" | "voice";
  onMode?: (mode: "text" | "voice") => void;
  onClose?: () => void;
  /** The chat this view shows; replies are saved there even if another chat is opened meanwhile. */
  conversationId?: number;
}) {
  const inputId = useId();
  const [text, setText] = useState(view.seed.slice(0, 4000));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preferences, setPreferences] = useState(defaultAiPreferences);
  const [attachment, setAttachment] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<Awaited<ReturnType<typeof recordVoice>> | null>(null);
  const voiceGeneration = useRef(0);
  const voiceDraft = useRef(false);
  const voiceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const queued = useRef<PendingMessage[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [coaching, setCoaching] = useState<CoachingView | null>(null);
  const [rememberResult, setRememberResult] = useState(false);
  const updateCoaching = useCallback((next: CoachingView | null) => {
    setCoaching((previous) =>
      next &&
      previous &&
      (previous.session.id > next.session.id ||
        (previous.session.id === next.session.id &&
          previous.session.revision > next.session.revision))
        ? previous
        : next,
    );
  }, []);
  const followLatest = useRef(true);
  // Voice callbacks outlive a render, so they read the latest values from here.
  const latest = useRef({ text, mode, compact });
  latest.current = { text, mode, compact };
  const cancelRecording = () => {
    voiceGeneration.current += 1;
    recorder.current?.cancel();
    recorder.current = null;
    if (voiceTimeout.current) clearTimeout(voiceTimeout.current);
    setRecording(false);
    setMuted(false);
    onState("idle");
  };
  async function finishRecording() {
    const generation = ++voiceGeneration.current;
    if (voiceTimeout.current) clearTimeout(voiceTimeout.current);
    const active = recorder.current;
    recorder.current = null;
    setRecording(false);
    setMuted(false);
    if (!active) return;
    onState("thinking");
    let transcript = "";
    const recognized = await run(async () => {
      transcript = (await coreApi.transcribe(await active.stop())).trim();
      if (!transcript)
        throw new Error(
          "No speech was recognized. Try again or type your message.",
        );
      if (transcript.length + latest.current.text.length > 4000)
        throw new Error(
          "The transcript is too long. Record a shorter message.",
        );
    });
    if (generation !== voiceGeneration.current) return;
    if (!recognized || !transcript) {
      onState("idle");
      return;
    }
    voiceDraft.current = true;
    const combined = [latest.current.text, transcript]
      .filter(Boolean)
      .join(" ")
      .slice(0, 4000);
    onMode?.("text");
    if (latest.current.compact && latest.current.mode === "voice") {
      // A spoken message in the mascot chat is sent as soon as the person stops talking.
      setText("");
      await submit("", combined);
      return;
    }
    setText(combined);
    onState("idle");
  }
  async function startRecording() {
    if (!desktop || recorder.current || busy) return;
    const generation = ++voiceGeneration.current;
    setError("");
    try {
      const languages = await coreApi.voiceLanguages();
      if (generation !== voiceGeneration.current) return;
      if (!languages.length)
        throw new Error(
          "Local speech recognition is unavailable. Install an on-device speech language or type your message.",
        );
      const active = await recordVoice(() => void finishRecording());
      if (generation !== voiceGeneration.current) {
        active.cancel();
        return;
      }
      recorder.current = active;
      setRecording(true);
      onState("listening");
      voiceTimeout.current = setTimeout(() => void finishRecording(), 60000);
    } catch (e) {
      if (generation === voiceGeneration.current) {
        setError(
          e instanceof DOMException &&
            ["NotAllowedError", "SecurityError"].includes(e.name)
            ? "Microphone access was denied. Allow microphone access in system settings, then try again or type your message."
            : String(e),
        );
        onState("idle");
      }
    }
  }
  useEffect(() => {
    if (compact && mode === "voice") void startRecording();
    return () => {
      voiceGeneration.current += 1;
      recorder.current?.cancel();
      recorder.current = null;
      if (voiceTimeout.current) clearTimeout(voiceTimeout.current);
      setRecording(false);
      setMuted(false);
      onState("idle");
    };
  }, [compact, mode]);
  useEffect(() => {
    if (compact && mode === "text") input.current?.focus();
  }, [compact, mode]);
  useEffect(() => {
    if (!embedded) input.current?.focus();
    let active = true;
    const refresh = () => {
      if (desktop)
        void Promise.all([aiApi.history(), aiApi.preferences()])
          .then(([history, prefs]) => {
            if (active) {
              setMessages((previous) =>
                JSON.stringify(previous) === JSON.stringify(history)
                  ? previous
                  : history,
              );
              setPreferences(prefs);
            }
          })
          .catch((e) => {
            if (active) setError(String(e));
          });
    };
    if (!busy && !sending.current) refresh();
    const id = setInterval(() => {
      if (!busy && !sending.current) refresh();
    }, 5000);
    let stop: (() => void) | undefined;
    if (desktop)
      void listen("buddy://chat-updated", () => {
        if (!busy && !sending.current) refresh();
      })
        .then((unlisten) => {
          if (active) stop = unlisten;
          else unlisten();
        })
        .catch(() => {});
    return () => {
      active = false;
      clearInterval(id);
      stop?.();
    };
  }, [busy, embedded]);
  useEffect(() => {
    if (embedded) return;
    setText(view.seed.slice(0, 4000));
    setError("");
  }, [view.seed, view.intent, embedded]);
  useEffect(() => {
    if (scroll.current && followLatest.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, busy]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (!embedded && !compact && event.key === "Escape") {
        event.preventDefault();
        void api
          .closeChat()
          .then(onChanged)
          .catch((e) => setError(String(e)));
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onChanged, embedded, compact]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await onChanged();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  // A message leaves the field and appears in the chat right away. While sumi is still answering,
  // further messages are queued and sent one after another, so typing never has to wait.
  async function submit(prefix = "", override?: string) {
    const body = (override ?? text).trim();
    if (!body || !desktop || (coaching?.chat_bound && sending.current)) return;
    const outgoing = prefix + body;
    const voiceMessage = voiceDraft.current;
    voiceDraft.current = false;
    const shared = attachment?.text ?? null;
    const pending: PendingMessage = {
      text: outgoing,
      attachment: shared,
      voiceMessage,
      requestId: crypto.randomUUID(),
      goalId: coaching?.chat_bound
        ? coaching.session.goal_id
        : (goal?.id ?? null),
      coachingSessionId: coaching?.chat_bound ? coaching.session.id : null,
      coachingRevision: coaching?.chat_bound ? coaching.session.revision : null,
      rememberResult,
    };
    setText("");
    setAttachment(null);
    setError("");
    followLatest.current = true;
    setMessages((previous) => [
      ...previous,
      {
        id: -Date.now(),
        role: "user",
        text: outgoing,
        created_at: new Date().toISOString(),
        goal_id: pending.goalId,
        resources: [],
      },
    ]);
    if (sending.current) {
      queued.current.push(pending);
      return;
    }
    sending.current = true;
    setWaiting(true);
    onState("thinking");
    let next: PendingMessage | undefined = pending;
    try {
      while (next) {
        await aiApi.send(
          next.text,
          next.attachment,
          next.goalId,
          conversationId ?? null,
          next.voiceMessage,
          next.requestId,
          next.coachingSessionId,
          next.coachingRevision,
          next.rememberResult,
        );
        next = queued.current.shift();
      }
    } catch (e) {
      setError(String(e));
      // The question stays in the chat once it was accepted; anything else goes back to the input.
      const saved = await aiApi.history().catch(() => []);
      const unsent = [next?.text, ...queued.current.map((item) => item.text)]
        .filter(
          (item): item is string =>
            !!item &&
            !saved.some((m) => m.role === "user" && m.text.startsWith(item)),
        )
        .join("\n");
      queued.current = [];
      if (unsent) setText((previous) => previous || unsent);
    }
    try {
      setMessages(await aiApi.history());
      if (coaching?.chat_bound)
        updateCoaching(await coachingApi.inspect(conversationId));
      setRememberResult(false);
      await onChanged();
    } catch (e) {
      setError(String(e));
    }
    sending.current = false;
    setWaiting(false);
    onState("idle");
    input.current?.focus();
  }
  async function attach(file: File | undefined) {
    if (!file) return;
    await run(async () => {
      const result = await readAttachment(file);
      if (result.images.length)
        throw new Error(
          "This attachment needs vision. Use Import to review an image or scanned PDF.",
        );
      setAttachment({ name: file.name, text: result.text });
    });
    if (fileInput.current) fileInput.current.value = "";
  }
  async function openResource(url: string, goalId: number | null) {
    const safe = safeUrl(url);
    if (!safe) return;
    await run(async () => {
      await openUrl(safe);
      await aiApi.resourceOpened(goalId, safe);
    });
  }
  return (
    <section
      className={`companion-chat ${embedded ? "workspace-chat" : ""} ${compact ? "compact-conversation" : ""} ${compact && mode === "voice" ? "voice-mode" : ""}`}
      aria-label={embedded ? "sumi chat" : "sumi mini chat"}
    >
      {!compact && !headerless && (
        <header onPointerDown={onMove}>
          <div>{!embedded && <strong>sumi</strong>}</div>
          <button
            className="companion-icon"
            aria-label="Clear conversation"
            disabled={!desktop || busy || !messages.length}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={15} />
          </button>
          {!embedded && (
            <button
              className="text-button"
              title="Open full app"
              onClick={() => void run(api.openWorkspace)}
            >
              <ArrowUpRight size={15} />
              Open app
            </button>
          )}
          {!embedded && (
            <button
              className="companion-icon"
              aria-label="Close mini chat"
              onClick={() => void run(api.closeChat)}
            >
              <X size={16} />
            </button>
          )}
        </header>
      )}
      {compact && (
        <header className="compact-header">
          <strong>sumi</strong>
          <button
            type="button"
            className="companion-icon"
            aria-label="Close chat"
            title="Close chat"
            onClick={() => {
              cancelRecording();
              onClose?.();
            }}
          >
            <X size={16} />
          </button>
        </header>
      )}
      {view.intervention && (
        <InterventionCard
          prompt={view.intervention}
          busy={busy}
          respond={(action) => {
            void run(() => api.companionRespond(view.intervention!.id, action));
          }}
        />
      )}
      {
        <div
          className="companion-chat-scroll conversation-history"
          ref={scroll}
          onScroll={(event) => {
            const node = event.currentTarget;
            followLatest.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 64;
          }}
          role="log"
          aria-label="Conversation history"
          aria-live="polite"
        >
          {!messages.length && (
            <p className="conversation-empty">
              {compact
                ? "Ask sumi anything, or tell it what to add."
                : "What is getting in the way? Tell sumi what you need."}
            </p>
          )}
          {messages.map((message) => (
            <article
              className={`conversation-message ${message.role}`}
              key={message.id}
            >
              <span className="sr-only">
                {message.role === "user" ? "You" : "sumi"}
              </span>
              {message.role === "assistant" ? (
                <Markdown text={message.text} />
              ) : (
                <p>{message.text}</p>
              )}
              <Sources
                resources={message.resources}
                disabled={busy}
                onOpen={(url) => void openResource(url, message.goal_id)}
              />
              <MessageMeta message={message} />
            </article>
          ))}
          {(busy || waiting) && (
            <p role="status">{waiting ? "sumi is thinking…" : "Working…"}</p>
          )}
        </div>
      }
      {embedded && !compact && (
        <CoachingPanel
          conversationId={conversationId}
          onChange={updateCoaching}
          onRememberChange={setRememberResult}
          requested={/^(?:i (?:cannot|can't) start|help me start|не могу начать|помоги начать)[.!?]*$/i.test(
            text.trim(),
          )}
        />
      )}
      {!compact && view.inbox.length > 0 && (
        <details className="conversation-context" aria-label="Saved for later">
          <summary>
            Saved for later ({view.inbox.filter((item) => !item.done).length})
          </summary>
          {view.inbox.map((item) => (
            <div className="conversation-inbox-item" key={item.id}>
              <span>
                {item.text}
                {item.done ? " · Done" : ""}
              </span>
              {!item.done && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api.companionInbox(item.id, "complete"))
                  }
                >
                  Done
                </button>
              )}
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(() => api.companionInbox(item.id, "remove"))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </details>
      )}
      {confirmClear && (
        <div className="conversation-confirm" role="alert">
          <p>Clear the saved conversation on this PC?</p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await aiApi.clearHistory();
                setMessages([]);
                setConfirmClear(false);
              })
            }
          >
            Clear history
          </button>
          <button
            className="text-button"
            onClick={() => setConfirmClear(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {(error || view.notice) && (
        <p className="companion-error" role="alert">
          {error || view.notice}
          {error && text.trim() && (
            <button
              type="button"
              className="text-button"
              disabled={busy || !desktop}
              onClick={() => void submit()}
            >
              Retry message
            </button>
          )}
        </p>
      )}
      <form
        className="conversation-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {attachment && (
          <div className="conversation-attachment">
            <span>{attachment.name}</span>
            <button
              type="button"
              className="companion-icon"
              aria-label="Remove attachment"
              onClick={() => setAttachment(null)}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <label htmlFor={inputId} className="sr-only">
          Your message or task
        </label>
        <textarea
          id={inputId}
          ref={input}
          value={text}
          maxLength={4000}
          rows={compact ? 2 : 3}
          disabled={busy || (!!coaching?.chat_bound && waiting)}
          placeholder={
            coaching?.chat_bound
              ? `Reply about ${coaching.target?.title ?? "this goal"}…`
              : "Message sumi…"
          }
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value.trim()) voiceDraft.current = false;
          }}
          onKeyDown={(e) => {
            if (
              !e.nativeEvent.isComposing &&
              e.key === "Enter" &&
              !e.shiftKey
            ) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="companion-composer-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.pdf"
            hidden
            onChange={(e) => void attach(e.target.files?.[0])}
          />
          {(!compact || mode === "text") && (
            <button
              type="button"
              className="companion-icon"
              aria-label="Attach text or PDF"
              disabled={!desktop || busy || !!coaching?.chat_bound}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={16} />
            </button>
          )}
          <button
            type="button"
            className="companion-icon"
            aria-label={
              compact
                ? "Start voice input"
                : recording
                  ? "Stop voice recording"
                  : "Start voice recording"
            }
            title="Record and transcribe locally"
            disabled={!desktop || busy}
            onClick={() => {
              if (compact) {
                if (mode === "voice") {
                  recorder.current?.setMuted(!muted);
                  setMuted(!muted);
                  onState(muted ? "listening" : "idle");
                } else onMode?.("voice");
                return;
              }
              if (recording) void finishRecording();
              else void startRecording();
            }}
          >
            {compact && muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          {!compact && <span>Enter to send · Shift+Enter for a new line</span>}
          <button
            type="submit"
            disabled={
              !desktop ||
              busy ||
              !text.trim() ||
              (!!coaching?.chat_bound && waiting)
            }
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </div>
        {!coaching?.chat_bound && view.intent === "task" && (
          <button
            type="button"
            className="text-button"
            disabled={!desktop || busy || !text.trim() || text.length > 500}
            onClick={() =>
              void run(async () => {
                await api.companionSubmit(
                  text.trim(),
                  "task",
                  goal?.id ?? null,
                  plan?.revision ?? null,
                );
                setText("");
              })
            }
          >
            Add task locally
          </button>
        )}
        {!coaching?.chat_bound && view.intent === "selection" && (
          <div className="conversation-selection">
            <button
              type="button"
              className="text-button"
              disabled={!desktop || busy || !text.trim()}
              onClick={() => void submit("Explain this selected text: ")}
            >
              Explain
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!desktop || busy || !text.trim() || text.length > 500}
              onClick={() =>
                void run(async () => {
                  await api.companionSubmit(
                    text.trim(),
                    "save",
                    goal?.id ?? null,
                    plan?.revision ?? null,
                  );
                  setText("");
                })
              }
            >
              Save for later
            </button>
          </div>
        )}
        {!compact && recording && (
          <p className="helper" role="status">
            Recording for up to 60 seconds. Stop to transcribe locally, then
            review before sending.
          </p>
        )}
      </form>
      {compact && mode === "voice" && (
        <div className="compact-voice-bar" aria-label="Voice controls">
          <button
            type="button"
            aria-label="Switch to text"
            onClick={() => {
              cancelRecording();
              onMode?.("text");
            }}
          >
            <SquarePen size={17} />
          </button>
          <button
            type="button"
            disabled={!desktop || busy}
            aria-label={
              recording
                ? muted
                  ? "Unmute microphone"
                  : "Mute microphone"
                : "Start recording"
            }
            onClick={() => {
              if (!recording) void startRecording();
              else {
                recorder.current?.setMuted(!muted);
                setMuted(!muted);
                onState(muted ? "listening" : "idle");
              }
            }}
          >
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <span
            className={`voice-indicator ${recording && !muted ? "listening" : ""}`}
            role="status"
            aria-label={
              busy
                ? "Transcribing"
                : recording
                  ? muted
                    ? "Microphone muted"
                    : "Listening"
                  : "Microphone ready"
            }
          />
          <button
            type="button"
            disabled={!recording || busy}
            aria-label="Stop and transcribe"
            onClick={() => void finishRecording()}
          >
            <Square size={16} />
          </button>
          <button
            type="button"
            aria-label="Close voice"
            onClick={() => {
              cancelRecording();
              onClose?.();
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {onResize && (
        <button
          className="chat-resize-handle text-button"
          aria-label="Resize sumi chat"
          onPointerDown={(event) => {
            event.preventDefault();
            onResize();
          }}
        >
          ↘
        </button>
      )}
    </section>
  );
}

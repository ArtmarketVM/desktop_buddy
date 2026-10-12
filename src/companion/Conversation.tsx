import { InterventionCard } from "./InterventionCard";
import { Markdown } from "./Markdown";
import { MessageMeta, Sources } from "./MessageParts";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useId, useRef, useState } from "react";
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
import { isMac } from "../api/platform";
import type { AvatarState, Goal, GoalPlan } from "../types";
import type { CompanionView } from "./types";

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
  const [voice, setVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<Awaited<ReturnType<typeof recordVoice>> | null>(null);
  const voiceGeneration = useRef(0);
  const voiceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const queued = useRef<Array<{ text: string; attachment: string | null }>>([]);
  const [waiting, setWaiting] = useState(false);
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
    voiceGeneration.current += 1;
    if (voiceTimeout.current) clearTimeout(voiceTimeout.current);
    const active = recorder.current;
    recorder.current = null;
    setRecording(false);
    setMuted(false);
    if (!active) return;
    onState("thinking");
    let transcript = "";
    await run(async () => {
      transcript = await coreApi.transcribe(await active.stop());
      if (transcript.length + latest.current.text.length > 4000)
        throw new Error(
          "The transcript is too long. Record a shorter message.",
        );
    });
    if (!transcript) {
      onState("idle");
      return;
    }
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
        setError(String(e));
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
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  // A message leaves the field and appears in the chat right away. While Buddy is still answering,
  // further messages are queued and sent one after another, so typing never has to wait.
  async function submit(prefix = "", override?: string) {
    const body = (override ?? text).trim();
    if (!body || !desktop) return;
    const outgoing = prefix + body;
    const shared = attachment?.text ?? null;
    setText("");
    setAttachment(null);
    setVoice(false);
    setError("");
    followLatest.current = true;
    setMessages((previous) => [
      ...previous,
      {
        id: -Date.now(),
        role: "user",
        text: outgoing,
        created_at: new Date().toISOString(),
        goal_id: goal?.id ?? null,
        resources: [],
      },
    ]);
    if (sending.current) {
      queued.current.push({ text: outgoing, attachment: shared });
      return;
    }
    sending.current = true;
    setWaiting(true);
    onState("thinking");
    let next: { text: string; attachment: string | null } | undefined = {
      text: outgoing,
      attachment: shared,
    };
    try {
      while (next) {
        await aiApi.send(
          next.text,
          next.attachment,
          goal?.id ?? null,
          conversationId ?? null,
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
      aria-label={embedded ? "Buddy chat" : "Buddy mini chat"}
    >
      {!compact && !headerless && (
        <header onPointerDown={onMove}>
          <div>{!embedded && <strong>Buddy</strong>}</div>
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
          <strong>Buddy</strong>
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
                ? "Ask Buddy anything, or tell it what to add."
                : "What is getting in the way? Tell Buddy what you need."}
            </p>
          )}
          {messages.map((message) => (
            <article
              className={`conversation-message ${message.role}`}
              key={message.id}
            >
              <span className="sr-only">
                {message.role === "user" ? "You" : "Buddy"}
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
            <p role="status">{waiting ? "Buddy is thinking…" : "Working…"}</p>
          )}
        </div>
      }
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
          disabled={busy}
          placeholder="Message Buddy…"
          onChange={(e) => setText(e.target.value)}
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
              disabled={!desktop || busy}
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
                : voice || (isMac && recording)
                  ? isMac
                    ? "Stop voice recording"
                    : "Stop Windows voice typing"
                  : isMac
                    ? "Start voice recording"
                    : "Start Windows voice typing"
            }
            title={
              isMac
                ? "Record and transcribe locally"
                : "Voice typing · Windows + H"
            }
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
              if (isMac) {
                if (recording) void finishRecording();
                else void startRecording();
                return;
              }
              input.current?.focus();
              setVoice(!voice);
              onState(voice ? "idle" : "listening");
              void api.voiceInput().catch((e) => {
                setError(String(e));
                setVoice(false);
                onState("idle");
              });
            }}
          >
            {compact && muted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          {!compact && <span>Enter to send · Shift+Enter for a new line</span>}
          <button
            type="submit"
            disabled={!desktop || busy || !text.trim()}
            aria-label="Send message"
          >
            <Send size={15} />
          </button>
        </div>
        {view.intent === "task" && (
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
        {view.intent === "selection" && (
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
        {(voice || (!compact && recording)) && (
          <p className="helper" role="status">
            {isMac
              ? "Recording for up to 60 seconds. Stop to transcribe locally, then review before sending."
              : "Windows voice typing uses your input language. Switch Russian/English with Windows + Space. Review the transcript before sending."}
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
          aria-label="Resize Buddy chat"
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

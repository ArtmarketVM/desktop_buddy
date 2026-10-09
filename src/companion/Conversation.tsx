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
import {
  aiApi,
  defaultAiPreferences,
  type ChatMessage,
  type CoachingInsight,
} from "../ai/api";
import { readAttachment, recordVoice } from "../core/media";
import { coreApi } from "../core/api";
import type { AvatarState, Goal, GoalPlan } from "../types";
import type { CompanionView } from "./types";

export function Conversation({
  view,
  goal,
  plan,
  onChanged,
  onState,
  embedded = false,
  onMove,
  onResize,
  compact = false,
  mode = "text",
  onMode,
  onClose,
}: {
  view: CompanionView;
  goal: Goal | null;
  plan: GoalPlan | null;
  onChanged: () => Promise<void>;
  onState: (state: AvatarState) => void;
  embedded?: boolean;
  onMove?: (event: React.PointerEvent<HTMLElement>) => void;
  onResize?: () => void;
  compact?: boolean;
  mode?: "text" | "voice";
  onMode?: (mode: "text" | "voice") => void;
  onClose?: () => void;
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
  const [latestReply, setLatestReply] = useState<number | null>(null);
  const recorder = useRef<Awaited<ReturnType<typeof recordVoice>> | null>(null);
  const voiceGeneration = useRef(0);
  const voiceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [coaching, setCoaching] = useState<CoachingInsight | null>(null);
  const [expected, setExpected] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const followLatest = useRef(true);
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
    await run(async () => {
      const transcript = await coreApi.transcribe(await active.stop());
      if (transcript.length + text.length > 4000)
        throw new Error(
          "The transcript is too long. Record a shorter message.",
        );
      setText((previous) =>
        [previous, transcript].filter(Boolean).join(" ").slice(0, 4000),
      );
      onMode?.("text");
    });
    onState("idle");
  }
  async function startRecording() {
    if (!desktop || recorder.current || busy) return;
    const generation = ++voiceGeneration.current;
    setError("");
    try {
      const active = await recordVoice();
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
    if (!busy) refresh();
    const id = setInterval(() => {
      if (!busy) refresh();
    }, 5000);
    let stop: (() => void) | undefined;
    if (desktop)
      void listen("buddy://chat-updated", () => {
        if (!busy) refresh();
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
    let active = true;
    setCoaching(null);
    setExpected("");
    if (desktop && goal && !compact)
      void aiApi
        .coaching(goal.id)
        .then((result) => {
          if (active) {
            setCoaching(result);
            setExpected(result.user_expected_minutes?.toString() ?? "");
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [goal?.id, compact]);
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
  async function submit(prefix = "") {
    if (!text.trim() || !desktop || sending.current) return;
    sending.current = true;
    onState("thinking");
    await run(async () => {
      await aiApi.send(
        prefix + text.trim(),
        attachment?.text ?? null,
        goal?.id ?? null,
      );
      followLatest.current = true;
      const history = await aiApi.history();
      setMessages(history);
      setLatestReply(history.at(-1)?.id ?? null);
      setText("");
      setAttachment(null);
      setVoice(false);
    });
    sending.current = false;
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
      {!compact && (
        <header onPointerDown={onMove}>
          <div>
            <strong>Buddy</strong>
          </div>
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
      {!compact && goal && (
        <details className="conversation-context">
          <summary>{goal.text}</summary>
          <p className="helper">
            {preferences.share_goal_context
              ? "Goal context is included in chat."
              : "Goal context sharing is off in Settings."}
          </p>
          {coaching && (
            <p>
              {coaching.relevant_active_minutes}m relevant activity
              {coaching.user_expected_minutes
                ? ` · ${coaching.user_expected_minutes}m expected`
                : ""}
              {coaching.over_expected ? " · Taking longer than expected" : ""}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await aiApi.expectedMinutes(
                  goal.id,
                  expected ? Number(expected) : null,
                );
                setCoaching(await aiApi.coaching(goal.id));
              });
            }}
          >
            <label>
              Expected minutes
              <input
                type="number"
                min={1}
                max={10080}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="Your estimate"
                disabled={busy}
              />
            </label>
            <button disabled={!desktop || busy}>Save estimate</button>
          </form>
        </details>
      )}
      {(!compact || latestReply !== null || busy) && (
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
          {!compact && !messages.length && (
            <p className="conversation-empty">
              What is getting in the way? Tell Buddy what you need.
            </p>
          )}
          {messages
            .filter((message) => !compact || message.id === latestReply)
            .map((message) => (
              <article
                className={`conversation-message ${message.role}`}
                key={message.id}
              >
                <span className="sr-only">
                  {message.role === "user" ? "You" : "Buddy"}
                </span>
                <p>{message.text}</p>
                {message.resources.map((resource) => (
                  <button
                    className="companion-resource"
                    key={resource.url}
                    disabled={!safeUrl(resource.url) || busy}
                    onClick={() =>
                      void openResource(resource.url, message.goal_id)
                    }
                  >
                    <span>
                      {resource.title}
                      <small>{resource.whyRelevant}</small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </article>
            ))}
          {busy && (
            <p role="status">
              {sending.current ? "Buddy is thinking…" : "Working…"}
            </p>
          )}
        </div>
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
          rows={compact ? 1 : 3}
          disabled={busy}
          placeholder="Message Buddy…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              !e.nativeEvent.isComposing &&
              e.key === "Enter" &&
              (e.ctrlKey || e.metaKey || (compact && !e.shiftKey))
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
                : voice
                  ? "Stop Windows voice typing"
                  : "Start Windows voice typing"
            }
            title="Voice typing · Windows + H"
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
          {!compact && <span>Ctrl + Enter</span>}
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
        {voice && (
          <p className="helper" role="status">
            Windows voice typing uses your input language. Switch
            Russian/English with Windows + Space. Review the transcript before
            sending.
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
      {compact && mode === "text" && (
        <button
          className="compact-close"
          aria-label="Close Buddy input"
          onClick={onClose}
        >
          <X size={14} />
        </button>
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

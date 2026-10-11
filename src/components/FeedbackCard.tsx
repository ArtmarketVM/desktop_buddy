import { useState } from "react";
import { MessageSquare, ArrowUpRight } from "lucide-react";
import { api, desktop } from "../api/tauri";

const FEEDBACK_ADDRESS = "artmarket.vm@gmail.com";

export function FeedbackCard() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const body = email.trim()
    ? `${message}\n\nReply email: ${email.trim()}`
    : message;
  return (
    <details open className="card feedback-card">
      <summary>
        <MessageSquare size={16} />
        Share an idea
      </summary>
      <p className="helper">What would make Buddy better for you?</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setStatus("");
          setError("");
          setCopied(false);
          void api
            .feedbackDraft(message, email)
            .then(() =>
              setStatus(
                "Email draft opened. Press Send in your email app to deliver it.",
              ),
            )
            .catch((e) =>
              setError(
                `${String(e)} You can copy the message and send it to ${FEEDBACK_ADDRESS}.`,
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Your suggestion (optional)
          <textarea
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="A wish, an idea, something that felt confusing…"
          />
        </label>
        <label>
          Reply email (optional)
          <input
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Only if you would like a reply"
          />
        </label>
        <button className="outline-button" disabled={!desktop || busy}>
          Open email draft <ArrowUpRight size={14} />
        </button>
      </form>
      <p className="helper">
        Opens a draft to {FEEDBACK_ADDRESS} in your email app. Nothing is sent
        automatically and no activity logs are attached.
      </p>
      {status && (
        <p className="helper" role="status">
          {status}
        </p>
      )}
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(body)
                .then(() => setCopied(true))
                .catch(() =>
                  setError(
                    "Could not copy. Select the text and copy it manually.",
                  ),
                )
            }
          >
            {copied ? "Copied" : "Copy message"}
          </button>
        </>
      )}
    </details>
  );
}

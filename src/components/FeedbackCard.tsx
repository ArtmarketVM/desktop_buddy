import { useEffect, useState } from "react";
import { MessageSquare, ArrowUpRight } from "lucide-react";
import { api, desktop } from "../api/tauri";

export function FeedbackCard() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let active = true;
    if (desktop)
      void api
        .contactEndpoint()
        .then((url) => {
          if (active) setConnected(!!url);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <details
      open
      className="card feedback-card"
      onToggle={(event) => {
        if (desktop && event.currentTarget.open)
          void api
            .contactEndpoint()
            .then((url) => setConnected(!!url))
            .catch(() => setConnected(false));
      }}
    >
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
          void (
            connected
              ? api.sendContactFeedback(message, email)
              : api.feedbackDraft(message, email)
          )
            .then(() =>
              setStatus(
                connected
                  ? "Your feedback was accepted by the contact service. Thank you."
                  : "Email draft opened. Review and send it in your email app.",
              ),
            )
            .catch((e) => setError(String(e)))
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
          {connected ? "Send feedback" : "Open email draft"}{" "}
          <ArrowUpRight size={14} />
        </button>
      </form>
      <p className="helper">
        To artmarket.vm@gmail.com.{" "}
        {connected
          ? "Only these fields are sent when you choose Send feedback."
          : "Nothing is sent automatically."}{" "}
        No activity logs are attached.
      </p>
      {status && (
        <p className="helper" role="status">
          {status}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

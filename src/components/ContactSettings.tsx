import { useEffect, useState } from "react";
import { api, desktop } from "../api/tauri";
import type { UserProfile } from "../types";
import { identityError } from "../data/profile";

export function RoleResearch({
  profile,
  disabled,
}: {
  profile: UserProfile;
  disabled: boolean;
}) {
  const [connected, setConnected] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    <details className="inline-details role-research">
      <summary>Help us understand your role (optional)</summary>
      <p className="helper">
        Share only the email, role and apps entered above with the sumi team. No
        activity, installed-app inventory or goal is sent. This does not
        subscribe you to email updates.
      </p>
      {!connected && (
        <p className="helper">
          A private research service is not connected yet. Your role and apps
          will stay on this device when you save your profile.
        </p>
      )}
      <label className="privacy-ack">
        <input
          type="checkbox"
          checked={consent}
          disabled={disabled || busy || !connected}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I agree to share my email, role and declared apps for product research.
      </label>
      <button
        type="button"
        className="secondary"
        disabled={disabled || busy || !connected || !consent}
        onClick={() => {
          const issue = identityError(profile);
          if (issue) {
            setMessage(issue);
            return;
          }
          setBusy(true);
          setMessage("");
          void api
            .shareRoleProfile(profile, consent)
            .then(() =>
              setMessage(
                "Check your email to confirm sharing this profile. You are not subscribed to marketing.",
              ),
            )
            .catch((error) => setMessage(String(error)))
            .finally(() => setBusy(false));
        }}
      >
        Request sharing confirmation
      </button>
      {message && (
        <p role="status" className="helper">
          {message}
        </p>
      )}
    </details>
  );
}

export function EmailUpdates() {
  const [connected, setConnected] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (desktop)
      void api
        .contactEndpoint()
        .then((url) => setConnected(!!url))
        .catch(() => {});
  }, []);
  return (
    <section className="email-updates">
      <h3>Email updates (optional)</h3>
      <p className="helper">
        Your profile email stays on this device. It is not a subscription.{" "}
        {connected
          ? "You can separately request product updates using your saved profile email."
          : "A private email service is not connected yet."}
      </p>
      <label className="privacy-ack">
        <input
          type="checkbox"
          checked={consent}
          disabled={!connected || busy}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I want product updates by email and agree to send my saved profile email
        to the private contact service.
      </label>
      <button
        className="secondary"
        disabled={!connected || !consent || busy}
        onClick={() => {
          setBusy(true);
          void api
            .subscribeEmail(true)
            .then(() =>
              setMessage(
                "Check your inbox and confirm your email before you are added to the list.",
              ),
            )
            .catch((e) => setMessage(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        Request confirmation email
      </button>
      <p className="helper">
        Subscriptions require confirmation and include an unsubscribe link.
        Tracking and AI preferences are separate.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

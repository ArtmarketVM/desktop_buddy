import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Conversation } from "./Conversation";
import { defaultCompanionView } from "./types";
import { AppShell } from "../components/AppShell";
import { defaultUserSettings } from "../types";
import { DesktopBuddy } from "../components/DesktopBuddy";
import { defaultBuddyPreferences } from "../types";

describe("compact workspace boundaries", () => {
  it("keeps text entry compact without a permanent history panel", () => {
    const html = renderToStaticMarkup(
      <Conversation
        compact
        mode="text"
        view={defaultCompanionView}
        goal={null}
        plan={null}
        onChanged={async () => {}}
        onState={() => {}}
      />,
    );
    expect(html).toContain('rows="1"');
    expect(html).toContain("Attach text or PDF");
    expect(html).toContain("Close Buddy input");
    expect(html).not.toContain('role="log"');
    expect(html).not.toContain("Clear conversation");
    expect(html).not.toContain("What is getting in the way");
  });
  it("offers explicit recording, transcription and close controls", () => {
    const html = renderToStaticMarkup(
      <Conversation
        compact
        mode="voice"
        view={defaultCompanionView}
        goal={null}
        plan={null}
        onChanged={async () => {}}
        onState={() => {}}
      />,
    );
    expect(html).toContain("Switch to text");
    expect(html).toContain("Start recording");
    expect(html).toContain("Stop and transcribe");
    expect(html).toContain("Close voice");
    expect(html).not.toContain("Stop Windows voice typing");
  });
  it("shows Chats and collapse navigation while moving technical status out of Today", () => {
    const html = renderToStaticMarkup(
      <AppShell
        page="focus"
        onNavigate={() => {}}
        profile={defaultUserSettings.profile}
        version="0.21.0"
        update={{
          phase: "idle",
          startup: "ready",
          error: "",
          info: null,
          progress: null,
        }}
        onUpdates={() => {}}
      >
        Today
      </AppShell>,
    );
    expect(html).toContain('aria-label="Chats"');
    expect(html).toContain("Collapse sidebar");
    expect(html).not.toContain("breadcrumb");
    expect(html).not.toContain("Quick goal");
    expect(html).not.toContain("0.21.0");
    expect(html).not.toContain("Local by default");
    expect(html).not.toContain("Local profile");
  });
  it("opens the native compact input without the old bounded chat card", () => {
    const html = renderToStaticMarkup(
      <DesktopBuddy
        view={{
          preferences: defaultBuddyPreferences,
          suggestion: null,
          decision: null,
          snoozed_until: null,
          quiet_reason: null,
          companion: { ...defaultCompanionView, chat_open: true },
        }}
        onDismiss={() => {}}
        onDnd={() => {}}
      />,
    );
    expect(html).toContain("Write to Buddy");
    expect(html).toContain("Talk to Buddy");
    expect(html).toContain("desktop-compact-input");
    expect(html).not.toContain("floating-chat-card");
    expect(html).not.toContain("Move chat card");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemorySettings } from "./MemorySettings";
import {
  defaultMemoryControls,
  memoryApi,
  type MemoryOverview,
} from "../api/memory";
vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("../api/memory", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/memory")>();
  return {
    ...original,
    memoryApi: Object.fromEntries(
      Object.keys(original.memoryApi).map((key) => [key, vi.fn()]),
    ),
  };
});
let data: MemoryOverview;
beforeEach(() => {
  vi.resetAllMocks();
  data = {
    controls: { ...defaultMemoryControls },
    memories: [
      {
        id: 1,
        memory_type: "explicit_fact",
        scope: { scope_type: "goal", scope_id: 7 },
        content: "Reviewed the outline",
        event_kind: null,
        updated_at: "2026-10-12T10:00:00Z",
        pinned: false,
        archived: false,
        confidence: 1,
        evidence_count: 1,
        source: "user",
      },
    ],
    contexts: [],
    goals: [{ id: 7, title: "Hackathon" }],
    proposals: [],
    more: false,
  };
  vi.mocked(memoryApi.overview).mockImplementation(async () => data);
});
afterEach(cleanup);
async function mount() {
  render(<MemorySettings initialData={data} />);
  return userEvent.setup();
}
describe("Memory settings", () => {
  it("shows five separate switches, categories and privacy explanation", async () => {
    await mount();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    for (const name of [
      "Memory",
      "Remember work context",
      "Remember preferences",
      "Learn from feedback",
      "Remember conversation context",
    ])
      expect(
        screen.getByRole("checkbox", { name: new RegExp(`^${name}`) }),
      ).toBeTruthy();
    const filter = screen.getByRole("group", { name: "Category" });
    expect(
      within(filter)
        .getAllByRole("button")
        .map((x) => x.textContent),
    ).toEqual(
      expect.arrayContaining([
        "Work",
        "Preferences",
        "Patterns",
        "Waiting",
        "Parked contexts",
      ]),
    );
    expect(
      screen.getByText(/Memory controls do not enable tracking/),
    ).toBeTruthy();
  });
  it("Memory OFF saves the whole policy and disables subordinate switches", async () => {
    const user = await mount();
    vi.mocked(memoryApi.controls).mockImplementation(async (controls) => {
      data = { ...data, controls };
    });
    await user.click(screen.getByRole("checkbox", { name: "Memory" }));
    await waitFor(() =>
      expect(memoryApi.controls).toHaveBeenCalledWith({
        ...defaultMemoryControls,
        enabled: false,
      }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("checkbox", {
            name: /^Remember preferences/,
          }) as HTMLInputElement
        ).disabled,
      ).toBe(true),
    );
    expect(screen.getByText("Reviewed the outline")).toBeTruthy();
  });
  it.each([
    "Remember work context",
    "Remember preferences",
    "Learn from feedback",
    "Remember conversation context",
  ])("saves %s independently", async (name) => {
    const user = await mount();
    await user.click(
      screen.getByRole("checkbox", { name: new RegExp(`^${name}`) }),
    );
    await waitFor(() => expect(memoryApi.controls).toHaveBeenCalledOnce());
    const sent = vi.mocked(memoryApi.controls).mock.calls[0][0];
    expect(sent.enabled).toBe(true);
    expect(Object.values(sent).filter((v) => !v)).toHaveLength(1);
  });
  it("requires confirmation to forget an item and supports cancel", async () => {
    const user = await mount();
    await user.click(screen.getByRole("button", { name: "Forget" }));
    expect(memoryApi.forget).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
    expect(memoryApi.forget).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Forget" }));
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(memoryApi.forget).toHaveBeenCalledWith(1));
  });
  it("edits with the original version and confirms the corrected content", async () => {
    const user = await mount();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Memory content" }));
    await user.type(
      screen.getByRole("textbox", { name: "Memory content" }),
      "Corrected outline",
    );
    await user.click(screen.getByRole("button", { name: "Save memory" }));
    await waitFor(() =>
      expect(memoryApi.edit).toHaveBeenCalledWith(
        data.memories[0],
        "Corrected outline",
      ),
    );
  });
  it("pins an item without a destructive confirmation", async () => {
    const user = await mount();
    await user.click(screen.getByRole("button", { name: "Pin" }));
    await waitFor(() => expect(memoryApi.pin).toHaveBeenCalledWith(1, true));
  });
  it("clears memory with a separate confirmation and promises to retain goals and history", async () => {
    const user = await mount();
    await user.click(
      screen.getByRole("button", { name: "Clear personal memory" }),
    );
    expect(memoryApi.clear).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Goals, steps, chats, activity history, settings and API keys stay saved/,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(memoryApi.clear).toHaveBeenCalledOnce());
  });
  it("forgets only the selected goal after confirmation", async () => {
    const user = await mount();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Goal" }),
      "7",
    );
    await user.click(
      screen.getByRole("button", { name: "Forget memories about this goal" }),
    );
    expect(memoryApi.clearGoal).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(memoryApi.clearGoal).toHaveBeenCalledWith(7));
  });
  it("keeps an actionable error when a stale edit is rejected", async () => {
    vi.mocked(memoryApi.edit).mockRejectedValue(
      new Error("This memory changed. Reload before editing."),
    );
    const user = await mount();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save memory" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Reload before editing",
      ),
    );
    expect(screen.getByRole("form", { name: "Edit memory" })).toBeTruthy();
  });
  it("renders waiting and parked checkpoints and supports checkpoint editing", async () => {
    data.contexts = [
      {
        id: 2,
        goal_id: 7,
        step_id: "step-0",
        summary: "Waiting for review",
        next_action: "Revise draft",
        status: "waiting",
        last_app: null,
        last_window: null,
        waiting_for: "Reviewer",
        created_at: "2026-10-12T10:00:00Z",
        updated_at: "2026-10-12T10:00:00Z",
        pinned: false,
      },
    ];
    const user = await mount();
    await user.click(
      within(screen.getByRole("group", { name: "Category" })).getByRole(
        "button",
        { name: "Waiting" },
      ),
    );
    expect(screen.getByText("Waiting for review")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Next action" }));
    await user.type(
      screen.getByRole("textbox", { name: "Next action" }),
      "Send revision",
    );
    await user.click(screen.getByRole("button", { name: "Save memory" }));
    await waitFor(() =>
      expect(memoryApi.editContext).toHaveBeenCalledWith(
        data.contexts[0],
        "Waiting for review",
        "Send revision",
        "Reviewer",
      ),
    );
  });
  it("offers model suggestions for explicit review rather than claiming they are saved", async () => {
    data.proposals = [
      {
        id: 3,
        content: "I prefer short steps",
        created_at: "2026-10-12T10:00:00Z",
      },
    ];
    const user = await mount();
    const section = screen.getByRole("region", { name: "Memory suggestions" });
    expect(within(section).getByText(/not saved memories/)).toBeTruthy();
    await user.click(
      within(section).getByRole("button", { name: "Remember preference" }),
    );
    await waitFor(() =>
      expect(memoryApi.resolveProposal).toHaveBeenCalledWith(3, true),
    );
  });
  it("loads older pages without losing the current items", async () => {
    data.more = true;
    const user = await mount();
    vi.mocked(memoryApi.overview).mockResolvedValue({
      ...data,
      memories: [{ ...data.memories[0], id: 2, content: "Older note" }],
      more: false,
    });
    await user.click(
      screen.getByRole("button", { name: "Load more memories" }),
    );
    await waitFor(() => expect(screen.getByText("Older note")).toBeTruthy());
    expect(screen.getByText("Reviewed the outline")).toBeTruthy();
    expect(memoryApi.overview).toHaveBeenCalledWith(50);
  });
});

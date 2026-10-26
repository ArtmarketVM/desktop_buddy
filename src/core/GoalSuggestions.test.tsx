// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoalFinder } from "./GoalFinder";
import { GoalAreas } from "./Goals";
import { aiApi } from "../ai/api";
import { coreApi } from "./api";
import { emptyCore, type CoreGoal } from "./types";

vi.mock("../api/tauri", () => ({ desktop: true }));
vi.mock("../ai/api", () => ({ aiApi: { completeGoal: vi.fn() } }));
vi.mock("./api", () => ({ coreApi: { create: vi.fn() } }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(aiApi.completeGoal).mockResolvedValue([]);
  vi.mocked(coreApi.create).mockResolvedValue(emptyCore());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const tick = () => act(() => vi.advanceTimersByTimeAsync(200));
function setup(today: boolean, goals: CoreGoal[] = []) {
  const create = vi.fn().mockResolvedValue(true);
  const add = vi.fn().mockResolvedValue(true);
  const snapshot = { ...emptyCore(), goals };
  render(
    today ? (
      <GoalFinder
        snapshot={snapshot}
        disabled={false}
        showRecent={false}
        create={create}
        addToToday={add}
      />
    ) : (
      <GoalAreas
        snapshot={snapshot}
        busy={false}
        run={async (work) => {
          await work();
          return true;
        }}
      />
    ),
  );
  const input = screen.getByLabelText("Search or add a goal");
  fireEvent.focus(input);
  return { input, create, add };
}

it.each([true, false])(
  "refreshes after each character and ignores old responses (Today=%s)",
  async (today) => {
    let finishOld!: (items: string[]) => void;
    vi.mocked(aiApi.completeGoal)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(["Learn Japanese"]);
    const { input } = setup(today);
    fireEvent.change(input, { target: { value: "L" } });
    expect(aiApi.completeGoal).not.toHaveBeenCalled();
    await tick();
    expect(aiApi.completeGoal).toHaveBeenLastCalledWith("L");
    fireEvent.change(input, { target: { value: "Le" } });
    await tick();
    expect(aiApi.completeGoal).toHaveBeenLastCalledWith("Le");
    expect(screen.getByRole("option", { name: "Learn Japanese" })).toBeTruthy();
    await act(async () => {
      finishOld(["Launch a project"]);
    });
    expect(
      screen.queryByRole("option", { name: "Launch a project" }),
    ).toBeNull();
    expect(screen.getByRole("option", { name: "Learn Japanese" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("option", { name: "Learn Japanese" })).toBeNull();
    await tick();
    expect(aiApi.completeGoal).toHaveBeenCalledTimes(2);
  },
);

it.each([true, false])(
  "uses Tab to edit, then creates the selected full title (Today=%s)",
  async (today) => {
    vi.mocked(aiApi.completeGoal).mockResolvedValue([
      "Learn Japanese",
      "Learn piano",
    ]);
    const { input, create } = setup(today);
    fireEvent.change(input, { target: { value: "L" } });
    await tick();
    fireEvent.keyDown(input, { key: "Tab" });
    expect((input as HTMLInputElement).value).toBe("Learn Japanese");
    expect(create).not.toHaveBeenCalled();
    expect(coreApi.create).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Le" } });
    await tick();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    if (today)
      expect(create).toHaveBeenCalledWith("Learn piano", expect.any(String));
    else expect(coreApi.create).toHaveBeenCalledWith("Learn piano");
  },
);

it.each([true, false])(
  "keeps raw creation available on failure (Today=%s)",
  async (today) => {
    vi.mocked(aiApi.completeGoal).mockRejectedValue("offline");
    const { input, create } = setup(today);
    fireEvent.change(input, { target: { value: "Learn" } });
    await tick();
    expect(screen.getByRole("status").textContent).toContain("unavailable");
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    if (today) expect(create).toHaveBeenCalledWith("Learn", expect.any(String));
    else expect(coreApi.create).toHaveBeenCalledWith("Learn");
  },
);

it.each([true, false])(
  "does not request ideas for an exact saved title (Today=%s)",
  async (today) => {
    const saved = {
      id: 1,
      title: "Learn piano",
      status: "open",
      plan: { steps: [] },
    } as unknown as CoreGoal;
    const { input } = setup(today, [saved]);
    fireEvent.change(input, { target: { value: "  learn PIANO " } });
    await tick();
    expect(aiApi.completeGoal).not.toHaveBeenCalled();
  },
);

it("creates the raw title on clicking Create even with a saved match highlighted", async () => {
  const saved = {
    id: 1,
    title: "Learn piano",
    status: "open",
    plan: { steps: [] },
  } as unknown as CoreGoal;
  const { input, create, add } = setup(true, [saved]);
  fireEvent.change(input, { target: { value: "Learn" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Create “Learn”" }));
  });
  expect(create).toHaveBeenCalledWith("Learn", expect.any(String));
  expect(add).not.toHaveBeenCalled();
});

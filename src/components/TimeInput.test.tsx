// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TimeInput } from "./TimeInput";
afterEach(cleanup);

it.each([
  ["0930", "09:30"],
  ["2359", "23:59"],
  ["0000", "00:00"],
  ["930", "09:30"],
])(
  "types %s using only digits, with a fixed colon, and commits %s",
  async (digits, expected) => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(
      <TimeInput aria-label="Time" value="" onCommit={commit} allowEmpty />,
    );
    const input = screen.getByLabelText("Time") as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe("__:__");
    for (const digit of digits) {
      await user.keyboard(digit);
      expect(input.value[2]).toBe(":");
    }
    expect(commit).not.toHaveBeenCalled();
    await user.tab();
    expect(input.value).toBe(expected);
    expect(commit).toHaveBeenCalledExactlyOnceWith(expected);
  },
);
it("edits only selected minutes and cannot remove the colon with either delete key", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  render(<TimeInput aria-label="Time" value="09:30" onCommit={commit} />);
  const input = screen.getByLabelText("Time") as HTMLInputElement;
  await user.click(input);
  input.setSelectionRange(3, 5);
  await user.keyboard("45");
  expect(input.value).toBe("09:45");
  input.setSelectionRange(3, 3);
  await user.keyboard("{Backspace}");
  expect(input.value).toBe("0_:45");
  input.setSelectionRange(2, 2);
  await user.keyboard("{Delete}");
  expect(input.value).toBe("0_:_5");
  input.select();
  await user.keyboard("1830{Enter}");
  expect(input.value).toBe("18:30");
  expect(commit).toHaveBeenCalledExactlyOnceWith("18:30");
});
it.each(["0930", "9:30", "930", "1:30 pm"])(
  "normalizes a pasted time %s",
  async (text) => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<TimeInput aria-label="Time" value="18:00" onCommit={commit} />);
    await user.click(screen.getByLabelText("Time"));
    await user.paste(text);
    await user.tab();
    expect(commit).toHaveBeenCalledExactlyOnceWith(
      text.includes("pm") ? "13:30" : "09:30",
    );
  },
);
it.each(["2400", "2360", "9999"])(
  "rejects invalid %s without saving it",
  async (text) => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<TimeInput aria-label="Time" value="18:00" onCommit={commit} />);
    await user.click(screen.getByLabelText("Time"));
    await user.keyboard(text);
    await user.tab();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(commit).not.toHaveBeenCalled();
  },
);
it("clears optional times and rejects a missing hour instead of saving minutes as hours", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  render(
    <TimeInput aria-label="Time" value="09:30" onCommit={commit} allowEmpty />,
  );
  const input = screen.getByLabelText("Time") as HTMLInputElement;
  await user.click(input);
  input.setSelectionRange(0, 2);
  await user.keyboard("{Delete}");
  await user.tab();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(commit).not.toHaveBeenCalled();
  await user.click(input);
  await user.keyboard("{Backspace}");
  await user.tab();
  expect(input.value).toBe("__:__");
  expect(commit).toHaveBeenCalledExactlyOnceWith("");
});
it("does not resend an Enter commit when blur follows before the parent saves", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  render(<TimeInput aria-label="Time" value="18:00" onCommit={commit} />);
  await user.click(screen.getByLabelText("Time"));
  await user.keyboard("1930{Enter}{Tab}");
  expect(commit).toHaveBeenCalledExactlyOnceWith("19:30");
});
it("accepts accessibility/autofill changes and shows a fixed separator", () => {
  render(<TimeInput aria-label="Time" value="" onCommit={vi.fn()} />);
  const input = screen.getByLabelText("Time") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "0930" } });
  expect(input.value).toBe("09:30");
});

it("supports undo/redo and pasting selected minutes without changing hours", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  render(<TimeInput aria-label="Time" value="09:30" onCommit={commit} />);
  const input = screen.getByLabelText("Time") as HTMLInputElement;
  await user.click(input);
  input.setSelectionRange(3, 5);
  await user.paste("45");
  expect(input.value).toBe("09:45");
  await user.keyboard("{Control>}z{/Control}");
  expect(input.value).toBe("09:30");
  await user.keyboard("{Control>}y{/Control}");
  expect(input.value).toBe("09:45");
  await user.tab();
  expect(commit).toHaveBeenCalledExactlyOnceWith("09:45");
});

it("Escape never saves a draft when closing a popup immediately moves focus", async () => {
  const user = userEvent.setup();
  const commit = vi.fn();
  render(
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape")
          event.currentTarget.querySelector("button")?.focus();
      }}
    >
      <TimeInput aria-label="Time" value="09:30" onCommit={commit} />
      <button>Calendar trigger</button>
    </div>,
  );
  await user.click(screen.getByLabelText("Time"));
  await user.keyboard("1730{Escape}");
  expect(commit).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Time") as HTMLInputElement).value).toBe(
    "09:30",
  );
});

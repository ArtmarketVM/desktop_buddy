// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineText } from "./InlineText";
import { PriorityPicker, priorityRank } from "./Priority";

function type(el: HTMLElement, text: string) {
  fireEvent.focus(el);
  el.textContent = text;
  fireEvent.input(el);
}
describe("inline text", () => {
  afterEach(cleanup);
  it("saves edited text on Enter, restores on Escape and deletes when emptied", () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
      <InlineText
        value="Write the post"
        label="Goal title"
        onSave={onSave}
        onDelete={onDelete}
      />,
    );
    const el = screen.getByRole("textbox", { name: "Goal title" });
    expect(el.getAttribute("contenteditable")).toBe("plaintext-only");
    type(el, "Write the launch post");
    fireEvent.blur(el);
    expect(onSave).toHaveBeenCalledWith("Write the launch post");
    type(el, "scrap");
    fireEvent.keyDown(el, { key: "Escape" });
    expect(el.textContent).toBe("Write the post");
    expect(onSave).toHaveBeenCalledTimes(1);
    type(el, "   ");
    fireEvent.blur(el);
    expect(onDelete).toHaveBeenCalledTimes(1);
    type(el, "");
    fireEvent.keyDown(el, { key: "Backspace" });
    expect(onDelete).toHaveBeenCalledTimes(2);
  });
  it("ranks urgent first and none last, and picks a priority from the tag", () => {
    expect(
      [null, "low", "urgent", "high", "medium"].map((p) =>
        priorityRank(p as never),
      ),
    ).toEqual([4, 3, 0, 1, 2]);
    const onChange = vi.fn();
    render(
      <PriorityPicker
        priority="medium"
        disabled={false}
        label="Goal"
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Priority for Goal: Medium/ })
        .textContent,
    ).toBe("Medium");
    fireEvent.click(screen.getByRole("button", { name: /Priority for Goal/ }));
    fireEvent.click(screen.getByRole("option", { name: /Urgent/ }));
    expect(onChange).toHaveBeenCalledWith("urgent");
  });
});

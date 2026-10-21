// @vitest-environment jsdom
import { queryClient } from "../data/client";
import { noticedQuery } from "../data/resources";
import { useLayoutEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { NoticedWork } from "./NoticedWork";
const hooks = vi.hoisted(() => ({
  stop: vi.fn(),
  receive: undefined as undefined | (() => void),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../api/tauri", () => ({ desktop: true }));
const offer = {
  id: "opaque-offer",
  title: "Handle unrelated emails",
  seconds: 480,
  app: "chrome",
  completed: true,
};
beforeEach(() => {
  queryClient.invalidate(undefined, true);
  vi.clearAllMocks();
  hooks.receive = undefined;
  vi.mocked(invoke).mockImplementation(async (name) =>
    name === "get_unplanned_work_suggestion" ? offer : 12,
  );
  vi.mocked(listen).mockImplementation(async (_name, receive) => {
    hooks.receive = () => receive({ payload: offer } as never);
    return hooks.stop;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("recovers noticed work, displays measured minutes, and lets the user rename it before confirmation", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  render(<NoticedWork onChanged={changed} />);
  const title = await screen.findByRole("textbox", {
    name: "Noticed work title",
  });
  expect(screen.getByText("8m observed today")).toBeTruthy();
  expect(invoke).not.toHaveBeenCalledWith(
    "respond_unplanned_work_suggestion",
    expect.anything(),
  );
  fireEvent.change(title, { target: { value: "Reply to customer emails" } });
  fireEvent.click(screen.getByRole("button", { name: "Add completed" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("respond_unplanned_work_suggestion", {
      id: offer.id,
      action: "add",
      title: "Reply to customer emails",
    }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(screen.queryByRole("region")).toBeNull();
});
it("keeps a title edited as a cached offer first appears", async () => {
  noticedQuery.setData(offer);
  function EditOnFirstPaint() {
    useLayoutEffect(() => {
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "Reply to customer emails" },
      });
    }, []);
    return <NoticedWork onChanged={async () => {}} />;
  }
  render(<EditOnFirstPaint />);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Reply to customer emails",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add completed" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("respond_unplanned_work_suggestion", {
      id: offer.id,
      action: "add",
      title: "Reply to customer emails",
    }),
  );
});
it.each([
  ["Not now", "not_now"],
  ["Skip", "dismiss"],
])("%s does not add a goal", async (label, action) => {
  render(<NoticedWork onChanged={async () => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: label }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("respond_unplanned_work_suggestion", {
      id: offer.id,
      action,
      title: null,
    }),
  );
});
it("keeps an edited title when a refreshed duration arrives and removes a revoked offer", async () => {
  render(<NoticedWork onChanged={async () => {}} />);
  fireEvent.change(await screen.findByRole("textbox"), {
    target: { value: "Customer emails" },
  });
  vi.mocked(invoke).mockResolvedValue({ ...offer, seconds: 600 });
  act(() => hooks.receive?.());
  expect(await screen.findByText("10m observed today")).toBeTruthy();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Customer emails",
  );
  vi.mocked(invoke).mockResolvedValue(null);
  act(() => hooks.receive?.());
  await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
});
it("starts a fresh draft for a new offer and ignores completion of the old offer", async () => {
  let currentOffer = offer;
  let finish!: () => void;
  vi.mocked(invoke).mockImplementation(async (name) => {
    if (name === "get_unplanned_work_suggestion") return currentOffer;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return 12;
  });
  render(<NoticedWork onChanged={async () => {}} />);
  fireEvent.change(await screen.findByRole("textbox"), {
    target: { value: "Customer emails" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add completed" }));
  currentOffer = { ...offer, id: "next-offer", title: "Prepare the agenda" };
  act(() => noticedQuery.setData(currentOffer));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Prepare the agenda",
  );
  await act(async () => finish());
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Prepare the agenda",
  );
});
it("keeps the offer available when saving fails and never reports a completed goal", async () => {
  const changed = vi.fn();
  vi.mocked(invoke).mockImplementation(async (name) => {
    if (name === "get_unplanned_work_suggestion") return offer;
    throw new Error("Expired");
  });
  render(<NoticedWork onChanged={changed} />);
  const add = await screen.findByRole("button", { name: "Add completed" });
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toBeTruthy();
  cleanup();
  await waitFor(() =>
    expect(hooks.stop).toHaveBeenCalledTimes(
      vi.mocked(listen).mock.calls.length,
    ),
  );
});

it("offers an open Today task for ongoing work and never labels it completed", async () => {
  vi.mocked(invoke).mockResolvedValue({ ...offer, completed: false });
  render(<NoticedWork onChanged={async () => {}} />);
  expect(
    await screen.findByRole("button", { name: "Add to Today" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add completed" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Chat" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("respond_unplanned_work_suggestion", {
      id: offer.id,
      action: "chat",
      title: null,
    }),
  );
});

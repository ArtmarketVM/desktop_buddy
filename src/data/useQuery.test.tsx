// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, type Query } from "./queryClient";
import { useQuery } from "./useQuery";
afterEach(cleanup);
function Consumer({ query }: { query: Query<string> }) {
  const state = useQuery(query);
  return <p>{state.error || (state.ready ? state.data : "Loading")}</p>;
}
it("deduplicates Strict Mode consumers and never shows an old period after changing keys", async () => {
  const client = new QueryClient();
  let oldResolve!: (text: string) => void;
  const oldLoad = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        oldResolve = resolve;
      }),
  );
  const old = client.query("period:old", ["workspace"], "", oldLoad);
  const current = client.query(
    "period:new",
    ["workspace"],
    "",
    async () => "New period",
  );
  const view = render(
    <StrictMode>
      <Consumer query={old} />
      <Consumer query={old} />
    </StrictMode>,
  );
  await waitFor(() => expect(oldLoad).toHaveBeenCalledOnce());
  view.rerender(
    <StrictMode>
      <Consumer query={current} />
    </StrictMode>,
  );
  await screen.findByText("New period");
  oldResolve("Old period");
  await waitFor(() => expect(screen.queryByText("Old period")).toBeNull());
});
it("recovers an initially failed read without remounting", async () => {
  const client = new QueryClient();
  const load = vi
    .fn()
    .mockRejectedValueOnce("private backend failure")
    .mockResolvedValueOnce("Recovered");
  const query = client.query("recover", ["workspace"], "", load);
  render(<Consumer query={query} />);
  await screen.findByText(/Couldn't refresh/);
  expect(document.body.textContent).not.toContain("private backend failure");
  client.invalidate(["workspace"]);
  await screen.findByText("Recovered");
});

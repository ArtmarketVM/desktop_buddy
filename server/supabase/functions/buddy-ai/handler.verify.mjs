import { test } from "node:test";
import assert from "node:assert/strict";
import { createGateway, validateChat } from "./handler.ts";

const jwt = "aaa.bbb.ccc";
const user = "11111111-1111-4111-8111-111111111111";
const chat = () => ({
  model: "moonshotai/Kimi-K3",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Summarize the fictional checklist" }],
});
function fixture({
  authorized = true,
  reserved = true,
  providerStatus = 200,
} = {}) {
  const calls = [];
  const env = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "server-role-fixture",
    SUPABASE_ANON_KEY: "public-anon-fixture",
    NEBIUS_API_KEY: "private-nebius-fixture",
    TAVILY_API_KEY: "private-tavily-fixture",
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user"))
      return Response.json(
        { id: user, role: "authenticated" },
        { status: authorized ? 200 : 401 },
      );
    if (url.includes("/rpc/")) return Response.json(reserved);
    if (url.endsWith("/models"))
      return Response.json({
        data: [
          { id: "moonshotai/Kimi-K3", private: "not returned" },
          { id: "not-allowed" },
        ],
      });
    if (url.endsWith("/usage"))
      return Response.json({
        key: { api_key: "must-never-leave-server", usage: 999 },
      });
    return Response.json(
      { choices: [{ message: { content: "Synthetic answer" } }] },
      { status: providerStatus },
    );
  };
  return { calls, handler: createGateway({ env: (name) => env[name], fetch }) };
}
function request(
  path = "/nebius/v1/chat/completions",
  body = chat(),
  token = jwt,
) {
  return new Request(
    "https://project.supabase.co/functions/v1/buddy-ai" + path,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}
test("a verified user is billed atomically before a fixed upstream request; provider keys stay server-side", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(
    calls[1].url,
    "https://project.supabase.co/rest/v1/rpc/buddy_reserve_ai",
  );
  assert.equal(JSON.parse(calls[1].options.body).p_user, user);
  assert.equal(
    calls[2].url,
    "https://api.tokenfactory.nebius.com/v1/chat/completions",
  );
  assert.equal(
    calls[2].options.headers.Authorization,
    "Bearer private-nebius-fixture",
  );
  const raw = await response.text();
  assert.ok(!raw.includes("private-nebius-fixture"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("missing or invalid auth never reaches quota or provider", async () => {
  for (const token of ["", "public-anon-fixture"]) {
    const f = fixture();
    assert.equal(
      (await f.handler(request(undefined, chat(), token))).status,
      401,
    );
    assert.equal(f.calls.length, 0);
  }
  const f = fixture({ authorized: false });
  assert.equal((await f.handler(request())).status, 401);
  assert.equal(f.calls.length, 1);
});
test("exhausted budgets fail closed without upstream calls", async () => {
  const f = fixture({ reserved: false });
  assert.equal((await f.handler(request())).status, 429);
  assert.equal(f.calls.length, 2);
});
test("arbitrary URLs, unlisted models and expensive unsupported operations are rejected", async () => {
  for (const body of [
    { ...chat(), model: "arbitrary-model" },
    { ...chat(), max_tokens: 999999 },
    { ...chat(), stream: true },
    { ...chat(), url: "https://attacker.invalid" },
    { ...chat(), messages: [{ role: "tool", content: "x" }] },
  ]) {
    const f = fixture();
    assert.equal((await f.handler(request(undefined, body))).status, 400);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  assert.equal(
    (await f.handler(request("/https://attacker.invalid"))).status,
    404,
  );
  assert.equal(f.calls.length, 0);
});
test("image input permits bounded data images, never provider-side remote image fetches", () => {
  assert.throws(() =>
    validateChat({
      ...chat(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "https://internal.invalid/private" },
            },
          ],
        },
      ],
    }),
  );
  assert.ok(
    validateChat({
      ...chat(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,YQ==" },
            },
          ],
        },
      ],
    }) > 0,
  );
  assert.throws(() =>
    validateChat({
      ...chat(),
      messages: [{ role: "user", content: "x".repeat(160001) }],
    }),
  );
});
test("health checks actually reach the selected provider but filter account/private fields", async () => {
  for (const [path, expected] of [
    ["/nebius/v1/models", { data: [{ id: "moonshotai/Kimi-K3" }] }],
    ["/tavily/usage", { key: { configured: true } }],
  ]) {
    const f = fixture();
    const response = await f.handler(
      new Request("https://project.supabase.co/functions/v1/buddy-ai" + path, {
        headers: { Authorization: "Bearer " + jwt },
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    assert.equal(f.calls.length, 3);
  }
});
test("provider failures are sanitized and are never automatically replayed", async () => {
  const f = fixture({ providerStatus: 503 });
  const response = await f.handler(request());
  assert.equal(response.status, 503);
  assert.equal(f.calls.length, 3);
  assert.ok(!(await response.text()).includes("private"));
});
test("Tavily uses the fixed search endpoint with bounded supported search options", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.handler(
        request("/tavily/search", {
          query: "public docs",
          search_depth: "advanced",
          max_results: 5,
          topic: "general",
          include_raw_content: false,
        }),
      )
    ).status,
    200,
  );
  assert.equal(f.calls[2].url, "https://api.tavily.com/search");
  const bad = fixture();
  assert.equal(
    (
      await bad.handler(
        request("/tavily/search", {
          query: "public docs",
          search_depth: "advanced",
          max_results: 100,
        }),
      )
    ).status,
    400,
  );
});

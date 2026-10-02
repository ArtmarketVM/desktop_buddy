import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

// Isolated HTTP contract tests. No database, email provider or external network is used.
const source = readFileSync(
  new URL("./supabase/functions/buddy-contact/index.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, strict: true },
  reportDiagnostics: true,
});
assert.equal(
  compiled.diagnostics?.filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);
function fixture({
  limited = false,
  mailError = false,
  research = false,
  expired = false,
} = {}) {
  let handler;
  const calls = [];
  const secrets = {
    SUPABASE_URL: "https://database.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-server-only",
    RESEND_API_KEY: "test-mail-only",
    CONTACT_FROM: "Buddy <buddy@example.com>",
    CONTACT_PUBLIC_URL: "https://contact.test/buddy-contact",
  };
  runInNewContext(compiled.outputText, {
    Deno: {
      env: { get: (name) => secrets[name] },
      serve: (fn) => {
        handler = fn;
      },
    },
    crypto: webcrypto,
    TextEncoder,
    Response,
    URL,
    URLSearchParams,
    Request,
    AbortSignal,
    fetch: async (url, options) => {
      const call = {
        url,
        ...options,
        body: options?.body ? JSON.parse(options.body) : null,
      };
      calls.push(call);
      if (url === "https://api.resend.com/emails")
        return Response.json(
          mailError ? { secret: "private provider response" } : { id: "mail" },
          { status: mailError ? 500 : 200 },
        );
      assert.ok(url.startsWith("https://database.test/rest/v1/"));
      if (url.includes("rpc/buddy_contact_take_slot"))
        return Response.json(!limited);
      if (url.includes("confirmation_hash=eq."))
        return Response.json(
          expired
            ? []
            : [
                {
                  email: "person@example.com",
                  confirmation_kind: research
                    ? "role_research"
                    : "email_updates",
                  pending_research: research
                    ? {
                        role: "other",
                        custom_role: "Musician",
                        applications: ["Ableton Live"],
                      }
                    : null,
                },
              ],
        );
      if (url.includes("buddy_unsubscribe_tokens?"))
        return Response.json([{ email: "person@example.com" }]);
      return Response.json([]);
    },
  });
  const post = (body) =>
    handler(
      new Request("https://contact.test/buddy-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return { handler, calls, post };
}
test("feedback sends only explicit fields to the fixed owner mailbox", async () => {
  const f = fixture();
  const response = await f.post({
    kind: "feedback",
    message: "An idea",
    reply_email: "",
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: "accepted" });
  const mail = f.calls.find(
    (call) => call.url === "https://api.resend.com/emails",
  );
  assert.deepEqual(Array.from(mail.body.to), ["artmarket.vm@gmail.com"]);
  assert.equal(mail.body.text, "An idea");
  assert.equal(mail.body.reply_to, undefined);
  assert.ok(!JSON.stringify(f.calls).includes("window_title"));
});
test("subscription requires separate consent and confirmation, stores hashes, and keeps existing consent", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.post({
        kind: "subscribe",
        email: "person@example.com",
        consent: false,
      })
    ).status,
    400,
  );
  assert.equal(f.calls.length, 0);
  const response = await f.post({
    kind: "subscribe",
    email: "person@example.com",
    consent: true,
  });
  assert.deepEqual(await response.json(), { status: "confirmation_required" });
  const patch = f.calls.find(
    (call) =>
      call.method === "PATCH" && call.url.includes("buddy_subscribers?email="),
  );
  assert.equal(patch.body.confirmed_at, undefined);
  assert.equal(patch.body.unsubscribed_at, undefined);
  assert.match(patch.body.confirmation_hash, /^[a-f0-9]{64}$/);
  const mail = f.calls.find(
    (call) => call.url === "https://api.resend.com/emails",
  );
  const rawToken = new URL(
    mail.body.text.match(/https:\/\/\S+/)[0],
  ).searchParams.get("token");
  assert.notEqual(patch.body.confirmation_hash, rawToken);
  assert.ok(
    f.calls.some(
      (call) =>
        call.url.endsWith("buddy_unsubscribe_tokens") && call.body.token_hash,
    ),
  );
});
test("email link scanners cannot change a subscription by GET", async () => {
  const f = fixture();
  const response = await f.handler(
    new Request(
      `https://contact.test/buddy-contact?action=confirm&token=${"a".repeat(64)}`,
    ),
  );
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('form method="post"'));
  assert.equal(f.calls.length, 0);
});
test("rate caps and provider failures cannot produce a false delivery success", async () => {
  const body = { kind: "feedback", message: "A wish", reply_email: "" };
  const capped = fixture({ limited: true });
  assert.equal((await capped.post(body)).status, 429);
  assert.ok(
    !capped.calls.some((call) => call.url === "https://api.resend.com/emails"),
  );
  const failed = fixture({ mailError: true });
  const response = await failed.post(body);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "service_unavailable" });
  assert.ok(!failed.calls.some((call) => call.body?.delivered_at));
});
test("old unsubscribe links remain usable and clear pending confirmation", async () => {
  const f = fixture();
  const response = await f.handler(
    new Request("https://contact.test/buddy-contact", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=unsubscribe&token=${"b".repeat(64)}`,
    }),
  );
  assert.deepEqual(await response.json(), { status: "unsubscribed" });
  const patch = f.calls.find((call) => call.method === "PATCH");
  assert.ok(patch.url.includes("email=eq.person%40example.com"));
  assert.equal(patch.body.confirmation_hash, null);
  assert.ok(patch.body.unsubscribed_at);
});

test("role research needs separate consent and does not subscribe anyone to marketing", async () => {
  const body = {
    kind: "role_research",
    consent: true,
    email: "person@example.com",
    role: "other",
    custom_role: "Musician",
    applications: ["Ableton Live"],
  };
  const f = fixture();
  assert.equal((await f.post({ ...body, consent: false })).status, 400);
  assert.equal((await f.post({ ...body, custom_role: "" })).status, 400);
  assert.equal(
    (await f.post({ ...body, applications: Array(21).fill("App") })).status,
    400,
  );
  assert.equal(f.calls.length, 0);
  assert.equal((await f.post(body)).status, 202);
  const patch = f.calls.find((call) => call.method === "PATCH");
  assert.equal(patch.body.confirmation_kind, "role_research");
  assert.equal(patch.body.pending_research.custom_role, "Musician");
  assert.equal(patch.body.confirmed_at, undefined);
  assert.equal(patch.body.research_confirmed_at, undefined);
  const mail = f.calls.find(
    (call) => call.url === "https://api.resend.com/emails",
  );
  assert.ok(mail.body.text.includes("does not subscribe you to marketing"));
  assert.ok(mail.body.text.includes("action=remove_profile"));
});

test("research confirmation and removal leave marketing consent unchanged", async () => {
  const confirm = fixture({ research: true });
  const action = (kind) =>
    new Request("https://contact.test/buddy-contact", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=${kind}&token=${"a".repeat(64)}`,
    });
  assert.equal((await confirm.handler(action("confirm"))).status, 200);
  const update = confirm.calls.find((call) => call.method === "PATCH");
  assert.equal(update.body.role_id, "other");
  assert.equal(update.body.custom_role, "Musician");
  assert.equal(update.body.confirmed_at, undefined);
  assert.equal(update.body.unsubscribed_at, undefined);
  const remove = fixture();
  assert.equal((await remove.handler(action("remove_profile"))).status, 200);
  const cleanup = remove.calls.find((call) => call.method === "PATCH");
  assert.equal(cleanup.body.role_id, null);
  assert.equal(cleanup.body.research_confirmed_at, null);
  assert.equal(cleanup.body.unsubscribed_at, undefined);
  const invalid = fixture({ expired: true });
  assert.equal((await invalid.handler(action("confirm"))).status, 400);
  assert.ok(!invalid.calls.some((call) => call.method === "PATCH"));
});

test("research link scanners cannot confirm or remove a profile", async () => {
  const f = fixture();
  for (const action of ["confirm", "remove_profile"]) {
    const result = await f.handler(
      new Request(
        `https://contact.test/buddy-contact?action=${action}&token=${"a".repeat(64)}`,
      ),
    );
    assert.equal(result.status, 200);
  }
  assert.equal(f.calls.length, 0);
});

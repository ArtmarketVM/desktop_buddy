// Server-only template. Deploy after configuring your private project and verified sender.
// Never copy these secrets into Tauri, Vite, an installer, or the public repository.
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Server configuration unavailable");
  return value;
};
const json = (status: string, code = 200) =>
  Response.json({ status }, { status: code });
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const validEmail = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(value);
const roleIds = [
  "software_engineer",
  "founder",
  "product_manager",
  "designer",
  "marketing",
  "sales",
  "business_development",
  "operations",
  "other",
];
const validResearch = (body: {
  role: unknown;
  custom_role: unknown;
  applications: unknown;
}) =>
  typeof body.role === "string" &&
  roleIds.includes(body.role) &&
  typeof body.custom_role === "string" &&
  [...body.custom_role].length <= 120 &&
  !/[\x00-\x1f\x7f]/.test(body.custom_role) &&
  (body.role !== "other" || !!body.custom_role.trim()) &&
  Array.isArray(body.applications) &&
  body.applications.length <= 20 &&
  body.applications.every(
    (app: unknown) =>
      typeof app === "string" &&
      !!app.trim() &&
      [...app].length <= 80 &&
      !/[\x00-\x1f\x7f]/.test(app),
  );

async function db(
  path: string,
  method = "GET",
  body?: unknown,
  preference?: string,
) {
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
      ...(preference ? { Prefer: preference } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Database request failed");
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function send(
  to: string,
  subject: string,
  text: string,
  id: string,
  reply?: string,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": id,
    },
    body: JSON.stringify({
      from: env("CONTACT_FROM"),
      to: [to],
      subject,
      text,
      ...(reply ? { reply_to: reply } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Email delivery failed");
}
async function slot(bucket: string, limit: number) {
  const hour = Math.floor(Date.now() / 3600000);
  return (
    (await db("rpc/buddy_contact_take_slot", "POST", {
      p_bucket: `${hour}:${bucket}`,
      p_limit: limit,
    })) === true
  );
}
function publicURL(action: string, value: string) {
  const url = new URL(env("CONTACT_PUBLIC_URL"));
  if (url.protocol !== "https:") throw new Error("HTTPS is required");
  url.searchParams.set("action", action);
  url.searchParams.set("token", value);
  return url.toString();
}

Deno.serve(async (request: Request) => {
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      // GET never changes consent: email scanners can safely inspect the link.
      const action = url.searchParams.get("action");
      const value = url.searchParams.get("token");
      if (
        !["confirm", "unsubscribe", "remove_profile"].includes(action ?? "") ||
        !value ||
        !/^[a-f0-9]{64}$/.test(value)
      )
        return json("invalid_request", 400);
      const label =
        action === "confirm"
          ? "Confirm your Desktop Buddy request"
          : action === "remove_profile"
            ? "Remove shared role profile"
            : "Unsubscribe from email updates";
      return new Response(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Desktop Buddy</title><body><main><h1>${label}</h1><p>Choose below to update your email preference.</p><form method="post"><input type="hidden" name="action" value="${action}"><input type="hidden" name="token" value="${value}"><button>${label}</button></form></main></body></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy":
              "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      );
    }
    if (request.method !== "POST") return json("method_not_allowed", 405);
    if (
      request.headers.get("content-length") &&
      Number(request.headers.get("content-length")) > 8192
    )
      return json("invalid_request", 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192)
      return json("invalid_request", 413);
    if (
      request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    ) {
      const fields = new URLSearchParams(raw);
      const action = fields.get("action"),
        value = fields.get("token");
      if (!value || !/^[a-f0-9]{64}$/.test(value))
        return json("invalid_request", 400);
      if (!(await slot("token-actions", 100))) return json("rate_limited", 429);
      if (action === "confirm") {
        const filter = `buddy_subscribers?confirmation_hash=eq.${await hash(value)}&confirmation_expires_at=gt.${encodeURIComponent(new Date().toISOString())}`;
        const rows = await db(
          `${filter}&select=email,confirmation_kind,pending_research`,
        );
        if (!rows?.length) return json("expired_or_invalid", 400);
        const research = rows[0].confirmation_kind === "role_research";
        if (research && !validResearch(rows[0].pending_research ?? {}))
          return json("expired_or_invalid", 400);
        const confirmed = await db(
          `${filter}&select=email`,
          "PATCH",
          {
            ...(research
              ? {
                  role_id: rows[0].pending_research.role,
                  custom_role: rows[0].pending_research.custom_role,
                  applications: rows[0].pending_research.applications,
                  research_confirmed_at: new Date().toISOString(),
                  research_consent_version: "role-research-v1",
                }
              : {
                  confirmed_at: new Date().toISOString(),
                  unsubscribed_at: null,
                }),
            confirmation_hash: null,
            confirmation_expires_at: null,
            pending_research: null,
          },
          "return=representation",
        );
        return json(
          confirmed?.length ? "confirmed" : "expired_or_invalid",
          confirmed?.length ? 200 : 400,
        );
      }
      if (action === "unsubscribe" || action === "remove_profile") {
        const rows = await db(
          `buddy_unsubscribe_tokens?token_hash=eq.${await hash(value)}&select=email`,
        );
        if (rows?.length)
          await db(
            `buddy_subscribers?email=eq.${encodeURIComponent(rows[0].email)}`,
            "PATCH",
            {
              ...(action === "unsubscribe"
                ? { unsubscribed_at: new Date().toISOString() }
                : {
                    role_id: null,
                    custom_role: null,
                    applications: [],
                    research_confirmed_at: null,
                    research_consent_version: null,
                  }),
              confirmation_hash: null,
              confirmation_expires_at: null,
              pending_research: null,
            },
          );
        return json(
          action === "unsubscribe" ? "unsubscribed" : "profile_removed",
        );
      }
      return json("invalid_request", 400);
    }
    const body = JSON.parse(raw);
    if (
      !body ||
      !["subscribe", "feedback", "role_research"].includes(body.kind)
    )
      return json("invalid_request", 400);
    const address = body.kind === "feedback" ? body.reply_email : body.email;
    if (address && !validEmail(address)) return json("invalid_request", 400);
    if (
      body.kind !== "feedback" &&
      (body.consent !== true || !validEmail(body.email))
    )
      return json("consent_required", 400);
    if (body.kind === "role_research" && !validResearch(body))
      return json("invalid_request", 400);
    if (
      body.kind === "feedback" &&
      (typeof body.message !== "string" ||
        [...body.message].length > 2000 ||
        typeof body.reply_email !== "string")
    )
      return json("invalid_request", 400);
    // A server-owned global cap bounds email-provider spending even without a trustworthy client IP.
    if (
      !(await slot("all-email", 100)) ||
      !(await slot(`${body.kind}:${await hash(address || "anonymous")}`, 3))
    )
      return json("rate_limited", 429);
    if (body.kind === "feedback") {
      const id = crypto.randomUUID();
      await db("buddy_feedback", "POST", {
        id,
        message: body.message,
        reply_email: body.reply_email || null,
      });
      await send(
        "artmarket.vm@gmail.com",
        "Desktop Buddy feedback",
        body.message || "No message was added.",
        `feedback/${id}`,
        body.reply_email || undefined,
      );
      await db(`buddy_feedback?id=eq.${id}`, "PATCH", {
        delivered_at: new Date().toISOString(),
      });
      return json("accepted", 202);
    }
    const email = body.email.trim().toLowerCase();
    const research = body.kind === "role_research";
    const confirm = token(),
      unsubscribe = token();
    const filter = `buddy_subscribers?email=eq.${encodeURIComponent(email)}`;
    // Upsert only the key, then patch pending confirmation. Never revoke existing consent on a request.
    await db(
      "buddy_subscribers?on_conflict=email",
      "POST",
      { email },
      "resolution=ignore-duplicates",
    );
    await db(filter, "PATCH", {
      confirmation_hash: await hash(confirm),
      confirmation_expires_at: new Date(Date.now() + 86400000).toISOString(),
      requested_at: new Date().toISOString(),
      confirmation_kind: research ? "role_research" : "email_updates",
      pending_research: research
        ? {
            role: body.role,
            custom_role: body.role === "other" ? body.custom_role.trim() : "",
            applications: body.applications.map((app: string) => app.trim()),
          }
        : null,
    });
    await db("buddy_unsubscribe_tokens", "POST", {
      email,
      token_hash: await hash(unsubscribe),
    });
    await send(
      email,
      research
        ? "Confirm sharing your Desktop Buddy role"
        : "Confirm Desktop Buddy email updates",
      research
        ? `You chose to share your email, role (${body.role === "other" ? body.custom_role.trim() : body.role}) and declared apps (${body.applications.join(", ") || "none"}) for product research. This does not subscribe you to marketing.\nConfirm here:\n${publicURL("confirm", confirm)}\n\nIf you did not request this, ignore it. Remove your shared role profile at any time:\n${publicURL("remove_profile", unsubscribe)}`
        : `You requested product updates. Confirm here:\n${publicURL("confirm", confirm)}\n\nIf you did not request this, ignore this email.\nUnsubscribe at any time:\n${publicURL("unsubscribe", unsubscribe)}`,
      `subscribe/${crypto.randomUUID()}`,
    );
    return json("confirmation_required", 202);
  } catch {
    // Never return/log email addresses, tokens, provider responses or server secrets.
    return json("service_unavailable", 503);
  }
});

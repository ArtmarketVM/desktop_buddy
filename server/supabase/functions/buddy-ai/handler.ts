// Runtime secrets never leave this function. No content or credentials are logged.
type Environment = (name: string) => string | undefined;
type Dependencies = { env: Environment; fetch: typeof fetch };
const MODELS = new Set([
  "nvidia/nemotron-3-super-120b-a12b",
  "moonshotai/Kimi-K3",
  "nvidia/Nemotron-3.5-Super-VL",
]);
const BASE = "/buddy-ai";
// Match the desktop's existing four-image / 12 MB decoded attachment budget.
const MAX_BODY = 17000000;
const MAX_RESPONSE = 2000000;
const reply = (status: number, message: string) =>
  Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
async function bounded(
  response: Response | Request,
  limit: number,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit)
    throw Error("size");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
export function validateChat(body: Record<string, unknown>): number {
  const fields = new Set([
    "model",
    "messages",
    "temperature",
    "top_p",
    "max_tokens",
    "response_format",
    "chat_template_kwargs",
    "reasoning_effort",
    "stop",
    "seed",
    "frequency_penalty",
    "presence_penalty",
  ]);
  if (
    Object.keys(body).some((k) => !fields.has(k)) ||
    !MODELS.has(String(body.model)) ||
    !Array.isArray(body.messages) ||
    !body.messages.length ||
    body.messages.length > 128 ||
    !Number.isInteger(body.max_tokens) ||
    Number(body.max_tokens) < 1 ||
    Number(body.max_tokens) > 8192
  )
    throw Error("payload");
  let images = 0,
    imageBytes = 0,
    textBytes = 0;
  const encoder = new TextEncoder();
  for (const message of body.messages) {
    if (
      !message ||
      !["system", "user", "assistant"].includes(message.role) ||
      Object.keys(message).some((k) => !["role", "content"].includes(k))
    )
      throw Error("message");
    if (typeof message.content === "string")
      textBytes += encoder.encode(message.content).length;
    else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === "text" && typeof part.text === "string")
          textBytes += encoder.encode(part.text).length;
        else if (
          part?.type === "image_url" &&
          typeof part.image_url?.url === "string" &&
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
            part.image_url.url,
          ) &&
          part.image_url.url.length <= 6000050
        ) {
          images++;
          imageBytes += part.image_url.url.length;
        } else throw Error("content");
      }
    } else throw Error("content");
  }
  if (images > 4 || imageBytes > 16000200 || textBytes > 160000)
    throw Error("content budget");
  // Conservative reservation units, not a quoted currency price. Timeouts stay charged.
  return textBytes + Number(body.max_tokens) * 8 + images * 16384;
}
export function createGateway(dependencies: Dependencies) {
  const { env, fetch: request } = dependencies;
  return async (req: Request): Promise<Response> => {
    // The hosted gateway strips /functions/v1 before invoking the runtime.
    const path = new URL(req.url).pathname.replace(
      /^\/functions\/v1(?=\/buddy-ai\/)/,
      "",
    );
    const routes: Record<
      string,
      { method: string; url: string; secret: string; kind: string }
    > = {
      [`${BASE}/nebius/v1/chat/completions`]: {
        method: "POST",
        url: "https://api.tokenfactory.nebius.com/v1/chat/completions",
        secret: "NEBIUS_API_KEY",
        kind: "ai",
      },
      [`${BASE}/nebius/v1/models`]: {
        method: "GET",
        url: "https://api.tokenfactory.nebius.com/v1/models",
        secret: "NEBIUS_API_KEY",
        kind: "health",
      },
      [`${BASE}/tavily/search`]: {
        method: "POST",
        url: "https://api.tavily.com/search",
        secret: "TAVILY_API_KEY",
        kind: "search",
      },
      [`${BASE}/tavily/usage`]: {
        method: "GET",
        url: "https://api.tavily.com/usage",
        secret: "TAVILY_API_KEY",
        kind: "health",
      },
    };
    const route = routes[path];
    if (!route || req.method !== route.method || new URL(req.url).search)
      return reply(404, "Unknown service operation");
    const authorization = req.headers.get("authorization") ?? "";
    if (
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        authorization,
      ) ||
      authorization.length > 8192
    )
      return reply(401, "Authentication required");
    const supabase = env("SUPABASE_URL"),
      service = env("SUPABASE_SERVICE_ROLE_KEY"),
      upstream = env(route.secret);
    if (!supabase || !service || !upstream)
      return reply(503, "Built-in AI is not configured");
    let stage = "auth";
    try {
      const userResponse = await request(`${supabase}/auth/v1/user`, {
        headers: {
          Authorization: authorization,
          apikey: env("SUPABASE_ANON_KEY") ?? service,
        },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!userResponse.ok)
        return reply(401, "Session expired; reconnect built-in AI");
      const user = JSON.parse(await bounded(userResponse, 32000));
      if (
        !/^[a-f0-9-]{36}$/.test(user.id ?? "") ||
        user.role !== "authenticated"
      )
        return reply(401, "Invalid user session");
      let payload: Record<string, unknown> | undefined,
        units = 0;
      if (req.method === "POST") {
        if (
          !(req.headers.get("content-type") ?? "").startsWith(
            "application/json",
          )
        )
          return reply(415, "JSON required");
        try {
          payload = JSON.parse(await bounded(req, MAX_BODY));
          if (!payload || Array.isArray(payload) || typeof payload !== "object")
            throw Error("payload");
          if (route.kind === "ai") units = validateChat(payload!);
          else {
            if (
              Object.keys(payload!).some(
                (k) =>
                  ![
                    "query",
                    "search_depth",
                    "max_results",
                    "topic",
                    "include_raw_content",
                  ].includes(k),
              ) ||
              typeof payload!.query !== "string" ||
              payload!.query.length < 1 ||
              payload!.query.length > 1000 ||
              !["basic", "advanced"].includes(String(payload!.search_depth)) ||
              !Number.isInteger(payload!.max_results) ||
              Number(payload!.max_results) < 1 ||
              Number(payload!.max_results) > 5 ||
              (payload!.topic !== undefined && payload!.topic !== "general") ||
              (payload!.include_raw_content !== undefined &&
                payload!.include_raw_content !== false)
            )
              throw Error("search");
          }
        } catch {
          return reply(
            400,
            "Request exceeds the supported operation or context budget",
          );
        }
      }
      stage = "quota";
      const reservation = await request(
        `${supabase}/rest/v1/rpc/buddy_reserve_ai`,
        {
          method: "POST",
          headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_user: user.id,
            p_route: route.kind,
            p_units: units,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!reservation.ok)
        return reply(503, "Built-in AI is temporarily unavailable");
      if (JSON.parse(await bounded(reservation, 1000)) !== true)
        return reply(
          429,
          "Built-in AI allowance reached. Try later or use your own API keys.",
        );
      stage = "provider";
      const response = await request(route.url, {
        method: route.method,
        headers: {
          Authorization: `Bearer ${upstream}`,
          "Content-Type": "application/json",
        },
        body: payload ? JSON.stringify(payload) : undefined,
        redirect: "error",
        signal: AbortSignal.any([req.signal, AbortSignal.timeout(60000)]),
      });
      if (!response.ok) {
        console.warn(
          JSON.stringify({
            event: "gateway_upstream_failure",
            service: route.kind,
            status: response.status,
          }),
        );
        return reply(
          [401, 403].includes(response.status)
            ? 502
            : response.status >= 500
              ? 503
              : response.status,
          "The selected AI service could not complete this request",
        );
      }
      stage = "response";
      const data = JSON.parse(await bounded(response, MAX_RESPONSE));
      if (route.method === "GET") {
        if (route.secret === "TAVILY_API_KEY") {
          if (!data.key || typeof data.key !== "object")
            return reply(502, "Invalid service health response");
          return Response.json(
            { key: { configured: true } },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        if (!Array.isArray(data.data))
          return reply(502, "Invalid service model response");
        return Response.json(
          {
            data: data.data
              .filter((m: { id: string }) => MODELS.has(m.id))
              .map((m: { id: string }) => ({ id: m.id })),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const kind =
        error instanceof Error &&
        ["AbortError", "TimeoutError"].includes(error.name)
          ? "timeout"
          : error instanceof SyntaxError
            ? "invalid_json"
            : "unavailable";
      console.warn(JSON.stringify({ event: "gateway_failure", stage, kind }));
      return reply(
        503,
        "Built-in AI could not reach the service; no automatic retry was sent",
      );
    }
  };
}

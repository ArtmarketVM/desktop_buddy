import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, RefreshCw, Search, Sparkles } from "lucide-react";
import { api, desktop } from "../api/tauri";
import {
  serviceStateLabel,
  serviceStatusApi,
  type ServiceId,
  type ServiceSnapshot,
  type ServiceState,
} from "../ai/serviceStatus";
import { useDismissiblePopover } from "./useDismissiblePopover";

const services = [
  {
    id: "nebius",
    name: "Nebius",
    icon: Cloud,
    description:
      "Hosts sumi's AI requests in the cloud and provides access to the configured language model.",
  },
  {
    id: "nvidia",
    name: "AI model",
    icon: Sparkles,
    description:
      "Plans and validates goal actions and interprets background activity. The response model writes natural replies and checkpoints. Runs through Nebius, not on this computer.",
  },
  {
    id: "tavily",
    name: "Tavily",
    icon: Search,
    description:
      "Finds web sources after you approve research. Receives a short search query, not your full memory.",
  },
] as const;
export function SidebarAiServices({
  enabled = true,
  collapsed = false,
}: {
  enabled?: boolean;
  collapsed?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<ServiceSnapshot | null>(null);
  const [busy, setBusy] = useState(desktop && enabled && navigator.onLine);
  const [checking, setChecking] = useState<ServiceId[]>([]);
  const inFlight = useRef<Promise<void> | null>(null);
  const started = useRef(false);
  const allowed = useRef(enabled);
  allowed.current = enabled;
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const [readError, setReadError] = useState(false);
  const [active, setActive] = useState<ServiceId>("nebius");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [receipt, setReceipt] = useState("");
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { id, open, setOpen, rootRef, surfaceRef, triggerRef } =
    useDismissiblePopover({ restoreFocusOnEscape: false });
  useEffect(() => {
    setOpen(false);
  }, [collapsed, setOpen]);
  const refresh = useCallback(async () => {
    try {
      const data = await serviceStatusApi.read();
      if (mounted.current) {
        setSnapshot(data);
        setReadError(false);
      }
      return data;
    } catch {
      if (mounted.current) setReadError(true);
    }
  }, []);
  const check = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    if (!desktop || !allowed.current || !navigator.onLine)
      return Promise.resolve();
    setBusy(true);
    setChecking(["nebius", "nvidia", "tavily"]);
    setReceipt("");
    const work = async () => {
      try {
        const initial = await refresh();
        if (!allowed.current || !mounted.current || !navigator.onLine) return;
        if (initial?.services.some((item) => item.status === "mock")) return;
        await Promise.allSettled(
          (["nebius", "tavily"] as const).map(async (provider) => {
            try {
              await api.testConnection(provider);
            } finally {
              await refresh();
              if (mounted.current)
                setChecking((pending) =>
                  pending.filter((id) =>
                    provider === "nebius" ? id === "tavily" : id !== "tavily",
                  ),
                );
            }
          }),
        );
        if (mounted.current) setReceipt("Connection status refreshed.");
      } finally {
        inFlight.current = null;
        if (mounted.current) {
          setChecking([]);
          setBusy(false);
        }
      }
    };
    inFlight.current = work();
    return inFlight.current;
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    if (!desktop || !enabled) {
      started.current = false;
      return () => {
        mounted.current = false;
      };
    }
    let pending = false;
    const poll = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        await refresh();
      } finally {
        pending = false;
      }
    };
    const network = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void check();
      else void poll();
    };
    if (!started.current) {
      started.current = true;
      void check();
    } else void poll();
    const interval = window.setInterval(() => void poll(), 30_000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, [enabled, refresh, check]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function keepOpen() {
    if (timer.current) clearTimeout(timer.current);
  }
  function leave() {
    keepOpen();
    timer.current = setTimeout(() => setOpen(false), 150);
  }
  function show(service: ServiceId, element: HTMLButtonElement) {
    keepOpen();
    const rect = element.getBoundingClientRect();
    triggerRef.current = element;
    setPosition({
      left: Math.min(rect.right + 14, window.innerWidth - 278),
      top: Math.max(12, Math.min(rect.top, window.innerHeight - 240)),
    });
    setActive(service);
    setOpen(true);
  }
  function state(service: ServiceId): ServiceState {
    if (offline) return "offline";
    if (checking.includes(service) || (busy && !snapshot)) return "checking";
    if (readError) return "not_checked";
    return (
      snapshot?.services.find((item) => item.id === service)?.status ??
      "not_checked"
    );
  }
  function name(service: ServiceId) {
    if (service !== "nvidia")
      return services.find((item) => item.id === service)!.name;
    if (snapshot?.configured_model?.startsWith("nvidia/"))
      return /nemotron/i.test(snapshot.configured_model)
        ? "NVIDIA Nemotron"
        : "NVIDIA model";
    return "AI model";
  }
  const item = services.find((service) => service.id === active)!;
  const checkedAt = snapshot?.services.find(
    (service) => service.id === active,
  )?.checked_at;
  return (
    <div
      className="sidebar-ai-services"
      aria-label="AI services"
      role="group"
      ref={rootRef}
    >
      <div className="sidebar-ai-heading">
        <span className="sidebar-service-label">AI services</span>
        <button
          className="text-button service-check"
          aria-label="Check AI connections"
          title="Check authentication and model access. No generation or search is sent."
          disabled={!desktop || !enabled || busy || offline}
          onClick={() => void check()}
        >
          <RefreshCw
            size={12}
            className={busy ? "spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </div>
      {services.map((service) => (
        <button
          key={service.id}
          className="sidebar-service text-button"
          aria-label={`${name(service.id)}: ${serviceStateLabel(service.id, state(service.id))}`}
          aria-describedby={open && active === service.id ? id : undefined}
          onMouseEnter={(event) => show(service.id, event.currentTarget)}
          onMouseLeave={leave}
          onFocus={(event) => show(service.id, event.currentTarget)}
          onClick={(event) => show(service.id, event.currentTarget)}
        >
          <service.icon size={14} aria-hidden="true" />
          <span className="sidebar-service-label">{name(service.id)}</span>
          <span
            className={`service-dot service-${state(service.id)}`}
            aria-hidden="true"
          />
        </button>
      ))}
      <span className="service-receipt" role="status">
        {receipt}
      </span>
      {open &&
        createPortal(
          <div
            ref={surfaceRef}
            className="service-tooltip"
            id={id}
            role="tooltip"
            style={position}
            onMouseEnter={keepOpen}
            onMouseLeave={leave}
          >
            <strong>{name(active)}</strong>
            <p>{item.description}</p>
            {active === "nvidia" && (
              <p className="service-model">
                Configured model:{" "}
                {snapshot?.configured_model ?? "Not available"}
                <br />
                Configured response model:{" "}
                {snapshot?.configured_response_model ??
                  snapshot?.configured_model ??
                  "Not available"}
              </p>
            )}
            <div className="service-state">
              <span
                className={`service-dot service-${state(active)}`}
                aria-hidden="true"
              />
              {serviceStateLabel(active, state(active))}
            </div>
            {checkedAt && (
              <small>
                Last checked:{" "}
                {new Date(checkedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </small>
            )}
            <small>
              {active === "nvidia"
                ? "Model-list access only; generation is checked separately in Settings."
                : active === "nebius"
                  ? "Authentication check only; generation and billing are not tested."
                  : "Usage access check only; a search has not been tested."}
            </small>
            {readError && (
              <small>Local status is unavailable. Try again in Settings.</small>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

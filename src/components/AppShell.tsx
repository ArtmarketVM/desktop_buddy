import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Compass,
  BarChart3,
  BookOpen,
  History,
  Settings,
  ChevronDown,
  ShieldCheck,
  Sun,
  Moon,
  UserRound,
  LogOut,
  MessageSquare,
} from "lucide-react";
import type { UserProfile } from "../types";
import type { UpdateSnapshot } from "../updates/controller";
import { UpdateEntry } from "./Updates";

export type WorkspacePage =
  | "focus"
  | "activity"
  | "resources"
  | "history"
  | "settings"
  | "profile"
  | "feedback";
export const pages = [
  {
    id: "focus",
    label: "Today",
    icon: Compass,
    description: "A little room for what matters today.",
  },
  {
    id: "activity",
    label: "Progress",
    icon: BarChart3,
    description: "Your goals, completed steps and focused time.",
  },
  {
    id: "resources",
    label: "Import",
    icon: BookOpen,
    description: "Turn notes and thoughts into a plan you can review.",
  },
  {
    id: "history",
    label: "Goals",
    icon: History,
    description: "Keep several directions moving at your pace.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    description: "Make this workspace feel like yours.",
  },
  {
    id: "profile",
    label: "Your profile",
    icon: UserRound,
    description: "Your name and companion. Stored on this device.",
  },
  {
    id: "feedback",
    label: "Feedback",
    icon: MessageSquare,
    description: "Tell us what would make Buddy more useful.",
  },
] as const;

export function AppShell({
  page,
  onNavigate,
  profile,
  version,
  update,
  onUpdates,
  onboarding = false,
  children,
  theme = "light",
  onTheme,
  onReset,
  onQuickGoal,
}: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  profile: UserProfile;
  version: string;
  update: UpdateSnapshot;
  onUpdates: () => void;
  onboarding?: boolean;
  children: ReactNode;
  theme?: "light" | "dark";
  onTheme?: (theme: "light" | "dark") => void;
  onReset?: () => void;
  onQuickGoal?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRoot.current?.contains(event.target as Node)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    menuRoot.current
      ?.querySelector<HTMLButtonElement>(".profile-menu button")
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const title = pages.find((item) => item.id === page)!;
  const initials =
    profile.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((name) => name[0])
      .join("")
      .toUpperCase() || "B";
  return (
    <div className={`app-shell page-${page} ${onboarding ? "setup-mode" : ""}`}>
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="workspace-brand">
          <span className="brand-mark">b.</span>
          <div>
            Buddy<span>Personal workspace</span>
          </div>
        </div>
        <span className="eyebrow nav-heading">WORKSPACE</span>
        <nav>
          {pages.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id && !onboarding ? "selected" : ""}`}
              aria-current={
                page === item.id && !onboarding ? "page" : undefined
              }
              disabled={onboarding}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-context">
          <ShieldCheck size={15} />
          <span>
            Local by default<small>A quiet space to do good work.</small>
          </span>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "settings" && !onboarding ? "selected" : ""}`}
            disabled={onboarding}
            onClick={() => onNavigate("settings")}
          >
            <Settings size={17} />
            Settings
          </button>
          <UpdateEntry snapshot={update} onClick={onUpdates} />
          <button
            className={`nav-item ${page === "feedback" ? "selected" : ""}`}
            disabled={onboarding}
            onClick={() => onNavigate("feedback")}
          >
            <MessageSquare size={17} />
            Feedback
          </button>
          <button
            className="nav-item theme-toggle"
            onClick={() => onTheme?.(theme === "light" ? "dark" : "light")}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            {theme === "light" ? "Dark theme" : "Light theme"}
          </button>
          <div className="profile-menu-root" ref={menuRoot}>
            {menu && (
              <div className="profile-menu" aria-label="Profile actions">
                <p>
                  {profile.name || "Your profile"}
                  <small>{profile.email || "Stored on this device"}</small>
                </p>
                <button
                  onClick={() => {
                    setMenu(false);
                    onNavigate("profile");
                  }}
                >
                  <UserRound size={15} />
                  Edit profile
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    onReset?.();
                  }}
                >
                  <LogOut size={15} />
                  Sign out of local profile
                </button>
                <small>Opens setup again. Goals and history are kept.</small>
              </div>
            )}
            <button
              ref={trigger}
              className="profile-entry"
              disabled={onboarding}
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label="Open profile menu"
            >
              <span className="profile-initials">{initials}</span>
              <span>
                {profile.name || "Your workspace"}
                <small>Local profile</small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{onboarding ? "Welcome" : title.label}</strong>
          </div>
          <span className="version">v{version}</span>
          {!onboarding && (
            <button className="outline-button" onClick={onQuickGoal}>
              Quick goal
            </button>
          )}
        </header>
        {children}
      </main>
    </div>
  );
}

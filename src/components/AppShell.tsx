import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Compass,
  BarChart3,
  History,
  Settings,
  PanelLeft,
  Sun,
  Moon,
  BellOff,
  UserRound,
  LogOut,
  MessageSquare,
} from "./PixelIcons";
import type { UserProfile } from "../types";
import type { UpdateSnapshot } from "../updates/controller";
import { UpdateEntry } from "./Updates";
import { isMac } from "../api/platform";
import { readSidebarCollapsed, isSidebarShortcut } from "./sidebar";
import { SidebarAiServices } from "./SidebarAiServices";

export type WorkspacePage =
  | "focus"
  | "activity"
  | "resources"
  | "history"
  | "chats"
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
    label: "My progress",
    icon: BarChart3,
    description: "",
  },
  {
    id: "history",
    label: "All goals",
    icon: History,
    description: "",
  },
  {
    id: "chats",
    label: "Coach chats",
    icon: MessageSquare,
    description: "",
  },
  {
    id: "settings",
    label: "Settings",
    description: "",
    icon: Settings,
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
    description: "Tell us what would make sumi more useful.",
  },
] as const;

export function AppShell({
  page,
  onNavigate,
  profile,
  update,
  onUpdates,
  onboarding = false,
  children,
  theme = "light",
  onTheme,
  quietMode = false,
  quietModeDisabled = false,
  onQuietMode,
  onReset,
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
  quietMode?: boolean;
  quietModeDisabled?: boolean;
  onQuietMode?: () => void;
  onReset?: () => void;
  onQuickGoal?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem("buddy-sidebar-collapsed", String(collapsed));
    } catch {
      // The control still works when browser storage is unavailable.
    }
  }, [collapsed]);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if (!isSidebarShortcut(event, isMac) || event.defaultPrevented) return;
      if (sidebarToggle.current?.closest("[inert]")) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[inert], [role=dialog]"))
        return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      event.preventDefault();
      setCollapsed((previous) => !previous);
    };
    document.addEventListener("keydown", toggle);
    return () => document.removeEventListener("keydown", toggle);
  }, []);
  const sidebarAction = collapsed ? "Expand sidebar" : "Collapse sidebar";
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
  const sidebarButton = (
    <button
      ref={sidebarToggle}
      type="button"
      className="text-button sidebar-collapse"
      aria-label={sidebarAction}
      title={`${sidebarAction} (${isMac ? "Cmd" : "Ctrl"} + \\)`}
      aria-expanded={!collapsed}
      aria-controls="workspace-navigation"
      aria-keyshortcuts={isMac ? "Meta+\\" : "Control+\\"}
      onClick={() => setCollapsed((previous) => !previous)}
    >
      <PanelLeft
        width={20}
        height={18}
        strokeWidth={1.6}
        preserveAspectRatio="none"
        aria-hidden="true"
      />
    </button>
  );
  return (
    <div
      className={`app-shell page-${page} ${isMac ? "macos-window" : ""} ${collapsed ? "sidebar-collapsed" : ""} ${onboarding ? "setup-mode" : ""}`}
    >
      {isMac && (
        <div
          className="window-toolbar"
          role="toolbar"
          aria-label="Window toolbar"
          data-tauri-drag-region
        >
          {sidebarButton}
        </div>
      )}
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-header">
          <div className="workspace-brand" aria-hidden={collapsed || undefined}>
            <div>sumi</div>
          </div>
          {!isMac && sidebarButton}
        </div>
        <nav id="workspace-navigation" aria-label="Workspace pages">
          {pages.slice(0, 4).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id && !onboarding ? "selected" : ""}`}
              aria-current={
                page === item.id && !onboarding ? "page" : undefined
              }
              disabled={onboarding}
              title={item.label}
              aria-label={item.label}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon size={17} />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-ai-dots">
          <SidebarAiServices
            enabled={!onboarding}
            collapsed={collapsed}
            variant="dots"
          />
        </div>
        <div className="sidebar-bottom">
          <nav className="sidebar-utilities" aria-label="Workspace controls">
            <UpdateEntry snapshot={update} onClick={onUpdates} />
            <button
              className={`nav-item ${page === "feedback" ? "selected" : ""}`}
              disabled={onboarding}
              onClick={() => onNavigate("feedback")}
              aria-label="Feedback"
              aria-current={
                page === "feedback" && !onboarding ? "page" : undefined
              }
            >
              <MessageSquare size={17} />
              <span className="nav-label">Feedback</span>
            </button>
            <button
              className="nav-item theme-toggle"
              onClick={() => onTheme?.(theme === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              <span className="nav-label">
                {theme === "light" ? "Dark theme" : "Light theme"}
              </span>
            </button>
            <button
              className="nav-item quiet-toggle"
              aria-label="Quiet mode"
              aria-pressed={quietMode}
              disabled={onboarding || quietModeDisabled || !onQuietMode}
              onClick={onQuietMode}
            >
              <BellOff size={17} aria-hidden="true" />
              <span className="nav-label">Quiet mode</span>
              <span className="quiet-state" aria-hidden="true">
                {quietMode ? "On" : "Off"}
              </span>
            </button>
          </nav>
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
              </div>
            )}
            <button
              ref={trigger}
              className="profile-entry"
              disabled={onboarding}
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label="Open profile menu"
              title={profile.name || "Your profile"}
            >
              <UserRound size={15} className="profile-icon" />
              <span className="profile-name">
                {profile.name || "Your profile"}
              </span>
            </button>
            <button
              className={`profile-settings ${page === "settings" && !onboarding ? "selected" : ""}`}
              disabled={onboarding}
              onClick={() => onNavigate("settings")}
              aria-label="Settings"
              aria-current={
                page === "settings" && !onboarding ? "page" : undefined
              }
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

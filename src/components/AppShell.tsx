import type { ReactNode } from "react";
import { Compass, BarChart3, BookOpen, History, Settings, ChevronDown, ShieldCheck, ArrowUpRight } from "lucide-react";
import type { UserProfile } from "../types";
import type { UpdateSnapshot } from "../updates/controller";
import { UpdateEntry } from "./Updates";

export type WorkspacePage = "focus" | "activity" | "resources" | "history" | "settings";
export const pages = [
  {id:"focus",label:"Focus",icon:Compass,description:"One intention. A little more progress."},
  {id:"activity",label:"Activity",icon:BarChart3,description:"A clear view of where your time goes."},
  {id:"resources",label:"Resources",icon:BookOpen,description:"Useful ideas for your next step."},
  {id:"history",label:"Goal history",icon:History,description:"Your completed goals and observed progress."},
  {id:"settings",label:"Settings",icon:Settings,description:"Make this workspace feel like yours."},
] as const;

export function AppShell({page,onNavigate,profile,version,update,onUpdates,onboarding=false,children}:{page:WorkspacePage;onNavigate:(page:WorkspacePage)=>void;profile:UserProfile;version:string;update:UpdateSnapshot;onUpdates:()=>void;onboarding?:boolean;children:ReactNode}) {
  const title = pages.find(item=>item.id===page)!;
  const initials = profile.name.trim().split(/\s+/).slice(0,2).map(name=>name[0]).join("").toUpperCase() || "B";
  return <div className={`app-shell page-${page} ${onboarding?"setup-mode":""}`}>
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="workspace-brand"><span className="brand-mark">b.</span><div>Buddy<span>Personal workspace</span></div><ChevronDown size={14}/></div>
      <span className="eyebrow nav-heading">WORKSPACE</span>
      <nav>{pages.slice(0,4).map(item=><button key={item.id} className={`nav-item ${page===item.id&&!onboarding?"selected":""}`} aria-current={page===item.id&&!onboarding?"page":undefined} disabled={onboarding} onClick={()=>onNavigate(item.id)}><item.icon size={17}/>{item.label}{item.id==="focus"&&<span>01</span>}</button>)}</nav>
      <div className="sidebar-context"><ShieldCheck size={15}/><span>Local by default<small>A quiet space to do good work.</small></span></div>
      <div className="sidebar-bottom">
        <button className={`nav-item ${page==="settings"&&!onboarding?"selected":""}`} disabled={onboarding} onClick={()=>onNavigate("settings")}><Settings size={17}/>Settings</button>
        <UpdateEntry snapshot={update} onClick={onUpdates}/>
        <button className="profile-entry" disabled={onboarding} onClick={()=>onNavigate("settings")} title="Open profile settings"><span className="profile-initials">{initials}</span><span>{profile.name||"Your workspace"}<small>Personal account</small></span><ArrowUpRight size={14}/></button>
      </div>
    </aside>
    <main className="main">
      <header className="workspace-header"><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{onboarding?"Welcome":title.label}</strong></div><span className="version">v{version}</span></header>
      {children}
    </main>
  </div>;
}

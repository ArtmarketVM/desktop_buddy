import { useEffect, useState } from "react";
import { CheckCircle2, History } from "lucide-react";
import { api, desktop } from "../api/tauri";
import type { GoalHistory } from "../types";
import { duration } from "./ActivityInsights";

export function GoalHistoryView({refreshKey}:{refreshKey:string}) {
  const [history,setHistory]=useState<GoalHistory[]>([]);
  const [loading,setLoading]=useState(desktop);
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!desktop)return;
    let active=true;setLoading(true);setError("");
    api.goalHistory().then(data=>{if(active)setHistory(data);}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[refreshKey,attempt]);
  if(loading)return <div className="card empty" role="status">Loading your completed goals…</div>;
  if(error)return <div className="card"><p role="alert">{error}</p><button onClick={()=>setAttempt(a=>a+1)}>Try again</button></div>;
  if(!history.length)return <div className="card history-empty"><History size={26}/><h2>A record of your progress</h2><p>Completed goals appear here with their observed app time and saved recommendations.</p></div>;
  return <div className="section-stack">{history.map(item=><details className="card goal-history-item" key={item.goal.id}><summary><CheckCircle2 size={18}/><span>{item.goal.text}<small>{item.completed_at?new Date(item.completed_at).toLocaleDateString():"Completion date not recorded"}</small></span><span className="subtle-tag">Completed</span></summary>
    <div className="insight-totals"><p><strong>{duration(Math.floor(item.active_milliseconds/1000))}</strong><span>Observed active time</span></p><p><strong>{duration(Math.floor(item.idle_milliseconds/1000))}</strong><span>Observed idle time</span></p><p><strong>{item.interventions}</strong><span>Buddy check-ins</span></p></div>
    {item.applications.length>0&&<><h3>Applications</h3><ul className="history-apps">{item.applications.map((app,index)=><li key={`${app.process_name}-${index}`}><span>{app.domain || app.process_name}</span><span>{duration(Math.floor(app.active_milliseconds/1000))}</span></li>)}</ul></>}
    <p className="helper">Observed intervals only. App downtime and unobserved time are not inferred.</p>
  </details>)}</div>;
}

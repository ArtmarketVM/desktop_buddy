import { useEffect, useState, useSyncExternalStore } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { desktop } from "../api/tauri";
import { UpdateController, type UpdateInfo, type UpdateProgress } from "./controller";

export function useUpdates(enabled: boolean) {
  const [controller] = useState(() => new UpdateController({
    check: () => invoke<UpdateInfo>("check_app_update"),
    install: (version, onProgress) => {
      const progress = new Channel<UpdateProgress>();
      progress.onmessage = onProgress;
      return invoke<void>("install_app_update", {version, progress});
    },
  }));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (!desktop || !enabled) return;
    let last = 0;
    const check = () => {
      if (Date.now() - last < 30 * 60 * 1000) return;
      last = Date.now();
      void controller.check();
    };
    check();
    const interval = window.setInterval(check, 4 * 60 * 60 * 1000);
    window.addEventListener("focus", check);
    return () => {window.clearInterval(interval); window.removeEventListener("focus", check);};
  }, [controller, enabled]);
  return {controller, snapshot};
}

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api/tauri";
import { defaultUserSettings, type Dashboard } from "../types";

// Both webviews receive committed appearance changes without waiting for polling.
export function useAvatarColorSync(
  setData: Dispatch<SetStateAction<Dashboard>>,
) {
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<string>("buddy://avatar-color", ({ payload: color }) => {
      if (disposed || !["#A8D8C8", "#C9D3D8", "#E8EEF0"].includes(color))
        return;
      setData((current) => ({
        ...current,
        user_settings: current.user_settings
          ? {
              ...current.user_settings,
              profile: {
                ...current.user_settings.profile,
                avatar: { ...current.user_settings.profile.avatar, color },
              },
            }
          : current.user_settings,
        buddy: {
          ...current.buddy,
          avatar: {
            ...(current.buddy.avatar ?? defaultUserSettings.profile.avatar),
            color,
          },
        },
      }));
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => {}); // Dashboard polling remains a fallback.
    return () => {
      disposed = true;
      stop?.();
    };
  }, [setData]);
}

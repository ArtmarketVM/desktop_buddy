import {
  invoke as tauriInvoke,
  type InvokeArgs,
  type InvokeOptions,
} from "@tauri-apps/api/core";
import { queryClient } from "./client";
import type { DataTag } from "./queryClient";
/** Local mutations invalidate even when an older backend lacks an event. No IPC arguments are recorded. */
function changes(command: string): readonly DataTag[] | undefined {
  if (
    /^(get_|search_|test_|transcribe_|analyze_core_goal|propose_core_import|refine_goal|open_workspace|open_feedback|send_contact|subscribe_contact|share_role)/.test(
      command,
    )
  )
    return undefined;
  if (/buddy_(conversation|chat)|send_buddy_message|coaching/.test(command))
    return ["chats", "coaching", "dashboard", "workspace"];
  if (/provider|ai_preferences/.test(command))
    return ["services", "preferences", "dashboard", "engine"];
  if (/core_|goal|focus|step|draft/.test(command))
    return ["workspace", "dashboard", "activity", "drafts", "coaching"];
  return [
    "dashboard",
    "workspace",
    "preferences",
    "services",
    "activity",
    "noticed",
  ];
}
export async function invoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  try {
    return await (options
      ? tauriInvoke<T>(command, args, options)
      : args === undefined
        ? tauriInvoke<T>(command)
        : tauriInvoke<T>(command, args));
  } catch (error) {
    queryClient.recordError(command, error);
    throw error;
  } finally {
    // A failing multi-stage action may already have committed part of its work.
    if (/^(select_buddy_conversation|create_buddy_conversation)$/.test(command))
      queryClient.invalidate(["current-chat"], true);
    const resources = changes(command);
    if (resources)
      queryClient.invalidate(
        resources,
        /^(reset_local_profile|clear_local_history|clear_buddy_chat|delete_buddy_conversation)$/.test(
          command,
        ),
      );
  }
}

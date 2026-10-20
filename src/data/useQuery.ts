import { useSyncExternalStore } from "react";
import type { Query } from "./queryClient";
const inactive = () => () => {};
export function useQuery<T>(query: Query<T>, enabled = true) {
  return useSyncExternalStore(
    enabled ? query.subscribe : inactive,
    query.getSnapshot,
    query.getSnapshot,
  );
}

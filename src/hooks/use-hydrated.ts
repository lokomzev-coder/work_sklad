import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once the client has hydrated, false during SSR and the first client
 * render. Use this instead of the `useState(false) + useEffect(() =>
 * setState(true))` pattern, which trips `react-hooks/set-state-in-effect`.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

import { useMemo, useSyncExternalStore } from "react";
import { createNativeRepository } from "@/data/native-repository";
import { createDailyNativeController } from "@/data/daily-native-controller";
import { useNativeTransport } from "./native-transport";

/** Mounted native retail action subscription, isolated from IndexedDB. */
export function useDailyNative(store: "M01" | "M02") {
  const transport = useNativeTransport();
  const controller = useMemo(
    () => createDailyNativeController(createNativeRepository(transport), store),
    [transport, store],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}

import { useMemo, useRef, useState } from "react";
import { createNativeRepository, TransportError } from "@/data/native-repository";
import { useNativeTransport } from "./native-transport";
import type { NativeOperation } from "@/domain/native-commands";

/** Retain immutable requests through uncertain writes AND failed readback; never automatically replay. */
export function useNativeCommand() {
  const transport = useNativeTransport();
  const repo = useMemo(() => createNativeRepository(transport), [transport]);
  const pending = useRef<{
    command: {
      version: "native-2026-11-06";
      key: string;
      operation: NativeOperation;
      payload: Record<string, unknown>;
    };
    readback: () => Promise<void>;
    posted: boolean;
  } | null>(null);
  const [state, setState] = useState<"IDLE" | "BUSY" | "UNKNOWN" | "NOT_RECORDED" | "ERROR">(
    "IDLE",
  );
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const perform = async (check = false) => {
    const p = pending.current;
    if (!p || inFlight.current) return;
    inFlight.current = true;
    setState("BUSY");
    try {
      if (!p.posted) {
        if (check) {
          const result = await repo.outcome(p.command.key);
          if (!result) {
            setState("UNKNOWN");
            setError("OUTCOME_UNKNOWN");
            return;
          }
        } else await repo.execute(p.command);
        p.posted = true;
      }
      await p.readback();
      pending.current = null;
      setState("IDLE");
      setError("");
    } catch (e) {
      const code = e instanceof TransportError ? e.code : "OUTCOME_UNKNOWN";
      setError(p.posted ? "READBACK_FAILED" : code);
      setState(
        p.posted || code === "OUTCOME_UNKNOWN"
          ? "UNKNOWN"
          : code === "NOT_RECORDED"
            ? "NOT_RECORDED"
            : "ERROR",
      );
      throw e;
    } finally {
      inFlight.current = false;
    }
  };
  return {
    repo,
    state,
    error,
    key: pending.current?.command.key,
    locked: state === "BUSY" || state === "UNKNOWN" || state === "NOT_RECORDED",
    async send(
      operation: NativeOperation,
      payload: Record<string, unknown>,
      readback: () => Promise<void>,
    ) {
      if (pending.current && state !== "ERROR")
        throw new TransportError("OUTCOME_UNKNOWN", pending.current.command.key);
      pending.current = {
        command: {
          version: "native-2026-11-06",
          key: `native-${crypto.randomUUID()}`,
          operation,
          payload,
        },
        readback,
        posted: false,
      };
      await perform();
    },
    check: () => perform(true),
    retry: () => (state === "NOT_RECORDED" ? perform() : Promise.resolve()),
    cancel: () => {
      if (state === "ERROR" || state === "NOT_RECORDED") {
        pending.current = null;
        setState("IDLE");
        setError("");
      }
    },
  };
}

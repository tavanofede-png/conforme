"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ChainInfo } from "./chain";
import { api } from "./client";

const listeners = new Set<() => void>();
let cached: ChainInfo | null = null;
let inflight: Promise<ChainInfo> | null = null;

async function load(): Promise<ChainInfo> {
  inflight ??= api<ChainInfo>("/api/chain").finally(() => {
    inflight = null;
  });
  const info = await inflight;
  cached = info;
  listeners.forEach((l) => l());
  return info;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Estado de la red compartido entre los paneles de la operación.
 * El servidor siempre renderiza sin datos, así la hidratación coincide aunque el cliente ya los tenga.
 */
export function useChain() {
  const info = useSyncExternalStore(
    subscribe,
    () => cached,
    () => null,
  );
  useEffect(() => {
    if (!cached) load().catch(() => undefined);
  }, []);
  const refresh = useCallback(() => load().catch(() => undefined), []);
  return { info, refresh };
}

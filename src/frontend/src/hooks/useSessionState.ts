import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionState } from "../backend";
import { getBackend } from "../utils/getBackend";

export function useSessionState(pollInterval = 3000) {
  const [state, setState] = useState<SessionState>({
    adminOnline: false,
    visitorOnline: false,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchState = useCallback(async () => {
    try {
      const b = await getBackend();
      const s = await b.getSessionState();
      if (mountedRef.current) setState(s);
    } catch (err) {
      console.error("Error fetching session state:", err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchState();
    intervalRef.current = setInterval(fetchState, pollInterval);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchState, pollInterval]);

  return state;
}

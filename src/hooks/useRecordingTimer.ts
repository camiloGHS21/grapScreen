import { useState, useEffect, useRef } from "react";

export function useRecordingTimer(paused: boolean) {
  const [elapsed, setElapsed] = useState(0);

  const baseTime = useRef<number>(
    Number((window as any).__REC_START__ || Date.now())
  );
  const baseElapsed = useRef<number>(0);
  const pausedRef = useRef(paused);

  // Sync ref with paused state
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Live timer interval.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!pausedRef.current) {
        setElapsed(
          baseElapsed.current +
            Math.floor((Date.now() - baseTime.current) / 1000)
        );
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const adjustTimerOnPause = (nextPaused: boolean) => {
    if (nextPaused) {
      baseElapsed.current += Math.floor(
        (Date.now() - baseTime.current) / 1000
      );
    } else {
      baseTime.current = Date.now();
    }
  };

  return { elapsed, adjustTimerOnPause };
}

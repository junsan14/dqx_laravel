"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

const RouteProgressContext = createContext(null);

const MIN_VISIBLE_MS = 300;
const MAX_VISIBLE_MS = 10000;

export function RouteProgressProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const startedAtRef = useRef(0);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();

    startedAtRef.current = 0;

    setVisible(false);
    setProgress(0);
  }, [clearTimers]);

  const done = useCallback(() => {
    clearTimers();

    if (!startedAtRef.current) {
      reset();
      return;
    }

    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    const finishTimer = setTimeout(() => {
      setProgress(100);

      const hideTimer = setTimeout(() => {
        reset();
      }, 100);

      timersRef.current.push(hideTimer);
    }, remaining);

    timersRef.current.push(finishTimer);
  }, [clearTimers, reset]);

  const start = useCallback(() => {
    clearTimers();

    startedAtRef.current = Date.now();

    setVisible(true);
    setProgress(10);

    const progressSteps = [
      [25, 80],
      [45, 180],
      [62, 320],
      [76, 520],
      [86, 900],
    ];

    progressSteps.forEach(([value, delay]) => {
      const timer = setTimeout(() => {
        setProgress(value);
      }, delay);

      timersRef.current.push(timer);
    });

    const maxTimer = setTimeout(() => {
      done();
    }, MAX_VISIBLE_MS);

    timersRef.current.push(maxTimer);
  }, [clearTimers, done]);

  const value = useMemo(
    () => ({
      visible,
      progress,
      start,
      done,
    }),
    [visible, progress, start, done]
  );

  return (
    <RouteProgressContext.Provider value={value}>
      {children}
    </RouteProgressContext.Provider>
  );
}

export function useRouteProgress() {
  const context = useContext(RouteProgressContext);

  if (!context) {
    throw new Error(
      "useRouteProgress must be used within RouteProgressProvider"
    );
  }

  return context;
}
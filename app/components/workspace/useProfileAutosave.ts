"use client";
import { useEffect, useRef, useState } from "react";

// Debounce typing, serialize writes, and flush the last draft when changing people.
export function useProfileAutosave(
  data: Record<string, unknown>,
  onSave: (data: Record<string, unknown>) => Promise<void>,
  onPending: (pending: boolean) => void,
) {
  const serialized = JSON.stringify(data);
  const latest = useRef(data),
    saved = useRef(serialized),
    save = useRef(onSave);
  const running = useRef(false),
    alive = useRef(true);
  const pending = useRef(onPending);
  pending.current = onPending;
  const [status, setStatus] = useState("All changes saved");
  latest.current = data;
  save.current = onSave;
  const flush = useRef<() => Promise<void>>(async () => {});
  flush.current = async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (JSON.stringify(latest.current) !== saved.current) {
        let value = latest.current;
        if (!String(value.name ?? "").trim()) {
          if (alive.current) {
            setStatus("Enter a name to save");
            break;
          }
          value = { ...value, name: JSON.parse(saved.current).name };
          latest.current = value;
        }
        const signature = JSON.stringify(value);
        if (signature === saved.current) {
          pending.current(false);
          break;
        }
        if (alive.current) setStatus("Saving…");
        const previous = JSON.parse(saved.current);
        const patch = Object.fromEntries(
          Object.entries(value).filter(
            ([key, v]) => JSON.stringify(v) !== JSON.stringify(previous[key]),
          ),
        );
        await save.current(patch);
        saved.current = signature;
        pending.current(JSON.stringify(latest.current) !== saved.current);
        if (alive.current) setStatus("All changes saved");
      }
    } catch (e) {
      if (alive.current)
        setStatus(
          e instanceof Error
            ? `Not saved: ${e.message}`
            : "Not saved. Try again.",
        );
    } finally {
      running.current = false;
    }
  };
  useEffect(() => {
    pending.current(serialized !== saved.current);
    if (serialized === saved.current) return;
    setStatus("Saving…");
    const timer = setTimeout(() => void flush.current(), 350);
    return () => clearTimeout(timer);
  }, [serialized]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void flush.current();
    };
  }, []);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, []);
  return {
    status:
      serialized !== saved.current && status === "All changes saved"
        ? "Saving…"
        : status,
    retry: () => void flush.current(),
  };
}

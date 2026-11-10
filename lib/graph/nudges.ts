import type { Person } from "./types";

export type Nudge = {
  kind: "next" | "reconnect" | "blank";
  personId: number;
  title: string;
  detail: string;
};

export function daysSince(date: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.max(0, Math.round((today - then) / 86400000));
}

export function ago(date: string, now = new Date()) {
  const days = daysSince(date, now);
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const matters = (p: Person) =>
  p.strength >= 7 ||
  p.tags.some(
    (t) => t === "friends" || t === "important" || t === "highsignal",
  );

// Plain rules over what the user wrote: open next steps, people who matter and
// have gone quiet, and profiles that still say nothing.
export function nudges(people: Person[], now = new Date()): Nudge[] {
  const next = people
    .filter((p) => p.nextStep.trim())
    .sort(
      (a, b) =>
        (daysSince(b.lastContact, now) ?? 9999) -
        (daysSince(a.lastContact, now) ?? 9999),
    )
    .map((p): Nudge => ({
      kind: "next",
      personId: p.id,
      title: p.nextStep.trim(),
      detail: p.name,
    }));
  const quiet = people
    .filter((p) => matters(p) && !p.nextStep.trim())
    .map((p) => ({ p, days: daysSince(p.lastContact, now) }))
    .filter(({ days }) => days === null || days >= 45)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .slice(0, 6)
    .map(({ p, days }): Nudge => ({
      kind: "reconnect",
      personId: p.id,
      title: `Catch up with ${p.name}`,
      detail:
        days === null
          ? "Nothing logged yet"
          : `Last touched ${ago(p.lastContact, now)}`,
    }));
  const blank = people
    .filter((p) => !p.description.trim())
    .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((p): Nudge => ({
      kind: "blank",
      personId: p.id,
      title: `Add one line about ${p.name}`,
      detail: "No notes yet",
    }));
  return [...next, ...quiet, ...blank];
}

import type { Person } from "./types";
export const JUDGMENTS = [
  ["highsignal", "✦", "High signal"],
  ["highagency", "ϟ", "High agency"],
  ["important", "◇", "Important"],
  ["friends", "♡", "Close friend"],
  ["fun", "♫", "Great company"],
  ["helpful", "✧", "Helpful"],
  ["interesting", "◎", "Interesting"],
  ["reliable", "✓", "Reliable"],
  ["inspiring", "☀", "Inspiring"],
  ["connector", "⤴", "Opens doors"],
] as const;
export function judgmentMarkers(tags: string[]) {
  return tags.map((tag) => {
    const known = JUDGMENTS.find(([key]) => key === tag);
    return { tag, icon: known?.[1] ?? "•", label: known?.[2] ?? tag };
  });
}
export const CIRCLE_SECTIONS = [
  {
    name: "Create & build",
    circles: ["UGC", "Content", "Startups", "Freelance"],
  },
  {
    name: "Opportunities",
    circles: ["Career", "Introductions", "Life advice"],
  },
  {
    name: "Life & friendship",
    circles: ["Close friends", "Going out", "Fitness", "Travel", "Community"],
  },
];
export function closenessLevel(p: Pick<Person, "strength">) {
  return p.strength >= 9
    ? 5
    : p.strength >= 7
      ? 4
      : p.strength >= 4
        ? 3
        : p.strength > 0
          ? 2
          : 1;
}
export function circleColor(circle: string) {
  const colors: Record<string, string> = {
    UGC: "#f4ba70",
    Content: "#ee88ba",
    Startups: "#98a0ff",
    Freelance: "#65d4c4",
    Career: "#7cbdf4",
    Introductions: "#dac576",
    "Life advice": "#baa0e8",
    "Close friends": "#f3949c",
    "Going out": "#cbadff",
    Fitness: "#a5cd76",
    Travel: "#80d2e1",
    Community: "#dbc3a4",
  };
  const known = Object.keys(colors).find(
    (k) => k.toLowerCase() === circle.toLowerCase(),
  );
  if (known) return colors[known];
  let hash = 0;
  for (const c of circle.toLowerCase())
    hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 65% 72%)`;
}
const topics = [
  { name: "UGC", icon: "◉", words: /\bugc\b/i },
  {
    name: "Content",
    icon: "▣",
    words: /content|video|creator|film|photograph/i,
  },
  {
    name: "Startups",
    icon: "↗",
    words: /startup|founder|building|entrepreneur/i,
  },
  { name: "Freelance", icon: "⌘", words: /freelanc|design|client/i },
  { name: "Career", icon: "▰", words: /career|recruit|job|hiring/i },
  { name: "Introductions", icon: "⤴", words: /intro|connect|doors/i },
  { name: "Life advice", icon: "✧", words: /advice|mentor/i },
  { name: "Close friends", icon: "♡", words: /close friend|best friend/i },
  {
    name: "Going out",
    icon: "♫",
    words: /parties|party|music|going out|nightlife/i,
  },
];
export function circleIcon(circle: string) {
  return (
    topics.find((t) => t.name.toLowerCase() === circle.toLowerCase())?.icon ??
    "◌"
  );
}
export function suggestedCircles(description: string, circles: string[]) {
  return topics
    .filter(
      (t) =>
        t.words.test(description) &&
        !circles.some((c) => c.toLowerCase() === t.name.toLowerCase()),
    )
    .map((t) => t.name);
}
export function closeness(p: Pick<Person, "strength">) {
  return p.strength >= 9
    ? "Inner circle"
    : p.strength >= 7
      ? "Close"
      : p.strength >= 4
        ? "Know well"
        : p.strength > 0
          ? "Acquaintance"
          : "Just met";
}

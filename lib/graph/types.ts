export type Person = {
  id: number;
  name: string;
  bg: string;
  strength: number;
  tags: string[];
  circles: string[];
  description: string;
  pinToMe: boolean;
  lastContact: string;
  followUp: string;
  nextStep: string;
  x: number | null;
  y: number | null;
};
export type Edge = {
  source: number;
  target: number;
  weight: number;
  inferred?: boolean;
};
export type Graph = {
  nodes: Person[];
  edges: Edge[];
  bucketNames: Record<string, string>;
  clusterEdges: { a: string; b: string; weight: number }[];
};
export type Memory = {
  id: number;
  body: string;
  createdAt: string;
  mentions: string[];
  personIds: number[];
};
export const PRESETS: Record<string, string> = {
  plano: "Plano East",
  ut: "UT Austin",
  allen: "Allen",
  sf: "San Francisco",
  family: "Family",
  climb: "Climbing",
  online: "Unsorted",
};
export const AREAS = [
  "UGC",
  "Content",
  "Startups",
  "Freelance",
  "Career",
  "Introductions",
  "Life advice",
  "Close friends",
  "Going out",
];
// Ready-made situations for the "What's going on" view. They sit there as empty
// drop zones until someone is dragged in, and Claude reuses the names.
export const SCENARIOS = [
  "Catch up soon",
  "Grab a meal",
  "Working together",
  "Could open doors",
  "Project crew",
  "Party crew",
  "Gym & sports",
  "Owe them a reply",
];
export function groupName(bg: string, names: Record<string, string>) {
  return names[bg] || PRESETS[bg] || "New group";
}
export function colorFor(key: string) {
  const palette = [
    "#a9b9ef",
    "#cea477",
    "#88b6a0",
    "#bd9dcc",
    "#d89999",
    "#9fb6bc",
    "#b9bc89",
  ];
  let hash = 0;
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
export function stringList(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw)
    ? [
        ...new Set(
          raw
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ].slice(0, 50)
    : [];
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

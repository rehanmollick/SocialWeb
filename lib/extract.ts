import Anthropic from '@anthropic-ai/sdk';

export type ExtractedPerson = {
  name: string;
  bg?: 'plano' | 'ut' | 'allen' | 'sf' | 'family' | 'climb' | 'online';
  tags?: string[];
  strengthHint?: number;
};

export type Extraction = {
  people: ExtractedPerson[];
};

const BG_VALUES = ['plano', 'ut', 'allen', 'sf', 'family', 'climb', 'online'] as const;

const SYSTEM = `You extract people from a short personal note.

Return ONLY valid JSON matching this shape:
{"people":[{"name":"First Last","bg":"plano|ut|allen|sf|family|climb|online","tags":["short","words"],"strengthHint":1-10}]}

Rules:
- Only include real people (humans) named or clearly referenced.
- "bg" picks the single best bucket: plano (Plano TX / high school), ut (UT Austin), allen (Allen TX), sf (San Francisco / work), family (family member), climb (climbing / gym), online (met online / internet friend).
- If unclear, default bg to "online".
- tags: 0-4 short lowercase hints ("coworker", "roommate", "hs-friend").
- strengthHint: 1 (acquaintance) to 10 (best friend) based on how the note talks about them.
- No markdown, no prose. JSON only.`;

export async function extractPeople(body: string): Promise<Extraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return stubExtract(body);
  }

  const client = new Anthropic({ apiKey });

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: body }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  try {
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return normalize(parsed);
  } catch {
    return { people: [] };
  }
}

function normalize(raw: unknown): Extraction {
  if (!raw || typeof raw !== 'object' || !('people' in raw)) return { people: [] };
  const arr = (raw as { people: unknown }).people;
  if (!Array.isArray(arr)) return { people: [] };
  const out: ExtractedPerson[] = [];
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue;
    const name = (p as { name?: unknown }).name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const bgRaw = (p as { bg?: unknown }).bg;
    const bg = typeof bgRaw === 'string' && (BG_VALUES as readonly string[]).includes(bgRaw)
      ? (bgRaw as ExtractedPerson['bg'])
      : 'online';
    const tagsRaw = (p as { tags?: unknown }).tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.filter((t): t is string => typeof t === 'string').slice(0, 4)
      : [];
    const sh = (p as { strengthHint?: unknown }).strengthHint;
    const strengthHint =
      typeof sh === 'number' && sh >= 1 && sh <= 10 ? Math.round(sh) : undefined;
    out.push({ name: name.trim(), bg, tags, strengthHint });
  }
  return { people: out };
}

function stubExtract(body: string): Extraction {
  const matches = body.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g) ?? [];
  const seen = new Set<string>();
  const people: ExtractedPerson[] = [];
  for (const m of matches) {
    if (seen.has(m)) continue;
    seen.add(m);
    people.push({ name: m, bg: 'online', tags: [], strengthHint: 5 });
  }
  return { people };
}

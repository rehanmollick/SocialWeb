import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  logThought,
  connectPeople,
  disconnectPeople,
  addTag,
  removeTag,
  setStrength,
  setBackground,
  renameCluster,
  deletePerson,
  type ToolResult,
} from '@/lib/commands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = `You are the brain of a personal social-memory graph. The user types one line. Decide: is this a journal entry about their day (mentioning people, events, feelings) OR a direct instruction about the graph?

- Journal / free-form note → call log_thought with the raw text. This extracts people automatically and strengthens connections.
- Direct instructions like "connect sarah and jess strongly", "make alex high agency", "rename sf to bay area crew", "bump mike to 9", "delete jordan" → call the matching tool. You may call multiple tools in one turn.

Buckets: plano, ut, allen, sf, family, climb, online.
Strength scale: 0 (no connection) to 10 (inseparable). Default connection weight when unspecified: 3 for "connect", 6 for "connect strongly", 8 for "very strong".
Tag vocabulary includes: highagency, highsignal, interesting, fun, friends, important, helpful, boring. Tags outside this list are fine too.

If the user is ambiguous, prefer log_thought. Keep it snappy. Return a short confirmation after your tool calls.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'log_thought',
    description:
      'Log a journal entry. Extracts people mentioned and strengthens their presence in the graph. Use for free-form notes about the user\'s day.',
    input_schema: {
      type: 'object',
      properties: { body: { type: 'string', description: 'The raw thought text' } },
      required: ['body'],
    },
  },
  {
    name: 'connect_people',
    description: 'Create or update a peer connection between two people.',
    input_schema: {
      type: 'object',
      properties: {
        name_a: { type: 'string' },
        name_b: { type: 'string' },
        weight: { type: 'number', description: '0-10 strength of the connection' },
      },
      required: ['name_a', 'name_b'],
    },
  },
  {
    name: 'disconnect_people',
    description: 'Remove a peer connection between two people.',
    input_schema: {
      type: 'object',
      properties: { name_a: { type: 'string' }, name_b: { type: 'string' } },
      required: ['name_a', 'name_b'],
    },
  },
  {
    name: 'add_tag',
    description: 'Add a tag to a person. Use for "make alex high agency" etc.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, tag: { type: 'string' } },
      required: ['name', 'tag'],
    },
  },
  {
    name: 'remove_tag',
    description: 'Remove a tag from a person.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, tag: { type: 'string' } },
      required: ['name', 'tag'],
    },
  },
  {
    name: 'set_strength',
    description: 'Set a person\'s strength/closeness (0-10).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, strength: { type: 'number' } },
      required: ['name', 'strength'],
    },
  },
  {
    name: 'set_background',
    description: 'Move a person into a background bucket (plano, ut, allen, sf, family, climb, online).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, bg: { type: 'string' } },
      required: ['name', 'bg'],
    },
  },
  {
    name: 'rename_cluster',
    description: 'Give a bucket a custom display name.',
    input_schema: {
      type: 'object',
      properties: { bg: { type: 'string' }, name: { type: 'string' } },
      required: ['bg', 'name'],
    },
  },
  {
    name: 'delete_person',
    description: 'Delete a person and all their mentions. Only use when the user explicitly asks.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  const s = (k: string) => String(input[k] ?? '');
  const n = (k: string, d = 3) => {
    const v = input[k];
    return typeof v === 'number' ? v : Number(v) || d;
  };
  switch (name) {
    case 'log_thought':
      return logThought(s('body'));
    case 'connect_people':
      return connectPeople(s('name_a'), s('name_b'), n('weight'));
    case 'disconnect_people':
      return disconnectPeople(s('name_a'), s('name_b'));
    case 'add_tag':
      return addTag(s('name'), s('tag'));
    case 'remove_tag':
      return removeTag(s('name'), s('tag'));
    case 'set_strength':
      return setStrength(s('name'), n('strength', 5));
    case 'set_background':
      return setBackground(s('name'), s('bg'));
    case 'rename_cluster':
      return renameCluster(s('bg'), s('name'));
    case 'delete_person':
      return deletePerson(s('name'));
    default:
      return { ok: false, message: `unknown tool ${name}` };
  }
}

export async function POST(req: Request) {
  const { body } = await req.json().catch(() => ({ body: '' }));
  if (typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const result = await logThought(body);
    return NextResponse.json({ ok: result.ok, steps: [result.message], summary: result.message });
  }

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: body }];
  const steps: string[] = [];
  let finalText = '';

  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      messages,
    });

    const assistantContent = res.content;
    messages.push({ role: 'assistant', content: assistantContent });

    const toolUses = assistantContent.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );
    const textBlocks = assistantContent.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    if (textBlocks.length) finalText = textBlocks.map((t) => t.text).join('\n');

    if (toolUses.length === 0 || res.stop_reason === 'end_turn') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const input = (use.input ?? {}) as Record<string, unknown>;
      const result = await runTool(use.name, input);
      steps.push(`${use.name}: ${result.message}`);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: result.message,
        is_error: !result.ok,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return NextResponse.json({
    ok: true,
    steps,
    summary: finalText || steps.join(' · ') || 'done',
  });
}

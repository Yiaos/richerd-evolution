import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export interface ExtractedTurn {
  id: string;
  intent: string;
  skillUsed: string | null;
  context: string;
  sourceSession: string;
  sourceTurnId: string;
}

interface ExtractOptions {
  input: string;
  output: string;
  contextChars: number;
}

function parseArgs(argv: string[]): ExtractOptions {
  const opts = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    const idx = arg.indexOf('=');
    if (idx === -1) continue;
    opts.set(arg.slice(0, idx), arg.slice(idx + 1));
  }

  const input = opts.get('--input');
  const output = opts.get('--output');
  if (!input || !output) {
    throw new Error('Usage: extract-turns.ts --input=<session.jsonl> --output=<turns.jsonl> [--context-chars=500]');
  }

  const contextChars = Number(opts.get('--context-chars') ?? '500');
  if (!Number.isFinite(contextChars) || contextChars < 0) {
    throw new Error('--context-chars must be a non-negative number');
  }

  return { input, output, contextChars };
}

function getRole(record: Record<string, unknown>): string {
  const role = record.role ?? record.author ?? record.type;
  return typeof role === 'string' ? role.toLowerCase() : '';
}

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return textFromUnknown(obj.text ?? obj.content ?? obj.message ?? obj.value ?? '');
  }
  return '';
}

function getText(record: Record<string, unknown>): string {
  return textFromUnknown(record.content ?? record.message ?? record.text ?? record.input ?? record.output).trim();
}

function recordId(record: Record<string, unknown>, index: number): string {
  for (const key of ['id', 'turnId', 'turn_id', 'messageId', 'message_id']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return `line-${index + 1}`;
}

function findSkillNames(raw: string): string[] {
  const names = new Set<string>();
  const re = /(?:^|[\s"'])((?:~|\/|\.\/|\.\.\/)[^\s"']*?\/([^\/\s"']+)\/SKILL\.md)(?=$|[\s"'])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[2]?.trim();
    if (name) names.add(name);
  }
  return [...names].sort();
}

export function extractTurnsFromJsonl(raw: string, sourceSession: string, contextChars = 500): ExtractedTurn[] {
  const records = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ raw: line, index, parsed: JSON.parse(line) as Record<string, unknown> }));

  const turns: ExtractedTurn[] = [];
  let previousText = '';

  for (let i = 0; i < records.length; i += 1) {
    const current = records[i];
    const role = getRole(current.parsed);
    const text = getText(current.parsed);

    if (role === 'user' && text) {
      const turnRecords: string[] = [current.raw];
      for (let j = i + 1; j < records.length; j += 1) {
        if (getRole(records[j].parsed) === 'user') break;
        turnRecords.push(records[j].raw);
      }
      const skills = findSkillNames(turnRecords.join('\n'));
      const sourceTurnId = recordId(current.parsed, current.index);
      turns.push({
        id: `${path.basename(sourceSession)}:${sourceTurnId}`,
        intent: text,
        skillUsed: skills[0] ?? null,
        context: previousText.slice(-contextChars),
        sourceSession,
        sourceTurnId,
      });
    }

    if (text) {
      previousText = previousText ? `${previousText}\n${text}` : text;
    }
  }

  return turns;
}

export async function extractTurnsFile(options: ExtractOptions): Promise<ExtractedTurn[]> {
  const raw = await fs.readFile(options.input, 'utf8');
  const sourceSession = path.basename(options.input);
  const turns = extractTurnsFromJsonl(raw, sourceSession, options.contextChars);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${turns.map((turn) => JSON.stringify(turn)).join('\n')}\n`, 'utf8');
  return turns;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const turns = await extractTurnsFile(options);
  console.log(`Extracted ${turns.length} turns to ${options.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}

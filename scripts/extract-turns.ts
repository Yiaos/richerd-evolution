import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export interface ExtractTurnsOptions {
  input: string;
  output: string;
  contextChars?: number;
}

export interface ExtractedTurn {
  id: string;
  intent: string;
  skillUsed: string | null;
  context: string;
  sourceSession: string;
  sourceTurnId: string;
}

type JsonRecord = Record<string, unknown>;

function parseArgs(argv: string[]): ExtractTurnsOptions {
  const opts: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    const idx = arg.indexOf('=');
    if (idx === -1) continue;
    opts[arg.slice(0, idx)] = arg.slice(idx + 1);
  }

  if (!opts['--input'] || !opts['--output']) {
    throw new Error('Usage: extract-turns --input=<session.jsonl> --output=<turns.jsonl> [--context-chars=<number>]');
  }

  const contextChars = opts['--context-chars'] === undefined ? 500 : Number(opts['--context-chars']);
  if (!Number.isFinite(contextChars) || contextChars < 0) {
    throw new Error('--context-chars must be a non-negative number');
  }

  return {
    input: opts['--input'],
    output: opts['--output'],
    contextChars,
  };
}

function unwrapMessage(record: JsonRecord): JsonRecord {
  const message = record.message;
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    return message as JsonRecord;
  }
  return record;
}

function roleOf(record: JsonRecord): string | null {
  const message = unwrapMessage(record);
  const role = message.role ?? record.role;
  return typeof role === 'string' ? role : null;
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item));
  if (typeof value === 'object') {
    const obj = value as JsonRecord;
    const direct = [obj.text, obj.content, obj.input, obj.output, obj.path, obj.filePath]
      .flatMap((item) => collectText(item));
    return direct;
  }
  return [];
}

function textOf(record: JsonRecord): string {
  const message = unwrapMessage(record);
  return collectText(message.content ?? record.content ?? message.text ?? record.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recordId(record: JsonRecord, fallback: string): string {
  const message = unwrapMessage(record);
  const id = message.id ?? record.id ?? record.turnId ?? record.sourceTurnId;
  return typeof id === 'string' && id.trim() ? id.trim() : fallback;
}

function extractSkillNameFromRecord(record: JsonRecord): string | null {
  const haystack = JSON.stringify(record);
  const match = haystack.match(/(?:^|[\\/])([^\\/\s"']+)[\\/]SKILL\.md/);
  return match?.[1] ?? null;
}

function findSkillUsed(records: JsonRecord[], userIndex: number): string | null {
  for (let i = userIndex + 1; i < records.length; i += 1) {
    if (roleOf(records[i]) === 'user') break;
    const skill = extractSkillNameFromRecord(records[i]);
    if (skill) return skill;
  }
  return null;
}

function trimContext(parts: string[], contextChars: number): string {
  if (contextChars <= 0) return '';
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= contextChars) return text;
  return text.slice(-contextChars);
}

export function extractTurnsFromRecords(records: JsonRecord[], sourceSession: string, contextChars = 500): ExtractedTurn[] {
  const turns: ExtractedTurn[] = [];
  const priorText: string[] = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const role = roleOf(record);
    const text = textOf(record);

    if (role === 'user' && text) {
      const id = `turn-${turns.length + 1}`;
      turns.push({
        id,
        intent: text.replace(/\s+/g, ' ').trim(),
        skillUsed: findSkillUsed(records, i),
        context: trimContext(priorText, contextChars),
        sourceSession,
        sourceTurnId: recordId(record, id),
      });
    }

    if ((role === 'user' || role === 'assistant') && text) {
      priorText.push(text);
    }
  }

  return turns;
}

async function readJsonl(filePath: string): Promise<JsonRecord[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('record must be an object');
        }
        return parsed as JsonRecord;
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${(error as Error).message}`);
      }
    });
}

export async function extractTurns(options: ExtractTurnsOptions): Promise<ExtractedTurn[]> {
  const records = await readJsonl(options.input);
  const turns = extractTurnsFromRecords(records, path.basename(options.input), options.contextChars ?? 500);
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, turns.map((turn) => JSON.stringify(turn)).join('\n') + (turns.length ? '\n' : ''), 'utf8');
  return turns;
}

async function main() {
  const turns = await extractTurns(parseArgs(process.argv));
  console.log(`Extracted ${turns.length} turn(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

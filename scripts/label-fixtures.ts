import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseFixtureLine } from '../src/routing-eval.js';
import type { RoutingFixture } from '../src/routing-eval.js';
import type { ExtractedTurn } from './extract-turns.js';

interface ReviewLabel {
  id?: string;
  turnId?: string;
  sourceTurnId?: string;
  expectedSkill: string | null;
  shouldTrigger: boolean;
  rationale: string;
  reviewedBy?: string | null;
  reviewStatus?: string;
}

interface LabelOptions {
  input: string;
  review: string;
  output: string;
}

function parseArgs(argv: string[]): LabelOptions {
  const opts = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    const idx = arg.indexOf('=');
    if (idx === -1) continue;
    opts.set(arg.slice(0, idx), arg.slice(idx + 1));
  }

  const input = opts.get('--input');
  const review = opts.get('--review');
  const output = opts.get('--output');

  if (!input || !output) {
    throw new Error('Usage: label-fixtures.ts --input=<turns.jsonl> --review=<review-labels.jsonl> --output=<fixtures.jsonl>');
  }
  if (!review) {
    throw new Error('label-fixtures requires --review with human-reviewed labels');
  }

  return { input, review, output };
}

function readJsonl<T>(raw: string): T[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function reviewKeys(label: ReviewLabel): string[] {
  return [label.id, label.turnId, label.sourceTurnId].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function buildFixtures(turns: ExtractedTurn[], labels: ReviewLabel[]): RoutingFixture[] {
  const labelsByKey = new Map<string, ReviewLabel>();
  for (const label of labels) {
    for (const key of reviewKeys(label)) {
      if (!labelsByKey.has(key)) labelsByKey.set(key, label);
    }
  }

  return turns.map((turn) => {
    const label = labelsByKey.get(turn.id) ?? labelsByKey.get(turn.sourceTurnId);
    if (!label) {
      throw new Error(`Missing human review label for extracted turn ${turn.id}`);
    }
    if (label.reviewStatus && label.reviewStatus !== 'approved') {
      throw new Error(`Review label for ${turn.id} is not approved: ${label.reviewStatus}`);
    }

    const fixture: RoutingFixture = {
      id: turn.id,
      intent: turn.intent,
      expectedSkill: label.expectedSkill,
      shouldTrigger: label.shouldTrigger,
      rationale: label.rationale,
      labelSource: 'human',
      labelerModel: null,
      labelerPromptVersion: 'manual-v1',
      reviewedBy: label.reviewedBy ?? null,
      reviewStatus: 'approved',
      sourceSession: turn.sourceSession,
      sourceTurnId: turn.sourceTurnId,
    };

    parseFixtureLine(JSON.stringify(fixture));
    return fixture;
  });
}

export async function labelFixturesFile(options: LabelOptions): Promise<RoutingFixture[]> {
  const [turnsRaw, labelsRaw] = await Promise.all([
    fs.readFile(options.input, 'utf8'),
    fs.readFile(options.review, 'utf8'),
  ]);

  const turns = readJsonl<ExtractedTurn>(turnsRaw);
  const labels = readJsonl<ReviewLabel>(labelsRaw);
  const fixtures = buildFixtures(turns, labels);

  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${fixtures.map((fixture) => JSON.stringify(fixture)).join('\n')}\n`, 'utf8');
  return fixtures;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const fixtures = await labelFixturesFile(options);
  console.log(`Wrote ${fixtures.length} reviewed fixtures to ${options.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}

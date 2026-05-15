import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseFixtureLine } from '../src/routing-eval.js';
import type { RoutingFixture } from '../src/routing-eval.js';
import type { ExtractedTurn } from './extract-turns.js';

export interface LabelFixturesOptions {
  input: string;
  output: string;
  review: string;
}

interface ReviewLabel {
  id?: string;
  sourceTurnId?: string;
  expectedSkill: string | null;
  shouldTrigger: boolean;
  rationale?: string;
  reviewedBy?: string | null;
}

function parseArgs(argv: string[]): LabelFixturesOptions {
  const opts: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    const idx = arg.indexOf('=');
    if (idx === -1) continue;
    opts[arg.slice(0, idx)] = arg.slice(idx + 1);
  }

  if (!opts['--review']) {
    throw new Error('Phase 1 requires human-reviewed labels: pass --review=<review-labels.jsonl>');
  }
  if (!opts['--input'] || !opts['--output']) {
    throw new Error('Usage: label-fixtures --input=<turns.jsonl> --review=<review-labels.jsonl> --output=<fixtures.jsonl>');
  }

  return {
    input: opts['--input'],
    output: opts['--output'],
    review: opts['--review'],
  };
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${(error as Error).message}`);
      }
    });
}

function validateReviewLabel(label: ReviewLabel): void {
  if (typeof label.shouldTrigger !== 'boolean') {
    throw new Error('Review label must include boolean shouldTrigger');
  }
  if (label.expectedSkill !== null && typeof label.expectedSkill !== 'string') {
    throw new Error('Review label expectedSkill must be string or null');
  }
  if (label.shouldTrigger && (!label.expectedSkill || !label.expectedSkill.trim())) {
    throw new Error('Review label with shouldTrigger=true requires non-empty expectedSkill');
  }
}

function buildReviewMap(labels: ReviewLabel[]): Map<string, ReviewLabel> {
  const map = new Map<string, ReviewLabel>();
  for (const label of labels) {
    validateReviewLabel(label);
    const keys = [label.id, label.sourceTurnId].filter((key): key is string => typeof key === 'string' && key.trim().length > 0);
    if (keys.length === 0) {
      throw new Error('Review label must include id or sourceTurnId');
    }
    for (const key of keys) map.set(key, label);
  }
  return map;
}

export async function labelFixtures(options: LabelFixturesOptions): Promise<RoutingFixture[]> {
  const turns = await readJsonl<ExtractedTurn>(options.input);
  const reviews = buildReviewMap(await readJsonl<ReviewLabel>(options.review));

  const fixtures = turns.map((turn) => {
    const review = reviews.get(turn.id) ?? reviews.get(turn.sourceTurnId);
    if (!review) {
      throw new Error(`Missing human-reviewed label for turn ${turn.id} (${turn.sourceTurnId})`);
    }

    const fixture: RoutingFixture = {
      id: turn.id,
      intent: turn.intent,
      expectedSkill: review.expectedSkill,
      shouldTrigger: review.shouldTrigger,
      rationale: review.rationale,
      labelSource: 'human',
      labelerModel: null,
      labelerPromptVersion: 'manual-v1',
      reviewedBy: review.reviewedBy ?? null,
      reviewStatus: 'approved',
      sourceSession: turn.sourceSession,
      sourceTurnId: turn.sourceTurnId,
    };

    parseFixtureLine(JSON.stringify(fixture));
    return fixture;
  });

  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, fixtures.map((fixture) => JSON.stringify(fixture)).join('\n') + (fixtures.length ? '\n' : ''), 'utf8');
  return fixtures;
}

async function main() {
  const fixtures = await labelFixtures(parseArgs(process.argv));
  console.log(`Labeled ${fixtures.length} fixture(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

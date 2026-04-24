import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadSkillCatalog } from '../src/skill-catalog.js';
import { parseFixtureLine, runRoutingEval } from '../src/routing-eval.js';
import type { SkillInfo } from '../src/skill-catalog.js';

interface EvalOptions {
  fixturePath: string;
  catalogRoot: string;
  reportDir: string;
}

function parseArgs(argv: string[]): EvalOptions {
  const args = argv.slice(2);
  const opts: Record<string, string> = {};

  for (const arg of args) {
    const idx = arg.indexOf('=');
    if (idx === -1) continue;
    const k = arg.slice(0, idx);
    const v = arg.slice(idx + 1);
    if (k && v) {
      opts[k] = v;
    }
  }

  const baseDir = path.dirname(fileURLToPath(import.meta.url));

  return {
    fixturePath:
      opts['--fixture'] || path.join(baseDir, '../fixtures/skill-routing.jsonl'),
    catalogRoot: opts['--catalog-root'] || process.env.SKILL_ROOT || '~/.openclaw/workspace/skills',
    reportDir: opts['--report-dir'] || path.join(baseDir, '../reports'),
  };
}

async function readFixtureLines(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return parseFixtureLine(line);
      } catch (err) {
        throw new Error(`Invalid fixture line at index ${index + 1}: ${(err as Error).message}`);
      }
    });
}

function findMissingExpectedSkills(fixtures: { expectedSkill: string; shouldTrigger: boolean }[], catalog: SkillInfo[]) {
  const catalogSet = new Set(catalog.map((s) => s.name));
  return fixtures.filter((entry) => entry.shouldTrigger && !catalogSet.has(entry.expectedSkill));
}

async function main() {
  const options = parseArgs(process.argv);
  const fixtures = await readFixtureLines(options.fixturePath);
  const catalog = await loadSkillCatalog(options.catalogRoot);

  const missing = findMissingExpectedSkills(fixtures, catalog);
  if (missing.length > 0) {
    const lines = missing.map((entry) => `- ${entry.expectedSkill}`);
    throw new Error(`Expected skills missing in catalog:\n${lines.join('\n')}`);
  }

  const result = runRoutingEval(fixtures, catalog);

  await fs.mkdir(options.reportDir, { recursive: true });

  const timestamped = path.join(options.reportDir, `routing-eval-${Date.now()}.json`);
  const latest = path.join(options.reportDir, 'routing-eval-latest.json');

  const report = {
    ...result,
    environment: {
      node: process.version,
      platform: os.platform(),
      catalogSize: catalog.length,
    },
  };
  const reportText = JSON.stringify(report, null, 2);

  await Promise.all([
    fs.writeFile(timestamped, reportText),
    fs.writeFile(latest, reportText),
  ]);

  const summary = `Routing eval: ${result.passed}/${result.total} passed (${result.failed} failed)`;
  console.log(summary);
  if (result.failed > 0) {
    for (const item of result.results) {
      if (!item.passed) {
        console.log(
          `- ${item.id} => expected ${item.expectedSkill} ${
            item.expectedShouldTrigger ? '(should trigger)' : '(should not trigger)'
          }; got ${item.predictedSkill}`,
        );
      }
    }
    process.exitCode = 1;
  }
}

await main();

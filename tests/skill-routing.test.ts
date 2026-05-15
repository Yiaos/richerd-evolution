import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import {
  parseFixtureLine,
  runRoutingEval,
  lexicalResolve,
  RoutingFixture,
} from '../src/routing-eval.js';
import { loadSkillCatalog } from '../src/skill-catalog.js';

type Skill = { name: string; description: string };
type RoutingResult = {
  id: string;
  passed: boolean;
  predictedSkill: string | null;
  expectedSkill: string | null;
  expectedShouldTrigger: boolean;
};

function writeFixture(dir: string, name: string, lines: string[]) {
  return writeFile(path.join(dir, name), lines.join('\n'), 'utf8');
}

function writeSkill(dir: string, name: string) {
  return writeFile(path.join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n`, 'utf8');
}

test('parseFixtureLine validates required fields', () => {
  const good = parseFixtureLine('{"id":"case-1","intent":"test intent","expectedSkill":"foo","shouldTrigger":true}');
  assert.equal(good.id, 'case-1');
  assert.equal(good.shouldTrigger, true);

  assert.throws(() => parseFixtureLine(''), /Empty fixture line/);
});

test('parseFixtureLine accepts expectedSkill:null when shouldTrigger=false', () => {
  const fixture = parseFixtureLine(
    JSON.stringify({
      id: 'case-null-ok',
      intent: 'just chatting',
      expectedSkill: null,
      shouldTrigger: false,
      rationale: 'no skill should be triggered',
    }),
  );

  assert.equal(fixture.expectedSkill, null);
  assert.equal(fixture.shouldTrigger, false);
});

test('parseFixtureLine rejects expectedSkill:null when shouldTrigger=true', () => {
  assert.throws(
    () =>
      parseFixtureLine(
        JSON.stringify({
          id: 'case-null-bad',
          intent: 'please do code review',
          expectedSkill: null,
          shouldTrigger: true,
        }),
      ),
    /expectedSkill cannot be null when shouldTrigger=true/,
  );
});

test('parseFixtureLine rejects non-string/non-null expectedSkill', () => {
  assert.throws(
    () =>
      parseFixtureLine(
        JSON.stringify({
          id: 'case-bad-type',
          intent: 'anything',
          expectedSkill: 123,
          shouldTrigger: false,
        }),
      ),
    /expectedSkill must be string\|null/,
  );
});

test('parseFixtureLine rejects missing expectedSkill field', () => {
  assert.throws(
    () =>
      parseFixtureLine(
        JSON.stringify({
          id: 'case-missing',
          intent: 'anything',
          shouldTrigger: false,
        }),
      ),
    /expectedSkill is required/,
  );
});

test('parseFixtureLine preserves metadata fields', () => {
  const fixture = parseFixtureLine(
    JSON.stringify({
      id: 'case-meta',
      intent: 'collect one article',
      expectedSkill: 'collect-article',
      shouldTrigger: true,
      labelSource: 'human',
      labelerModel: null,
      labelerPromptVersion: 'manual-v1',
      reviewedBy: 'richer',
      reviewStatus: 'approved',
      sourceSession: 'session-001.jsonl',
      sourceTurnId: 'turn-42',
    }),
  );

  assert.equal(fixture.labelSource, 'human');
  assert.equal(fixture.labelerModel, null);
  assert.equal(fixture.labelerPromptVersion, 'manual-v1');
  assert.equal(fixture.reviewedBy, 'richer');
  assert.equal(fixture.reviewStatus, 'approved');
  assert.equal(fixture.sourceSession, 'session-001.jsonl');
  assert.equal(fixture.sourceTurnId, 'turn-42');
});

test('routing fixture validates and supports deterministic baseline', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const skills = path.join(tmp, 'skills');
    await mkdir(skills, { recursive: true });
    await mkdir(path.join(skills, 'collect-article'), { recursive: true });
    await mkdir(path.join(skills, 'task-planner'), { recursive: true });
    await writeSkill(skills, 'collect-article');
    await writeSkill(skills, 'task-planner');

    const catalog = await loadSkillCatalog(skills);
    const catalogNames = new Set(catalog.map((s: Skill) => s.name));
    assert.equal(catalogNames.has('collect-article'), true);
    assert.equal(catalogNames.has('task-planner'), true);

    const raw = [
      JSON.stringify({
        id: 'case-collect',
        intent: 'collect article for this link',
        expectedSkill: 'collect-article',
        shouldTrigger: true,
        rationale: 'collect article intent',
      }),
      JSON.stringify({
        id: 'case-trigger',
        intent: '请先帮我做一次回顾',
        expectedSkill: null,
        shouldTrigger: false,
        rationale: 'no trigger expected',
      }),
    ];

    const fixturesPath = path.join(tmp, 'skill-routing.jsonl');
    await writeFixture(tmp, 'skill-routing.jsonl', raw);

    const lines = (await readFile(fixturesPath, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseFixtureLine(line));

    const noMissing = lines.filter((entry: RoutingFixture) => entry.shouldTrigger && entry.expectedSkill !== null && catalogNames.has(entry.expectedSkill));
    assert.equal(noMissing.length, 1, 'only collect-article should be required');
    assert.equal(noMissing[0].expectedSkill, 'collect-article');

    const result = runRoutingEval(lines, catalog, lexicalResolve);
    assert.equal(result.total, 2);
    assert.equal(result.passed + result.failed, 2);

    const collect = result.results.find((r: RoutingResult) => r.id === 'case-collect');
    const trigger = result.results.find((r: RoutingResult) => r.id === 'case-trigger');
    assert.ok(collect);
    assert.ok(trigger);
    assert.equal(collect?.passed, true, 'collect article should be matched by lexical baseline');
    assert.equal(trigger?.predictedSkill, null);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('runRoutingEval returns strict confusion matrix and pass semantics', () => {
  const fixtures: RoutingFixture[] = [
    {
      id: 'tp',
      intent: 'trigger expected A',
      expectedSkill: 'skill-a',
      shouldTrigger: true,
    },
    {
      id: 'tn',
      intent: 'should not trigger',
      expectedSkill: null,
      shouldTrigger: false,
    },
    {
      id: 'fn',
      intent: 'miss expected',
      expectedSkill: 'skill-b',
      shouldTrigger: true,
    },
    {
      id: 'fp',
      intent: 'unexpected trigger',
      expectedSkill: null,
      shouldTrigger: false,
    },
    {
      id: 'ws',
      intent: 'wrong skill',
      expectedSkill: 'skill-c',
      shouldTrigger: true,
    },
  ];

  const predictions = new Map<string, string | null>([
    ['trigger expected A', 'skill-a'],
    ['should not trigger', null],
    ['miss expected', null],
    ['unexpected trigger', 'skill-z'],
    ['wrong skill', 'skill-x'],
  ]);

  const resolver = (intent: string): string | null => predictions.get(intent) ?? null;
  const result = runRoutingEval(fixtures, [{ name: 'skill-a' }], resolver);

  assert.equal(result.confusionMatrix.truePositive, 1);
  assert.equal(result.confusionMatrix.trueNegative, 1);
  assert.equal(result.confusionMatrix.falseNegative, 1);
  assert.equal(result.confusionMatrix.falsePositive, 1);
  assert.equal(result.confusionMatrix.wrongSkill, 1);
  assert.equal(result.confusionMatrix.routingPassRate, 2 / 5);

  const resultById = new Map(result.results.map((r) => [r.id, r]));
  assert.equal(resultById.get('tp')?.passed, true);
  assert.equal(resultById.get('tn')?.passed, true);
  assert.equal(resultById.get('fn')?.passed, false);
  assert.equal(resultById.get('fp')?.passed, false);
  assert.equal(resultById.get('ws')?.passed, false);
});

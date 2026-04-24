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
  expectedSkill: string;
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
        expectedSkill: 'code-review',
        shouldTrigger: false,
        rationale: 'no code-review skill installed',
      }),
    ];

    const fixturesPath = path.join(tmp, 'skill-routing.jsonl');
    await writeFixture(tmp, 'skill-routing.jsonl', raw);

    const lines = (await readFile(fixturesPath, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseFixtureLine(line));

    const noMissing = lines.filter((entry: RoutingFixture) => entry.shouldTrigger && catalogNames.has(entry.expectedSkill));
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

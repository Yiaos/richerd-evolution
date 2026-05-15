import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractTurnsFile, extractTurnsFromJsonl } from '../scripts/extract-turns.js';
import { buildFixtures, labelFixturesFile } from '../scripts/label-fixtures.js';

const execFileAsync = promisify(execFile);

function jsonl(records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

test('extractTurnsFromJsonl extracts user turns and deterministic SKILL.md usage', () => {
  const session = jsonl([
    { id: 'a1', role: 'assistant', content: 'Earlier context' },
    { id: 'u1', role: 'user', content: '请帮我做 code review' },
    { id: 'tool1', role: 'tool', content: 'read ~/worksp/richerd-skills/skills/universal/code-review/SKILL.md' },
    { id: 'u2', role: 'user', content: '今天天气怎么样' },
  ]);

  const turns = extractTurnsFromJsonl(session, 'session-test.jsonl', 20);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].id, 'session-test.jsonl:u1');
  assert.equal(turns[0].intent, '请帮我做 code review');
  assert.equal(turns[0].skillUsed, 'code-review');
  assert.equal(turns[0].sourceTurnId, 'u1');
  assert.equal(turns[1].skillUsed, null);
  assert.ok(turns[1].context.includes('SKILL.md') || turns[1].context.includes('code review'));
});

test('labelFixturesFile merges human reviews into valid fixtures including null expectedSkill', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-fixtures-'));
  try {
    const sessionPath = path.join(tmp, 'session.jsonl');
    const turnsPath = path.join(tmp, 'turns.jsonl');
    const reviewPath = path.join(tmp, 'review.jsonl');
    const fixturesPath = path.join(tmp, 'fixtures.jsonl');

    await writeFile(
      sessionPath,
      jsonl([
        { id: 'u1', role: 'user', content: '请帮我做 code review' },
        { id: 'tool1', role: 'tool', content: 'read ~/.agents/skills/code-review/SKILL.md' },
        { id: 'u2', role: 'user', content: '今天天气怎么样' },
      ]),
      'utf8',
    );

    await extractTurnsFile({ input: sessionPath, output: turnsPath, contextChars: 100 });
    await writeFile(
      reviewPath,
      jsonl([
        { sourceTurnId: 'u1', expectedSkill: 'code-review', shouldTrigger: true, rationale: 'explicit review ask', reviewedBy: 'richer', reviewStatus: 'approved' },
        { sourceTurnId: 'u2', expectedSkill: null, shouldTrigger: false, rationale: 'weather small talk', reviewedBy: 'richer', reviewStatus: 'approved' },
      ]),
      'utf8',
    );

    const fixtures = await labelFixturesFile({ input: turnsPath, review: reviewPath, output: fixturesPath });
    assert.equal(fixtures.length, 2);
    assert.equal(fixtures[0].labelSource, 'human');
    assert.equal(fixtures[0].labelerModel, null);
    assert.equal(fixtures[0].labelerPromptVersion, 'manual-v1');
    assert.equal(fixtures[0].reviewStatus, 'approved');
    assert.equal(fixtures[1].expectedSkill, null);
    assert.equal(fixtures[1].shouldTrigger, false);

    const written = await readFile(fixturesPath, 'utf8');
    assert.match(written, /"expectedSkill":null/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('label-fixtures CLI refuses to run without --review', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-fixtures-'));
  try {
    const input = path.join(tmp, 'turns.jsonl');
    const output = path.join(tmp, 'fixtures.jsonl');
    await writeFile(input, jsonl([{ id: 't1', intent: 'hi', skillUsed: null, context: '', sourceSession: 's.jsonl', sourceTurnId: 'u1' }]), 'utf8');

    await assert.rejects(
      execFileAsync('node', ['--import', 'tsx', 'scripts/label-fixtures.ts', `--input=${input}`, `--output=${output}`], { cwd: path.resolve('.') }),
      /label-fixtures requires --review/,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('buildFixtures rejects unapproved labels', () => {
  assert.throws(
    () =>
      buildFixtures(
        [{ id: 't1', intent: 'review code', skillUsed: null, context: '', sourceSession: 's.jsonl', sourceTurnId: 'u1' }],
        [{ sourceTurnId: 'u1', expectedSkill: 'code-review', shouldTrigger: true, rationale: 'review', reviewStatus: 'pending' }],
      ),
    /not approved/,
  );
});

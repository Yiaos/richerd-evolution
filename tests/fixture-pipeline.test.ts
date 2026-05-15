import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extractTurns } from '../scripts/extract-turns.js';
import { labelFixtures } from '../scripts/label-fixtures.js';
import { parseFixtureLine } from '../src/routing-eval.js';

test('fixture pipeline extracts turns and applies human-reviewed labels', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-pipeline-'));
  try {
    const sessionPath = path.join(tmp, 'session.jsonl');
    const turnsPath = path.join(tmp, 'turns.jsonl');
    const reviewPath = path.join(tmp, 'review.jsonl');
    const fixturesPath = path.join(tmp, 'fixtures.jsonl');

    const records = [
      { id: 'u1', role: 'user', content: '请写一个 spec' },
      { role: 'assistant', content: [{ type: 'text', text: 'reading /Users/iaos/.agents/skills/spec-design/SKILL.md' }] },
      { id: 'u2', role: 'user', content: '今天天气怎么样' },
      { role: 'assistant', content: '闲聊回答，不读取 skill' },
    ];
    await writeFile(sessionPath, records.map((item) => JSON.stringify(item)).join('\n'), 'utf8');

    const turns = await extractTurns({ input: sessionPath, output: turnsPath, contextChars: 80 });
    assert.equal(turns.length, 2);
    assert.equal(turns[0].id, 'turn-1');
    assert.equal(turns[0].intent, '请写一个 spec');
    assert.equal(turns[0].skillUsed, 'spec-design');
    assert.equal(turns[0].sourceSession, 'session.jsonl');
    assert.equal(turns[0].sourceTurnId, 'u1');
    assert.equal(turns[1].skillUsed, null);

    const reviewLabels = [
      { id: 'turn-1', expectedSkill: 'spec-design', shouldTrigger: true, rationale: 'explicit spec request', reviewedBy: 'richer' },
      { sourceTurnId: 'u2', expectedSkill: null, shouldTrigger: false, rationale: 'ordinary chat', reviewedBy: 'richer' },
    ];
    await writeFile(reviewPath, reviewLabels.map((item) => JSON.stringify(item)).join('\n'), 'utf8');

    const fixtures = await labelFixtures({ input: turnsPath, review: reviewPath, output: fixturesPath });
    assert.equal(fixtures.length, 2);
    assert.equal(fixtures[0].expectedSkill, 'spec-design');
    assert.equal(fixtures[0].labelSource, 'human');
    assert.equal(fixtures[0].labelerModel, null);
    assert.equal(fixtures[0].labelerPromptVersion, 'manual-v1');
    assert.equal(fixtures[0].reviewStatus, 'approved');
    assert.equal(fixtures[1].expectedSkill, null);

    const written = (await readFile(fixturesPath, 'utf8')).trim().split('\n').map(parseFixtureLine);
    assert.equal(written.length, 2);
    assert.equal(written[1].expectedSkill, null);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

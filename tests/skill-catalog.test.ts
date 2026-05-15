import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSkillCatalog, DEFAULT_SKILL_ROOTS } from '../src/skill-catalog.js';

type Skill = { name: string; description: string };

function fmFrom(name: string, description: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    `# ${name}`,
    '',
  ].join('\n');
}

test('DEFAULT_SKILL_ROOTS contains all required roots', () => {
  assert.deepEqual(DEFAULT_SKILL_ROOTS, [
    '~/worksp/richerd-skills/skills/richerd',
    '~/worksp/richerd-skills/skills/third-party',
    '~/worksp/richerd-skills/skills/universal',
    '~/.openclaw/workspace/skills',
    '~/.agents/skills',
    '~/.openclaw/npm/node_modules/openclaw/skills/',
    '~/.openclaw/plugin-skills/',
  ]);
});

test('loadSkillCatalog reads SKILL.md frontmatter', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const root = path.join(tmp, 'skills');
    const s1 = path.join(root, 'alpha');
    const s2 = path.join(root, 'beta');
    await mkdir(s1, { recursive: true });
    await mkdir(s2, { recursive: true });

    await writeFile(path.join(s1, 'SKILL.md'), fmFrom('alpha', 'alpha does things'));
    await writeFile(path.join(s2, 'SKILL.md'), fmFrom('beta', 'beta helps work'));

    const catalog = await loadSkillCatalog(root);
    assert.equal(catalog.length, 2);

    const first = catalog.find((s: Skill) => s.name === 'alpha');
    const second = catalog.find((s: Skill) => s.name === 'beta');
    assert.ok(first);
    assert.ok(second);
    assert.equal(first?.description, 'alpha does things');
    assert.equal(second?.description, 'beta helps work');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('loadSkillCatalog supports fallback to header-like title when name missing', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const root = path.join(tmp, 'skills');
    const s1 = path.join(root, 'gamma');
    await mkdir(s1, { recursive: true });
    await writeFile(path.join(s1, 'SKILL.md'), '# gamma\nFallback heading body');

    const catalog = await loadSkillCatalog(root);
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].name, 'gamma');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('loadSkillCatalog supports multi-root + ENOENT tolerance + first-seen dedup', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const rootA = path.join(tmp, 'root-a');
    const rootB = path.join(tmp, 'root-b');
    const missing = path.join(tmp, 'root-missing');

    await mkdir(path.join(rootA, 'dup-skill'), { recursive: true });
    await mkdir(path.join(rootA, 'only-a'), { recursive: true });
    await mkdir(path.join(rootB, 'dup-skill-b'), { recursive: true });
    await mkdir(path.join(rootB, 'only-b'), { recursive: true });

    await writeFile(path.join(rootA, 'dup-skill', 'SKILL.md'), fmFrom('dup-skill', 'from root A'));
    await writeFile(path.join(rootA, 'only-a', 'SKILL.md'), fmFrom('only-a', 'from root A'));
    await writeFile(path.join(rootB, 'dup-skill-b', 'SKILL.md'), fmFrom('dup-skill', 'from root B'));
    await writeFile(path.join(rootB, 'only-b', 'SKILL.md'), fmFrom('only-b', 'from root B'));

    const catalog = await loadSkillCatalog({ roots: [rootA, missing, rootB] });
    const byName = new Map(catalog.map((s) => [s.name, s]));

    assert.equal(byName.get('dup-skill')?.description, 'from root A');
    assert.equal(byName.get('only-a')?.description, 'from root A');
    assert.equal(byName.get('only-b')?.description, 'from root B');
    assert.equal(catalog.filter((s) => s.name === 'dup-skill').length, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

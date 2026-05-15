import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
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

test('loadSkillCatalog reads SKILL.md frontmatter', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const root = path.join(tmp, 'skills');
    const s1 = path.join(root, 'alpha');
    const s2 = path.join(root, 'beta');
    await mkdir(s1, { recursive: true });
    await mkdir(s2, { recursive: true });

    await fs.writeFile(path.join(s1, 'SKILL.md'), fmFrom('alpha', 'alpha does things'));
    await fs.writeFile(path.join(s2, 'SKILL.md'), fmFrom('beta', 'beta helps work'));

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

test('DEFAULT_SKILL_ROOTS includes all expected default roots', () => {
  const roots = new Set<string>([...DEFAULT_SKILL_ROOTS]);
  const expected: string[] = [
    '~/worksp/richerd-skills/skills/richerd',
    '~/worksp/richerd-skills/skills/third-party',
    '~/.openclaw/workspace/skills',
    '~/.agents/skills',
    '~/.openclaw/npm/node_modules/openclaw/skills/',
    '~/.openclaw/plugin-skills/',
  ];

  for (const item of expected) {
    assert.equal(roots.has(item), true, `missing root: ${item}`);
  }
});

test('loadSkillCatalog supports fallback to header-like title when name missing', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const root = path.join(tmp, 'skills');
    const s1 = path.join(root, 'gamma');
    await mkdir(s1, { recursive: true });
    await fs.writeFile(path.join(s1, 'SKILL.md'), '# gamma\nFallback heading body');

    const catalog = await loadSkillCatalog(root);
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].name, 'gamma');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

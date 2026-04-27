import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { loadSkillCatalog } from '../src/skill-catalog.js';

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


test('loadSkillCatalog accepts multiple roots, dedupes by first root, and skips missing defaults', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'richerd-evo-'));
  try {
    const firstRoot = path.join(tmp, 'skills-a');
    const secondRoot = path.join(tmp, 'skills-b');
    await mkdir(path.join(firstRoot, 'alpha'), { recursive: true });
    await mkdir(path.join(secondRoot, 'alpha'), { recursive: true });
    await mkdir(path.join(secondRoot, 'beta'), { recursive: true });

    await fs.writeFile(path.join(firstRoot, 'alpha', 'SKILL.md'), fmFrom('alpha', 'first root wins'));
    await fs.writeFile(path.join(secondRoot, 'alpha', 'SKILL.md'), fmFrom('alpha', 'duplicate loses'));
    await fs.writeFile(path.join(secondRoot, 'beta', 'SKILL.md'), fmFrom('beta', 'second root included'));

    const catalog = await loadSkillCatalog([firstRoot, path.join(tmp, 'missing'), secondRoot].join(path.delimiter));
    assert.equal(catalog.length, 2);
    assert.equal(catalog.find((s: Skill) => s.name === 'alpha')?.description, 'first root wins');
    assert.equal(catalog.find((s: Skill) => s.name === 'beta')?.description, 'second root included');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

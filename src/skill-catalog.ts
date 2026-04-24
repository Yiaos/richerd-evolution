import { promises as fs } from "node:fs";
import path from "node:path";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

export interface SkillCatalogOptions {
  root?: string;
}

const DEFAULT_SKILL_ROOT = "~/.openclaw/workspace/skills";

function normalizeRoot(root?: string): string {
  if (!root) {
    return expandHome(DEFAULT_SKILL_ROOT);
  }
  return expandHome(root);
}

export function expandHome(rawPath: string): string {
  if (!rawPath.startsWith("~")) return rawPath;
  return path.join(process.env.HOME ?? "", rawPath.slice(2));
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const FIELD_RE = /^(\w+):\s*(.*)$/gm;

function parseFrontmatterOrHeading(content: string): { name?: string; description?: string } {
  const fmMatch = content.match(FRONTMATTER_RE);
  if (fmMatch && fmMatch[1]) {
    const block = fmMatch[1];
    const fields = new Map<string, string>();

    for (const line of block.split("\n")) {
      const m = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const value = m[2].trim();
      if (key) {
        fields.set(key.toLowerCase(), value.replace(/^"|"$/g, ""));
      }
    }

    const name = fields.get("name");
    const description = fields.get("description");
    return { name, description };
  }

  const headingMatch = content.match(/^#\s*(.+)\s*$/m);
  if (!headingMatch) {
    return {};
  }

  const name = headingMatch[1].trim();

  let description = "";
  const idx = headingMatch.index ?? -1;
  const after = content.slice(idx + headingMatch[0].length).trim();
  if (after) {
    description = after.split("\n", 2)[0].trim();
  }

  return { name, description: description || "" };
}

export async function loadSkillCatalog(root?: string): Promise<SkillInfo[]> {
  const rootPath = normalizeRoot(root);
  const dir = await fs.readdir(rootPath, { withFileTypes: true });

  const skills: SkillInfo[] = [];

  for (const entry of dir) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(rootPath, entry.name);
    const skillPath = path.join(skillDir, "SKILL.md");

    try {
      const content = await fs.readFile(skillPath, "utf8");
      const parsed = parseFrontmatterOrHeading(content);
      if (!parsed.name) continue;
      skills.push({
        name: parsed.name,
        description: parsed.description || "",
        path: skillDir,
      });
    } catch {
      // Skip invalid/missing skill files.
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

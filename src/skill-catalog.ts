import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
}

export interface SkillCatalogOptions {
  root?: string;
  roots?: string[];
}

export const DEFAULT_SKILL_ROOTS = [
  "~/worksp/richerd-skills/skills/richerd",
  "~/worksp/richerd-skills/skills/third-party",
  "~/worksp/richerd-skills/skills/universal",
] as const;

export function expandHome(rawPath: string): string {
  if (!rawPath.startsWith("~")) return rawPath;
  return path.join(process.env.HOME ?? "", rawPath.slice(2));
}

export function normalizeRoots(input?: string | SkillCatalogOptions): string[] {
  const rawRoots =
    typeof input === "string"
      ? [input]
      : input?.roots && input.roots.length > 0
        ? input.roots
        : input?.root
          ? [input.root]
          : [...DEFAULT_SKILL_ROOTS];

  const seen = new Set<string>();
  const roots: string[] = [];

  for (const rawRoot of rawRoots) {
    const normalized = expandHome(rawRoot).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(normalized);
  }

  return roots;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

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

export async function loadSkillCatalog(input?: string | SkillCatalogOptions): Promise<SkillInfo[]> {
  const roots = normalizeRoots(input);
  const skillByName = new Map<string, SkillInfo>();

  for (const rootPath of roots) {
    let dir: Dirent[];
    try {
      dir = await fs.readdir(rootPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const sortedDir = [...dir].sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sortedDir) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(rootPath, entry.name);
      const skillPath = path.join(skillDir, "SKILL.md");

      try {
        const content = await fs.readFile(skillPath, "utf8");
        const parsed = parseFrontmatterOrHeading(content);
        if (!parsed.name || skillByName.has(parsed.name)) continue;

        skillByName.set(parsed.name, {
          name: parsed.name,
          description: parsed.description || "",
          path: skillDir,
        });
      } catch {
        // Skip invalid/missing skill files.
      }
    }
  }

  return [...skillByName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

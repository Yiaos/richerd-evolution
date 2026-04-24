export interface RoutingFixture {
  id: string;
  intent: string;
  expectedSkill: string;
  shouldTrigger: boolean;
  rationale?: string;
}

export interface CatalogResolver {
  (intent: string, catalog: readonly { name: string }[]): string | null;
}

export interface RoutingCaseResult {
  id: string;
  intent: string;
  expectedSkill: string;
  expectedShouldTrigger: boolean;
  predictedSkill: string | null;
  passed: boolean;
}

export interface RoutingEvalResult {
  total: number;
  passed: number;
  failed: number;
  timestamp: string;
  results: RoutingCaseResult[];
}

export function parseFixtureLine(raw: string): RoutingFixture {
  if (!raw.trim()) {
    throw new Error("Empty fixture line");
  }

  const obj = JSON.parse(raw);
  if (!obj || typeof obj !== "object") {
    throw new Error("Invalid fixture record");
  }

  const id = String(obj.id ?? "").trim();
  const intent = String(obj.intent ?? "").trim();
  const expectedSkill = String(obj.expectedSkill ?? "").trim();
  const shouldTrigger = Boolean(obj.shouldTrigger);

  if (!id || !intent || !expectedSkill || typeof obj.shouldTrigger !== "boolean") {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }

  return {
    id,
    intent,
    expectedSkill,
    shouldTrigger,
    rationale: obj.rationale ? String(obj.rationale) : undefined,
  };
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9\u4e00-\u9fff-]+/g, ""))
    .filter(Boolean);
}

export function lexicalResolve(intent: string, catalog: readonly { name: string }[]): string | null {
  const tokens = tokenize(intent);
  if (tokens.length === 0) return null;

  const candidates = catalog
    .map((entry) => {
      const name = entry.name.toLowerCase();
      const score = tokens.reduce((acc, token) => acc + (name.includes(token) ? 1 : 0), 0);
      return { name: entry.name, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return candidates[0]?.name ?? null;
}

export function runRoutingEval(fixtures: RoutingFixture[], catalog: readonly { name: string }[], resolve: CatalogResolver = lexicalResolve): RoutingEvalResult {
  const results: RoutingCaseResult[] = [];
  let passed = 0;

  for (const fixture of fixtures) {
    const predicted = resolve(fixture.intent, catalog);
    const shouldMatch = fixture.shouldTrigger
      ? predicted !== null && predicted === fixture.expectedSkill
      : predicted === null || predicted !== fixture.expectedSkill;

    if (shouldMatch) {
      passed += 1;
    }

    results.push({
      id: fixture.id,
      intent: fixture.intent,
      expectedSkill: fixture.expectedSkill,
      expectedShouldTrigger: fixture.shouldTrigger,
      predictedSkill: predicted,
      passed: shouldMatch,
    });
  }

  return {
    total: fixtures.length,
    passed,
    failed: fixtures.length - passed,
    timestamp: new Date().toISOString(),
    results,
  };
}

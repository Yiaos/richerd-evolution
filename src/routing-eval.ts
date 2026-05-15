export interface RoutingFixture {
  id: string;
  intent: string;
  expectedSkill: string | null;
  shouldTrigger: boolean;
  rationale?: string;
  labelSource?: string;
  labelerModel?: string | null;
  labelerPromptVersion?: string;
  reviewedBy?: string | null;
  reviewStatus?: string;
  sourceSession?: string;
  sourceTurnId?: string;
}

export interface CatalogResolver {
  (intent: string, catalog: readonly { name: string }[]): string | null;
}

export interface ConfusionMatrix {
  truePositive: number;
  trueNegative: number;
  falseNegative: number;
  falsePositive: number;
  wrongSkill: number;
  routingPassRate: number;
}

export interface RoutingCaseResult {
  id: string;
  intent: string;
  expectedSkill: string | null;
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
  confusionMatrix: ConfusionMatrix;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  if (!(key in obj) || obj[key] == null) return undefined;
  if (typeof obj[key] !== 'string') {
    throw new Error(`Invalid ${key}: expected string`);
  }
  return obj[key] as string;
}

function readOptionalNullableString(obj: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in obj)) return undefined;
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${key}: expected string|null`);
  }
  return value;
}

export function parseFixtureLine(raw: string): RoutingFixture {
  if (!raw.trim()) {
    throw new Error('Empty fixture line');
  }

  const obj = JSON.parse(raw) as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') {
    throw new Error('Invalid fixture record');
  }

  const id = String(obj.id ?? '').trim();
  const intent = String(obj.intent ?? '').trim();

  if (!(Object.prototype.hasOwnProperty.call(obj, 'expectedSkill'))) {
    throw new Error('Invalid routing fixture: expectedSkill is required');
  }

  const expectedSkillRaw = obj.expectedSkill;
  let expectedSkill: string | null;
  if (expectedSkillRaw === null) {
    expectedSkill = null;
  } else if (typeof expectedSkillRaw === 'string') {
    expectedSkill = expectedSkillRaw.trim();
    if (!expectedSkill) {
      throw new Error('Invalid routing fixture: expectedSkill must be non-empty string or null');
    }
  } else {
    throw new Error('Invalid routing fixture: expectedSkill must be string|null');
  }

  if (typeof obj.shouldTrigger !== 'boolean') {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }
  const shouldTrigger = obj.shouldTrigger;

  if (!id || !intent) {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }

  if (shouldTrigger && expectedSkill === null) {
    throw new Error('Invalid routing fixture: expectedSkill cannot be null when shouldTrigger=true');
  }

  return {
    id,
    intent,
    expectedSkill,
    shouldTrigger,
    rationale: readOptionalString(obj, 'rationale'),
    labelSource: readOptionalString(obj, 'labelSource'),
    labelerModel: readOptionalNullableString(obj, 'labelerModel'),
    labelerPromptVersion: readOptionalString(obj, 'labelerPromptVersion'),
    reviewedBy: readOptionalNullableString(obj, 'reviewedBy'),
    reviewStatus: readOptionalString(obj, 'reviewStatus'),
    sourceSession: readOptionalString(obj, 'sourceSession'),
    sourceTurnId: readOptionalString(obj, 'sourceTurnId'),
  };
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9\u4e00-\u9fff-]+/g, ''))
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

  let truePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  let falsePositive = 0;
  let wrongSkill = 0;

  for (const fixture of fixtures) {
    const predicted = resolve(fixture.intent, catalog);

    let passed = false;
    if (fixture.shouldTrigger) {
      if (predicted === fixture.expectedSkill) {
        truePositive += 1;
        passed = true;
      } else if (predicted === null) {
        falseNegative += 1;
      } else {
        wrongSkill += 1;
      }
    } else if (predicted === null) {
      trueNegative += 1;
      passed = true;
    } else {
      falsePositive += 1;
    }

    results.push({
      id: fixture.id,
      intent: fixture.intent,
      expectedSkill: fixture.expectedSkill,
      expectedShouldTrigger: fixture.shouldTrigger,
      predictedSkill: predicted,
      passed,
    });
  }

  const passed = truePositive + trueNegative;
  const total = fixtures.length;

  return {
    total,
    passed,
    failed: total - passed,
    timestamp: new Date().toISOString(),
    results,
    confusionMatrix: {
      truePositive,
      trueNegative,
      falseNegative,
      falsePositive,
      wrongSkill,
      routingPassRate: total === 0 ? 0 : passed / total,
    },
  };
}

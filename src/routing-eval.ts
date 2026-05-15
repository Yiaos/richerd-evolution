export interface RoutingFixture {
  id: string;
  intent: string;
  expectedSkill: string | null;
  shouldTrigger: boolean;
  rationale?: string;
  labelSource?: "llm" | "human";
  labelerModel?: string | null;
  labelerPromptVersion?: string | null;
  reviewedBy?: string | null;
  reviewStatus?: "pending" | "approved" | "rejected";
  sourceSession?: string;
  sourceTurnId?: string;
}

export interface CatalogResolver {
  (intent: string, catalog: readonly { name: string }[]): string | null;
}

export interface RoutingCaseResult {
  id: string;
  intent: string;
  expectedSkill: string | null;
  expectedShouldTrigger: boolean;
  predictedSkill: string | null;
  passed: boolean;
}

export interface ConfusionMatrix {
  truePositive: number;
  trueNegative: number;
  falseNegative: number;
  falsePositive: number;
  wrongSkill: number;
  routingPassRate: number;
}

export interface RoutingEvalResult {
  total: number;
  passed: number;
  failed: number;
  timestamp: string;
  confusionMatrix: ConfusionMatrix;
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
  const shouldTrigger = obj.shouldTrigger;

  let expectedSkill: string | null = null;
  if (!("expectedSkill" in obj)) {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }

  if (obj.expectedSkill === null) {
    expectedSkill = null;
  } else if (typeof obj.expectedSkill === "string") {
    const normalized = obj.expectedSkill.trim();
    expectedSkill = normalized.length > 0 ? normalized : null;
  } else {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }

  const isLabelSourceValid =
    obj.labelSource === undefined || obj.labelSource === "llm" || obj.labelSource === "human";
  const isReviewStatusValid =
    obj.reviewStatus === undefined ||
    obj.reviewStatus === "pending" ||
    obj.reviewStatus === "approved" ||
    obj.reviewStatus === "rejected";

  const hasRequiredBaseFields =
    id.length > 0 && intent.length > 0 && typeof shouldTrigger === "boolean" && expectedSkill !== undefined;

  if (!hasRequiredBaseFields || !isLabelSourceValid || !isReviewStatusValid) {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }

  if (shouldTrigger && expectedSkill === null) {
    throw new Error(`Invalid routing fixture: ${raw}`);
  }

  return {
    id,
    intent,
    expectedSkill,
    shouldTrigger,
    rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
    labelSource: obj.labelSource,
    labelerModel: obj.labelerModel === undefined || obj.labelerModel === null ? obj.labelerModel ?? null : String(obj.labelerModel),
    labelerPromptVersion:
      obj.labelerPromptVersion === undefined || obj.labelerPromptVersion === null
        ? obj.labelerPromptVersion ?? null
        : String(obj.labelerPromptVersion),
    reviewedBy: obj.reviewedBy === undefined || obj.reviewedBy === null ? obj.reviewedBy ?? null : String(obj.reviewedBy),
    reviewStatus: obj.reviewStatus,
    sourceSession: obj.sourceSession === undefined ? undefined : String(obj.sourceSession),
    sourceTurnId: obj.sourceTurnId === undefined ? undefined : String(obj.sourceTurnId),
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

  const confusionMatrix: ConfusionMatrix = {
    truePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
    falsePositive: 0,
    wrongSkill: 0,
    routingPassRate: 0,
  };

  for (const fixture of fixtures) {
    const predicted = resolve(fixture.intent, catalog);

    let casePassed = false;
    if (fixture.shouldTrigger) {
      if (predicted === fixture.expectedSkill) {
        confusionMatrix.truePositive += 1;
        casePassed = true;
      } else if (predicted === null) {
        confusionMatrix.falseNegative += 1;
      } else {
        confusionMatrix.wrongSkill += 1;
      }
    } else if (predicted === null) {
      confusionMatrix.trueNegative += 1;
      casePassed = true;
    } else {
      confusionMatrix.falsePositive += 1;
    }

    if (casePassed) {
      passed += 1;
    }

    results.push({
      id: fixture.id,
      intent: fixture.intent,
      expectedSkill: fixture.expectedSkill,
      expectedShouldTrigger: fixture.shouldTrigger,
      predictedSkill: predicted,
      passed: casePassed,
    });
  }

  confusionMatrix.routingPassRate = fixtures.length === 0
    ? 0
    : (confusionMatrix.truePositive + confusionMatrix.trueNegative) / fixtures.length;

  return {
    total: fixtures.length,
    passed,
    failed: fixtures.length - passed,
    timestamp: new Date().toISOString(),
    confusionMatrix,
    results,
  };
}

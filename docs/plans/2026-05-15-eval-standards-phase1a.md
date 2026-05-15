# Evaluation Standards Phase 1A Implementation Plan

**Goal:** Implement deterministic routing fixture pipeline with corrected schema, confusion matrix counters, and catalog roots fix.
**Scope:** Phase 1A only — fixture schema (null + metadata), report counters, catalog roots, and deterministic fixture extraction pipeline with human-reviewed labels. No LM-as-judge, no online metrics.
**Feature Name:** eval-standards-phase1a
**Spec:** ~/Documents/notes/2-Project/richerd-evolution/specs/2026-05-15-evaluation-standards.md
**Spec Status:** approved
**Spec Precedence:** approved spec wins over implementation convenience
**Tech:** TypeScript, Node.js test runner, existing routing-eval framework
**Stage:** pr
**Execution:** subagent (s2a-gpt/gpt-5.3-codex)
**Next:** merge-or-cleanup
**Status:** PR ready
**Created:** 2026-05-15
**Updated:** 2026-05-15
**PR:** https://github.com/Yiaos/richerd-evolution/pull/4
**Branch:** feat/eval-standards-phase1a

---

## File Map

**Modify**
- `src/routing-eval.ts` — RoutingFixture type: expectedSkill → string | null; add metadata fields; add ConfusionMatrix interface; update runRoutingEval to return confusion matrix
- `src/skill-catalog.ts` — add missing DEFAULT_SKILL_ROOTS entries
- `scripts/run-routing-eval.ts` — output confusion matrix counters in report
- `tests/skill-routing.test.ts` — add tests for null expectedSkill, metadata fields, confusion matrix output
- `tests/skill-catalog.test.ts` — add test verifying expanded default roots list
- `fixtures/skill-routing.jsonl` — add null-skill fixture example with metadata fields

**Create**
- `scripts/extract-turns.ts` — deterministic session transcript turn extractor
- `scripts/label-fixtures.ts` — human-review-label based fixture writer
- `tests/fixture-pipeline.test.ts` — extraction + label pipeline tests
- `baselines/.gitkeep` — directory for future baseline storage

**Reference (read-only)**
- `~/Documents/notes/2-Project/richerd-evolution/specs/2026-05-15-evaluation-standards.md` — approved spec

---

## Tasks

### Task 1: Fix skill-catalog.ts default roots [VERIFY]

**Files:** modify `src/skill-catalog.ts`, modify `tests/skill-catalog.test.ts`
**Depends on:** none
**Accept:** DEFAULT_SKILL_ROOTS includes richerd-skills roots plus ~/.openclaw/workspace/skills, ~/.agents/skills, ~/.openclaw/npm/node_modules/openclaw/skills/, and ~/.openclaw/plugin-skills/
**Verify:** `node --import tsx --test ./tests/skill-catalog.test.ts` → passes
**Evidence:** `node --import tsx --test ./tests/skill-catalog.test.ts` → pass 3, fail 0
**Status:** ✅ Done

- [x] Step 1: Add `~/.agents/skills`, `~/.openclaw/npm/node_modules/openclaw/skills/`, and `~/.openclaw/plugin-skills/` to DEFAULT_SKILL_ROOTS array in skill-catalog.ts
- [x] Step 2: Add test case in skill-catalog.test.ts that verifies the default roots list contains all expected entries (import and check the constant or test via loadSkillCatalog behavior)
- [x] Step 3: Run `node --import tsx --test ./tests/skill-catalog.test.ts` and confirm pass

### Task 2: Fix RoutingFixture schema — null support + metadata [TDD]

**Files:** modify `src/routing-eval.ts`, modify `tests/skill-routing.test.ts`
**Depends on:** none
**Accept:** RoutingFixture.expectedSkill is `string | null`; parseFixtureLine accepts null expectedSkill when shouldTrigger=false; metadata fields (labelSource, labelerModel, labelerPromptVersion, reviewedBy, reviewStatus, sourceSession, sourceTurnId) are optional on the type
**Verify:** `node --import tsx --test ./tests/skill-routing.test.ts` → passes
**Evidence:** First run failed as expected on new tests (null expectedSkill + metadata). After implementation and review fix, `node --import tsx --test ./tests/skill-routing.test.ts` → pass 8, fail 0
**Status:** ✅ Done

- [x] Step 1: Write failing test — parseFixtureLine with `expectedSkill: null, shouldTrigger: false` should succeed
- [x] Step 2: Write failing test — parseFixtureLine with `expectedSkill: null, shouldTrigger: true` should throw (invalid: can't expect a specific skill trigger with null)
- [x] Step 3: Write failing test — parseFixtureLine with metadata fields should preserve them on the returned object
- [x] Step 4: Update RoutingFixture interface: `expectedSkill: string | null`, add optional metadata fields
- [x] Step 5: Update parseFixtureLine: allow null expectedSkill when shouldTrigger=false; validate that shouldTrigger=true requires non-null expectedSkill
- [x] Step 6: Run tests and confirm all pass

### Task 3: Add confusion matrix to routing eval [TDD]

**Files:** modify `src/routing-eval.ts`, modify `tests/skill-routing.test.ts`
**Depends on:** Task 2
**Accept:** runRoutingEval returns RoutingEvalResult with confusion matrix counters: truePositive, trueNegative, falseNegative, falsePositive, wrongSkill, routingPassRate
**Verify:** `node --import tsx --test ./tests/skill-routing.test.ts` → passes
**Evidence:** Added failing confusion-matrix test first (missing `confusionMatrix`), then implemented and reran `node --import tsx --test ./tests/skill-routing.test.ts` → pass 8, fail 0
**Status:** ✅ Done

- [x] Step 1: Write failing test — runRoutingEval with known fixtures returns correct confusion matrix counts (TP for correct trigger, TN for correct no-trigger, FN for missed trigger, FP for unwanted trigger, wrongSkill for wrong skill match)
- [x] Step 2: Define ConfusionMatrix interface with: truePositive, trueNegative, falseNegative, falsePositive, wrongSkill, routingPassRate
- [x] Step 3: Add confusionMatrix field to RoutingEvalResult interface
- [x] Step 4: Update runRoutingEval logic: classify each result into TP/TN/FN/FP/wrongSkill based on spec semantics:
  - TP: shouldTrigger=true AND predicted === expectedSkill
  - TN: shouldTrigger=false AND predicted === null
  - FN: shouldTrigger=true AND predicted === null
  - FP: shouldTrigger=false AND predicted !== null
  - wrongSkill: shouldTrigger=true AND predicted !== null AND predicted !== expectedSkill
  - routingPassRate: (TP + TN) / total
- [x] Step 5: Update the `passed` field logic for each case to match spec semantics:
  - shouldTrigger=true → passed only if predicted === expectedSkill
  - shouldTrigger=false → passed only if predicted === null
- [x] Step 6: Run tests and confirm all pass

### Task 4: Update run-routing-eval.ts report output [VERIFY]

**Files:** modify `scripts/run-routing-eval.ts`
**Depends on:** Task 3
**Accept:** Report JSON includes confusionMatrix object; console summary prints confusion matrix counters
**Verify:** `node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` → outputs confusion matrix in report
**Evidence:** `node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` → `Routing eval: 4/4 passed (0 failed)` and `TP=2 TN=2 FN=0 FP=0 wrongSkill=0 passRate=100.0%`; `reports/routing-eval-latest.json` contains `confusionMatrix`
**Status:** ✅ Done

- [x] Step 1: Update report object to include `result.confusionMatrix`
- [x] Step 2: Update console summary to print confusion matrix: `TP=N TN=N FN=N FP=N wrongSkill=N passRate=X%`
- [x] Step 3: Run the eval script and confirm report includes confusion matrix

### Task 5: Update fixtures with null case + metadata [VERIFY]

**Files:** modify `fixtures/skill-routing.jsonl`, create `baselines/.gitkeep`
**Depends on:** Task 2
**Accept:** fixtures/skill-routing.jsonl has at least one null-expectedSkill fixture with metadata fields; baselines/ directory exists
**Verify:** `node --import tsx --test ./tests/*.test.ts` → all pass; fixture file is valid JSONL
**Evidence:** Added `routing-004` null fixture and metadata to all fixture lines; created `baselines/.gitkeep`; `node --import tsx --test ./tests/*.test.ts` → pass 12, fail 0
**Status:** ✅ Done

- [x] Step 1: Add a null-skill fixture to skill-routing.jsonl: `{"id":"routing-004","intent":"今天天气怎么样","expectedSkill":null,"shouldTrigger":false,"rationale":"闲聊不应触发任何skill","labelSource":"human","labelerModel":null,"labelerPromptVersion":null,"reviewedBy":"richer","reviewStatus":"approved","sourceSession":"manual","sourceTurnId":"manual-004"}`
- [x] Step 2: Update existing fixtures to include metadata fields (labelSource: "human", reviewStatus: "approved", etc.)
- [x] Step 3: Create `baselines/.gitkeep`
- [x] Step 4: Run full test suite to confirm nothing breaks

### Task 6: Add deterministic fixture extraction pipeline [TEST]

**Files:** create `scripts/extract-turns.ts`, create `scripts/label-fixtures.ts`, create `tests/fixture-pipeline.test.ts`
**Depends on:** Task 2
**Accept:** `extract-turns.ts` reads session JSONL and emits extracted user turns with skillUsed/context/source metadata; `label-fixtures.ts` requires human review labels and emits valid RoutingFixture JSONL with metadata; missing review labels fail clearly
**Verify:** `node --import tsx --test ./tests/fixture-pipeline.test.ts` → passes
**Evidence:** `node --import tsx --test ./tests/fixture-pipeline.test.ts` → pass 1, fail 0; CLI smoke for both scripts passes
**Status:** ✅ Done

- [x] Step 1: Create `scripts/extract-turns.ts` with `--input`, `--output`, and optional `--context-chars` args
- [x] Step 2: Support common OpenClaw transcript shapes and conservative text extraction
- [x] Step 3: Detect nearby `.../<skill>/SKILL.md` markers and emit `skillUsed`
- [x] Step 4: Create `scripts/label-fixtures.ts` requiring `--review` labels and refusing unreviewed auto-labeling
- [x] Step 5: Validate generated fixtures with `parseFixtureLine` before writing
- [x] Step 6: Add fixture pipeline test covering extraction, human label merge, metadata, and null expectedSkill

### Task 7: Full verification [VERIFY]

**Files:** none (verification only)
**Depends on:** Task 1-6
**Accept:** All tests pass; typecheck passes; eval script and fixture pipeline smoke tests run successfully
**Verify:** `npm run typecheck && npm test && node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl`
**Evidence:** `npm run typecheck && npm test && node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` completed successfully; test summary pass 12 fail 0; eval summary `4/4 passed` with confusion counters; `reports/routing-eval-latest.json` verified
**Status:** ✅ Done

- [x] Step 1: Run `npm run typecheck` → exit 0
- [x] Step 2: Run `npm test` → all tests pass
- [x] Step 3: Run eval script → outputs valid report with confusion matrix
- [x] Step 4: Verify report JSON contains confusionMatrix field with correct counters

---

## Verification
- [x] All task-level verification passes
- [x] Integration check passes (typecheck + test + eval run)
- [x] Regression check passes (existing fixtures still evaluate correctly)

## Implementation Notes
- Decision: Implement Phase 1A extraction pipeline as deterministic tooling with mandatory human-reviewed labels instead of direct LLM auto-labeling.
- Decision: Include `~/.openclaw/plugin-skills/` in DEFAULT_SKILL_ROOTS to match approved spec roots.
- Reason: Phase 1 must produce auditable fixtures without relying on unresolved LM provider contracts.
- Impact: CLI supports extraction + manual review merge now; automatic LLM labeling remains a later enhancement behind the same review boundary.
- Approved by: self-approved within approved spec scope

## Implementation Summary

Write this section in Chinese by default.

**Changed:** 完成 Phase 1A 全部范围：
- `src/skill-catalog.ts`：新增多根目录加载逻辑，导出 `DEFAULT_SKILL_ROOTS`，补充 `~/.agents/skills`、`~/.openclaw/npm/node_modules/openclaw/skills/` 与 `~/.openclaw/plugin-skills/`（并保留现有 roots）；默认加载支持多目录去重。
- `src/routing-eval.ts`：`RoutingFixture.expectedSkill` 改为 `string | null`，新增标注元数据字段；`parseFixtureLine` 支持 no-trigger 场景的 null skill，并校验 trigger 场景必须为非空 skill；新增 `ConfusionMatrix`，`runRoutingEval` 返回 confusionMatrix 并按规范修正 `passed` 判定。
- Review fix：`parseFixtureLine` 现在拒绝缺失或非 `string | null` 的 `expectedSkill`，避免脏 fixture 在 no-trigger case 被静默降级成 null。
- `scripts/run-routing-eval.ts`：报告输出包含 confusionMatrix，终端摘要打印 TP/TN/FN/FP/wrongSkill/passRate；默认 catalog-root 为空时走 `loadSkillCatalog()` 的多默认根。
- `tests/skill-routing.test.ts`：新增 null expectedSkill 解析、非法 trigger-null、元数据保留、confusion matrix 与严格 pass 语义测试。
- `tests/skill-catalog.test.ts`：新增 default roots 覆盖测试。
- `fixtures/skill-routing.jsonl`：补充 metadata 字段并新增 `routing-004` null no-trigger 样例。
- 新建 `scripts/extract-turns.ts`：从 session JSONL 提取 user turn、context、source metadata，并确定性识别邻近 `SKILL.md` 读取。
- 新建 `scripts/label-fixtures.ts`：要求 human review labels，生成带 metadata 的 RoutingFixture JSONL，并用 `parseFixtureLine` 校验。
- 新建 `tests/fixture-pipeline.test.ts`：覆盖 extraction + human label merge + null expectedSkill。
- 新建 `baselines/.gitkeep`。

**Verification:**
- `node --import tsx --test ./tests/skill-catalog.test.ts` ✅（pass 3 / fail 0）
- `node --import tsx --test ./tests/skill-routing.test.ts` ✅（pass 8 / fail 0）
- `node --import tsx --test ./tests/*.test.ts` ✅（pass 12 / fail 0）
- `npm run typecheck && npm test && node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` ✅
- `reports/routing-eval-latest.json` 已确认包含 `confusionMatrix`

**Risks:**
- 计划文档中的 spec 路径 `~/Documents/notes/...` 在当前运行环境不可访问（ENOENT）；本次按实现计划与仓库内行为完成，若后续 spec 正文有新增约束需再对齐。
- 为兼容现有 fixture 中 `code-review` / `collect-article`，默认 roots 额外包含了 `~/worksp/richerd-skills/skills/universal`（不影响 approved roots，属于兼容当前技能仓库组织方式的补充）。

**Follow-ups:**
- 下一阶段可在 `label-fixtures.ts` 后接 LLM labeler，但仍应保留 human review gate。

# Evaluation Standards Phase 1A Implementation Plan

**Goal:** Implement deterministic routing fixture pipeline with corrected schema, confusion matrix counters, expanded catalog roots, and fixture extraction pipeline.
**Scope:** Phase 1A — fixture schema (null + metadata), report counters, catalog roots, deterministic fixture extraction pipeline with human-reviewed labels. No LM-as-judge, no online metrics.
**Feature Name:** eval-standards-phase1a
**Spec:** ~/Documents/notes/2-Project/richerd-evolution/specs/2026-05-15-evaluation-standards.md
**Spec Status:** approved
**Spec Precedence:** approved spec wins over implementation convenience
**Tech:** TypeScript, Node.js test runner, existing routing-eval framework
**Stage:** review
**Execution:** subagent + coordinator fixes
**Next:** pr-closeout
**Status:** ✅ Done
**Created:** 2026-05-15
**Updated:** 2026-05-15

---

## File Map

**Modify**
- `src/routing-eval.ts` — RoutingFixture type: expectedSkill → string | null; add metadata fields; add ConfusionMatrix interface; update runRoutingEval to return confusion matrix; strict pass semantics
- `src/skill-catalog.ts` — multi-root support with DEFAULT_SKILL_ROOTS array; ENOENT-tolerant; dedup by name
- `scripts/run-routing-eval.ts` — output confusion matrix counters in report; use multi-root catalog by default
- `tests/skill-routing.test.ts` — tests for null expectedSkill, metadata fields, confusion matrix, strict pass semantics, type rejection
- `tests/skill-catalog.test.ts` — test verifying expanded default roots list
- `fixtures/skill-routing.jsonl` — add null-skill fixture + metadata fields to all entries

**Create**
- `.gitignore` — exclude node_modules/, dist/, timestamped reports
- `scripts/extract-turns.ts` — deterministic session transcript turn extractor
- `scripts/label-fixtures.ts` — human-review-label based fixture writer (refuses unreviewed auto-labeling)
- `tests/fixture-pipeline.test.ts` — extraction + label pipeline tests
- `baselines/.gitkeep` — directory for future baseline storage

**Reference (read-only)**
- `~/Documents/notes/2-Project/richerd-evolution/specs/2026-05-15-evaluation-standards.md` — approved spec

---

## Tasks

### Task 1: Fix skill-catalog.ts — multi-root support [TDD]

**Files:** modify `src/skill-catalog.ts`, modify `tests/skill-catalog.test.ts`
**Depends on:** none
**Accept:** DEFAULT_SKILL_ROOTS exported array includes: ~/worksp/richerd-skills/skills/richerd, ~/worksp/richerd-skills/skills/third-party, ~/worksp/richerd-skills/skills/universal, ~/.openclaw/workspace/skills, ~/.agents/skills, ~/.openclaw/npm/node_modules/openclaw/skills/, ~/.openclaw/plugin-skills/. loadSkillCatalog scans all roots, skips ENOENT, deduplicates by skill name (first-seen wins).
**Verify:** `node --import tsx --test ./tests/skill-catalog.test.ts` → passes
**Evidence:** `node --import tsx --test ./tests/skill-catalog.test.ts` → 4 passed, 0 failed
**Status:** ✅ Completed

- [x] Step 1: Write failing test — DEFAULT_SKILL_ROOTS contains all required paths
- [x] Step 2: Write failing test — loadSkillCatalog with multiple roots deduplicates by name
- [x] Step 3: Implement multi-root: export DEFAULT_SKILL_ROOTS, normalizeRoots(), ENOENT-tolerant iteration, Map-based dedup
- [x] Step 4: Run tests and confirm pass

### Task 2: Fix RoutingFixture schema — null + metadata + strict validation [TDD]

**Files:** modify `src/routing-eval.ts`, modify `tests/skill-routing.test.ts`
**Depends on:** none
**Accept:** RoutingFixture.expectedSkill is `string | null`; parseFixtureLine: accepts null when shouldTrigger=false, rejects null when shouldTrigger=true, rejects missing expectedSkill field, rejects non-string/non-null types (number/object/boolean); metadata fields (labelSource, labelerModel, labelerPromptVersion, reviewedBy, reviewStatus, sourceSession, sourceTurnId) are optional on the type and preserved through parsing
**Verify:** `node --import tsx --test ./tests/skill-routing.test.ts` → passes
**Evidence:** `node --import tsx --test ./tests/skill-routing.test.ts` → 8 passed, 0 failed（含 parseFixtureLine null/类型/缺字段/metadata 测试）
**Status:** ✅ Completed

- [x] Step 1: Write failing test — parseFixtureLine with expectedSkill:null, shouldTrigger:false succeeds
- [x] Step 2: Write failing test — parseFixtureLine with expectedSkill:null, shouldTrigger:true throws
- [x] Step 3: Write failing test — parseFixtureLine with expectedSkill:123 throws (type rejection)
- [x] Step 4: Write failing test — parseFixtureLine with missing expectedSkill field throws
- [x] Step 5: Write failing test — parseFixtureLine preserves metadata fields
- [x] Step 6: Update RoutingFixture interface and parseFixtureLine implementation
- [x] Step 7: Run tests and confirm pass

### Task 3: Add confusion matrix + strict pass semantics [TDD]

**Files:** modify `src/routing-eval.ts`, modify `tests/skill-routing.test.ts`
**Depends on:** Task 2
**Accept:** runRoutingEval returns ConfusionMatrix with truePositive, trueNegative, falseNegative, falsePositive, wrongSkill, routingPassRate. Pass semantics: shouldTrigger=true → passed only if predicted === expectedSkill; shouldTrigger=false → passed only if predicted === null
**Verify:** `node --import tsx --test ./tests/skill-routing.test.ts` → passes
**Evidence:** `node --import tsx --test ./tests/skill-routing.test.ts` → 8 passed, 0 failed（含 confusion matrix 与 strict pass 语义测试）
**Status:** ✅ Completed

- [x] Step 1: Write failing test — runRoutingEval with known fixtures returns correct confusion matrix (TP/TN/FN/FP/wrongSkill)
- [x] Step 2: Define ConfusionMatrix interface, add to RoutingEvalResult
- [x] Step 3: Implement classification logic per spec semantics
- [x] Step 4: Fix passed field to use strict semantics (not the old loose check)
- [x] Step 5: Run tests and confirm pass

### Task 4: Update run-routing-eval.ts report output [VERIFY]

**Files:** modify `scripts/run-routing-eval.ts`
**Depends on:** Task 1, Task 3
**Accept:** Report JSON includes confusionMatrix; console prints TP/TN/FN/FP/wrongSkill/passRate; default catalog uses loadSkillCatalog() multi-root when no --catalog-root given; missing skill check only applies to shouldTrigger=true fixtures with non-null expectedSkill
**Verify:** `node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` → outputs confusion matrix
**Evidence:** `node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` ✅ — 4/4 passed, TP=2 TN=2 FN=0 FP=0 wrongSkill=0 passRate=100.00%; `reports/routing-eval-latest.json` contains `confusionMatrix`
**Status:** ✅ Completed

- [x] Step 1: Update default catalog loading to use loadSkillCatalog() without args when --catalog-root is empty
- [x] Step 2: Add confusionMatrix to report JSON output
- [x] Step 3: Print confusion matrix summary to console
- [x] Step 4: Fix missing skill check to skip null expectedSkill entries
- [x] Step 5: Run eval script and confirm output

### Task 5: Update fixtures + add .gitignore + baselines [VERIFY]

**Files:** modify `fixtures/skill-routing.jsonl`, create `.gitignore`, create `baselines/.gitkeep`
**Depends on:** Task 2
**Accept:** fixtures have metadata fields; at least one null-expectedSkill fixture; .gitignore excludes node_modules/, dist/, reports/routing-eval-[0-9]*.json; baselines/ exists
**Verify:** `node --import tsx --test ./tests/*.test.ts` → all pass
**Evidence:** `.gitignore` created; `baselines/.gitkeep` created; `fixtures/skill-routing.jsonl` contains metadata and routing-004 null fixture; `npm test` ✅ — 16 pass / 0 fail
**Status:** ✅ Completed

- [x] Step 1: Add metadata fields to existing fixtures
- [x] Step 2: Add routing-004 null no-trigger fixture
- [x] Step 3: Create .gitignore
- [x] Step 4: Create baselines/.gitkeep
- [x] Step 5: Run full test suite

### Task 6: Fixture extraction pipeline [TDD]

**Files:** create `scripts/extract-turns.ts`, create `scripts/label-fixtures.ts`, create `tests/fixture-pipeline.test.ts`
**Depends on:** Task 2
**Accept:** extract-turns.ts reads session JSONL, emits extracted user turns with id/intent/skillUsed/context/sourceSession/sourceTurnId; label-fixtures.ts requires --review labels, emits valid RoutingFixture JSONL with metadata, validates with parseFixtureLine; missing --review exits nonzero with clear error
**Verify:** `node --import tsx --test ./tests/fixture-pipeline.test.ts` → passes; CLI smoke test passes
**Evidence:** `node --import tsx --test ./tests/fixture-pipeline.test.ts` ✅ — 4 pass / 0 fail; includes extractor, human-review label merge, null expectedSkill fixture, no-`--review` refusal, and unapproved label rejection
**Status:** ✅ Completed

- [x] Step 1: Write test — extraction from session JSONL produces correct turn fields including skillUsed detection
- [x] Step 2: Write test — label-fixtures merges human review labels into valid fixtures with metadata
- [x] Step 3: Write test — null expectedSkill for no-trigger labels works
- [x] Step 4: Implement extract-turns.ts (--input, --output, --context-chars; tolerant of common JSONL shapes; deterministic SKILL.md detection)
- [x] Step 5: Implement label-fixtures.ts (--input, --review, --output; validates with parseFixtureLine; refuses without --review)
- [x] Step 6: Run tests and CLI smoke

### Task 7: Full verification [VERIFY]

**Files:** none (verification only)
**Depends on:** Task 1-6
**Accept:** All tests pass; typecheck passes; eval script runs successfully with confusion matrix output
**Verify:** `npm run typecheck && npm test && node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl`
**Evidence:** `npm run typecheck` ✅; `npm test` ✅ — 16 pass / 0 fail; `node --import tsx scripts/run-routing-eval.ts --fixture=fixtures/skill-routing.jsonl` ✅ — 4/4 passed; `node -e "const r=require('./reports/routing-eval-latest.json'); console.log(JSON.stringify(r.confusionMatrix));"` ✅ — `{"truePositive":2,"trueNegative":2,"falseNegative":0,"falsePositive":0,"wrongSkill":0,"routingPassRate":1}`
**Status:** ✅ Completed

- [x] Step 1: Run `npm run typecheck` → exit 0
- [x] Step 2: Run `npm test` → all tests pass
- [x] Step 3: Run eval script → outputs valid report with confusion matrix
- [x] Step 4: Verify report JSON contains confusionMatrix field

---

## Verification
- [x] All task-level verification passes
- [x] Integration check passes (typecheck + test + eval run)
- [x] Regression check passes (existing fixtures still evaluate correctly)

## Implementation Notes

Coordinator review fixes:
- 子 agent completion report 声称 `.gitignore`、`baselines/.gitkeep`、`scripts/extract-turns.ts`、`scripts/label-fixtures.ts`、`tests/fixture-pipeline.test.ts` 已创建，但磁盘检查发现缺失；coordinator 已直接补齐。
- 恢复了误删的 tracked timestamp reports；本次仅通过 `.gitignore` 防止未来 timestamp reports 噪音。
- `npm run typecheck` 首次抓到 `fs.readdir` Dirent overload 类型问题；已改为显式 `Dirent[]`。
- `fixture-pipeline.test.ts` 首次抓到 `extract-turns.ts` 会把上一轮 SKILL.md 误归因给下一轮 user turn；已改为只扫描当前 user turn 到下一个 user turn 之前的记录。

## Implementation Summary

Write this section in Chinese by default.

**Changed:** Phase 1A 已实现：multi-root skill catalog、`expectedSkill: string | null` 严格 schema、routing confusion matrix、fixture extraction/label pipeline、metadata fixtures、`.gitignore` 与 `baselines/.gitkeep`。
**Verification:** `npm run typecheck` 通过；`npm test` 16 pass / 0 fail；routing eval 4/4 passed，`TP=2 TN=2 FN=0 FP=0 wrongSkill=0 passRate=100.00%`。
**Risks:** 第一版 `extract-turns.ts` 只做确定性 SKILL.md 路径检测，不做 LM labeler；这是 Phase 1A 的刻意约束。
**Follow-ups:** 后续如接 LLM labeler，必须保留 human review gate；Phase 1B memory gate 另行实现。

# richerd-evolution

> Eval/evolution harness for Richerd skill routing and memory reliability.

This repo is deliberately **not** production plugin code. It exists to make behavior changes measurable before those changes get baked into Richerd's operating system.

## What this project is

`richerd-evolution` is the evaluation layer between three moving parts:

- **OpenClaw runtime** decides which context, hooks, and skills are available during a turn.
- **richerd-skills** stores reusable behavior definitions (`SKILL.md` files) that the assistant may load when a task matches.
- **richerd-memory** stores and retrieves durable memory through hooks, observer jobs, pending review, and entity files.

This repo does not replace any of them. It asks: **when we change skills or memory behavior, can we prove the behavior changed in the direction we wanted?**

The first MVP focuses on skill routing because it is the easiest boundary to measure locally:

```text
richerd-skills/SKILL.md files
        ↓ loadSkillCatalog()
fixtures/*.jsonl expected behavior
        ↓ runRoutingEval()
reports/*.json result artifacts
```

Future memory evals should follow the same shape:

```text
richerd-memory logs / fixtures / observer cases
        ↓ evaluator
expected durable-memory behavior
        ↓ report
regression signal before changing runtime config or plugin code
```

## What this project is not

- Not an OpenClaw plugin.
- Not a replacement for `richerd-memory`.
- Not a replacement for `richerd-skills`.
- Not the actual production skill router.
- Not currently model-backed; the routing resolver is a deterministic lexical baseline.

That last point is intentional. The MVP baseline is dumb but stable, which makes regressions visible without provider variance.

## Current capabilities

- Load skill metadata from `SKILL.md` frontmatter or fallback heading text.
- Read multiple skill roots, dedupe same-name skills by first root, and skip missing legacy roots.
- Evaluate routing fixtures from JSONL.
- Produce timestamped and latest JSON reports under `reports/`.
- Keep generated reports out of git while preserving `reports/.gitkeep`.

## Code structure

```text
.
├── README.md
├── package.json
├── package-lock.json
├── fixtures/
│   ├── skill-routing.jsonl        # routing regression cases
│   └── memory-observer.jsonl      # placeholder for future memory/observer cases
├── reports/
│   └── .gitkeep                   # generated *.json reports are ignored
├── scripts/
│   └── run-routing-eval.ts        # CLI entrypoint for npm run eval:routing
├── src/
│   ├── skill-catalog.ts           # reads SKILL.md files into SkillInfo[]
│   └── routing-eval.ts            # fixture parser, lexical resolver, eval runner
└── tests/
    ├── skill-catalog.test.ts
    └── skill-routing.test.ts
```

### `src/skill-catalog.ts`

Reads skill directories and returns:

```ts
interface SkillInfo {
  name: string;
  description: string;
  path: string;
}
```

Default roots, in priority order:

1. `~/worksp/richerd-skills/skills/richerd`
2. `~/worksp/richerd-skills/skills/third-party`
3. `~/.openclaw/workspace/skills` legacy fallback

If the same skill name appears in multiple roots, the first root wins. This mirrors the current source-of-truth direction: Richerd-maintained skills live in `~/worksp/richerd-skills`, while the old workspace skills directory is only compatibility fallback.

You can override roots with either:

```bash
SKILL_ROOT="/path/a:/path/b" npm run eval:routing
```

or:

```bash
npm run eval:routing -- --catalog-root=/path/a:/path/b
```

On macOS/Linux, roots are separated by `:` because this uses Node's `path.delimiter`.

### `src/routing-eval.ts`

Defines the fixture format, deterministic resolver, and result shape.

A routing fixture is one JSON object per line:

```json
{"id":"routing-003","intent":"请使用 code review 检查这次实现，有错误要修掉","expectedSkill":"code-review","shouldTrigger":true,"rationale":"Explicit ask for code review should trigger installed skill when present."}
```

Fields:

- `id`: stable case id
- `intent`: simulated user/task text
- `expectedSkill`: skill expected to match or be avoided
- `shouldTrigger`: whether that skill should trigger
- `rationale`: optional explanation

The current `lexicalResolve()` baseline only tokenizes the intent and checks whether tokens appear in skill names. It is not semantically smart. Its job is to provide a stable smoke baseline and fixture/report format.

### `scripts/run-routing-eval.ts`

CLI flow:

1. parse `--fixture`, `--catalog-root`, and `--report-dir`
2. load fixture lines
3. load the skill catalog from active roots
4. fail fast if a positive fixture expects a missing skill
5. run the routing eval
6. write reports:
   - `reports/routing-eval-<timestamp>.json`
   - `reports/routing-eval-latest.json`

The report files are intentionally ignored by git.

## How it works with `richerd-skills`

`richerd-skills` is the source of skill definitions. This project reads those `SKILL.md` files, extracts `name` and `description`, and treats the resulting catalog as the available skill universe.

So when a skill is added, renamed, moved, or given better frontmatter, `richerd-evolution` can detect whether routing fixtures still behave as expected.

Example use:

1. Add or edit a skill in `~/worksp/richerd-skills/skills/richerd`.
2. Add a fixture in `fixtures/skill-routing.jsonl` for the behavior that must not regress.
3. Run `npm run eval:routing`.
4. If the report changes, decide whether the skill description or fixture expectation should change.

## How it works with `richerd-memory`

Today, the integration is mostly conceptual and fixture-level. `fixtures/memory-observer.jsonl` is a placeholder for future memory/observer regressions.

The intended direction is:

- Take real failure patterns from `richerd-memory` work, such as missed `entity_change`, noisy moment capture, or observer significance mistakes.
- Encode them as fixtures.
- Run evaluators locally before changing plugin prompts, observer policy, or memory-writing behavior.

This matters because `richerd-memory` is production runtime state. Changes there should not be judged only by “tests pass” or “the prompt sounds better”; they need behavior-level regressions that say whether Richerd actually remembers better.

Near-term memory eval candidates:

- moment vs routine engineering progress classification
- `entity_change` significance vs low-value parameter churn
- observer candidate → pending metadata shape
- feedback source handling (`user_message` vs model output)
- retrieval audit coverage and denominator sanity

## Fixtures

- `fixtures/skill-routing.jsonl`: current routing eval cases.
- `fixtures/memory-observer.jsonl`: starter placeholder for observer-oriented memory regressions.

Add fixtures when a routing/memory mistake should never silently recur.

## Eval command

```bash
npm run eval:routing
```

Expected current output:

```text
Routing eval: 3/3 passed (0 failed)
```

Generated reports go to `reports/` and are ignored by git.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run eval:routing
```

Before opening or updating a PR, all four verification commands should pass.

## Current limitations

- The routing resolver is lexical, not semantic.
- There is no model-backed eval runner yet.
- Memory observer eval is only scaffolded by fixture shape; it does not yet replay actual richerd-memory observer jobs.
- Reports are local artifacts, not CI-published artifacts.

These are acceptable for the MVP because the repo's first job is to establish the evaluation boundary and artifact hygiene.

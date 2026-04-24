# richerd-evolution

> Eval/evolution harness for Richerd skill routing and memory reliability.

This repo is deliberately **not** production plugin code. It exists to make behavior changes measurable.

## Scope

- Track and validate skill routing behavior.
- Maintain fixtures that become durable regression tests.
- Produce deterministic, low-friction evaluation reports.
- Keep a “no test, no evolution” feedback loop.

## Routing Evaluation Baseline

The first version intentionally uses a deterministic lexical baseline (not model calls).
That means it is a **mechanical baseline** for signal and regression detection,
not a replacement for model-based eval.

We keep this explicit because:

- It provides stable, local reproducible results.
- It is easy to inspect and maintain.
- It can later be swapped with model-backed resolvers without changing fixture format.

## Skill Catalog

`src/skill-catalog.ts` reads installed skill directories under
`~/.openclaw/workspace/skills` (or a configurable root) and parses:

- `name` (from SKILL.md frontmatter or heading)
- `description` (from SKILL.md frontmatter or markdown body fallback)
- `path` (directory path)

A minimal fixture is provided at `fixtures/memory-observer.jsonl` for future observer
scenarios.

## Fixtures

- `fixtures/skill-routing.jsonl` : routing intents, expected skill, and pass/fail mode.
- `fixtures/memory-observer.jsonl` : starter sample for observer-oriented regressions.

## Eval command

```bash
npm run eval:routing
```

Writes `JSON` reports to `reports/` with timestamped and latest filenames.

## Development

- `npm install`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run eval:routing`

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run eval:routing
```

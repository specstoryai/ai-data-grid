# @specstory/ai-data-grid-ai

Developer-configured AI Fill for [AI Data Grid](https://github.com/specstoryai/ai-data-grid), powered by [Jev](https://docs.typesafe.ai) (TypeSafe's Choice, Score and Noul primitives).

Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.

> **Status: in development, not published.** The package name `@specstory/ai-data-grid-ai` isn't approved for release, and nothing is on npm. The package is being built in stages. This stage is the pure TypeScript foundation: the Jev contract and answer parser, the configuration types and their validator, identity and fingerprints, and the result policy engine. It has no network code and no React components yet, so it can't fill a grid on its own. `AIFillDataEditor`, `useAIFill`, the Jev client, the server helper (`/server`) and the mock (`/testing`) come in later stages.

## What it is

AI Fill lets a developer add AI-filled columns to a grid in configuration alone. You describe, per column, a Jev question (a **Choice**, a **Score** or a **Noul**), the row state it is asked about, and how answers become cell values. The package decides, for every answer, whether it is shown, withheld, flagged for review or applied, by rules you set. It never writes a value the user didn't accept, unless you explicitly configure automatic application for a "Fill and apply" run.

Jev returns structured answers, not prose:

| Primitive | You define | Jev answers with |
|---|---|---|
| Choice | A question and a map of option ids to descriptions (2–255 options) | The selected option, the probability of every option (summing to 1), and a separate model confidence |
| Score | A question and an ordered rubric of 2–10 levels | A score in [0, levels − 1] (a probability-weighted position, not a percentage), a legend, each level's probability, and a confidence |
| Noul | A yes/no question, optionally with what true and false mean | The probability that the answer is yes, in [0, 1]. There is no confidence. A value near 0 is a strong no, not a failure. |

## Entry points

| Entry | Contents |
|---|---|
| `@specstory/ai-data-grid-ai` | Types, `validateAIFillConfig`, `parseAnswer`, `mapOutput`, `evaluatePolicy`, identity helpers and commit-guard helpers |
| `@specstory/ai-data-grid-ai/server` | Empty for now. The server helper comes in a later stage. |
| `@specstory/ai-data-grid-ai/testing` | Empty for now. The mock Jev transport comes in a later stage. |
| `@specstory/ai-data-grid-ai/index.css` | Styles. Empty for now. |

It depends on `@specstory/ai-data-grid` 7.0.0 and needs React 19 (`react` and `react-dom` `^19.0.0` as peer dependencies).

## Configuration overview

```ts
import type { AIFillConfig } from "@specstory/ai-data-grid-ai";

const aiFill: AIFillConfig = {
    connection: { mode: "endpoint", url: "/api/jev" },
    model: "jev-latest", // required, no hidden default
    rows: { getRowId: row => contacts[row].id }, // results are keyed by stable row id, never by position
    columns: {
        // keyed by GridColumn.id
        persona: {
            primitive: "choice",
            instructions: "Which buyer persona best describes this contact?",
            sources: ["company", "title"],
            options: {
                champion: { description: "Drives the purchase internally", label: "Champion" },
                economic: { description: "Controls the budget", label: "Economic buyer" },
                none: { description: "None of these fit", label: "None of the above", outcome: "none" },
            },
            policy: {
                show: { minProbability: 0.8 },
                ready: { minProbability: 0.95 },
                autoApply: { minProbability: 0.95 },
            },
        },
        seniority: {
            primitive: "score",
            instructions: "How senior is this contact?",
            sources: ["title"],
            levels: ["Individual contributor", "Manager", "Director", "Executive"],
            output: { store: "level-label" },
            policy: { show: { minConfidence: 0.7 } },
        },
        ownsBudget: {
            primitive: "noul",
            instructions: "Does this contact own a budget?",
            sources: ["title", "notes"],
            output: { store: "boolean", bands: { falseAtOrBelow: 0.2, trueAtOrAbove: 0.8, between: "review" } },
        },
    },
};
```

### Grid-level settings (`AIFillConfig`)

| Field | Meaning |
|---|---|
| `connection` | `{ mode: "endpoint", url, headers?, fetch? }` (production: the key stays on your server), `{ mode: "direct", apiKey, dangerouslyAllowBrowser?, baseURL?, fetch? }` (local and demo use; a key used in a browser is visible to that browser's user, so browsers need `dangerouslyAllowBrowser: true`), or `{ mode: "custom", send }` |
| `model` | The Jev model, for example `jev-latest`. Required. The versioned id that answered (for example `jev-1.13.0`) is kept with every answer. |
| `rows` | `getRowId(row)` (required) and optional `getRowIndex(rowId)` |
| `rowState` | The row state sent to Jev. Default: built from each column's `sources`. |
| `rowScope` | The rows a column-wide fill covers, as `{ rows: "displayed" \| rowId[], label }` |
| `columns` | AI column definitions, keyed by `GridColumn.id` |
| `execution` | Scheduler limits: `concurrency` (4), `maxRequestsPerMinute` (600), `timeoutMs` (15000), `maxRetries` (2), `backoff` (500 ms → 5 s, jitter 0.25), `maxCellsPerRun` (1000), `confirmAbove` (100), `maxQuestionsPerRequest` (16), `maxStateChars` (60000), `cacheSize` (5000) |
| `onRunStart`, `onRunProgress`, `onRunEnd`, `onResult`, `onCommit`, `onReject`, `onError` | Observers. `onResult` fires for every decided result, including withheld and review ones. |

### Column settings (all primitives)

| Field | Meaning | Default |
|---|---|---|
| `primitive` | `"choice"`, `"score"` or `"noul"` | required |
| `instructions` | The Jev question (string, object or array) | required |
| `sources` | Source column ids: they build the default state and invalidate results when edited | `[]`, and then a `state` or grid `rowState` is required |
| `state` | A per-column row state accessor | grid `rowState` |
| `context` | Extra context such as category definitions or examples, sent as `{ instructions, context }` | none |
| `applies`, `missingInput`, `isMissing` | Row applicability and what to do with missing input | every row; `"skip"`; every source empty |
| `isEmpty` | Whether a destination cell is empty. Under `defaultIsEmpty`, **`0` and `false` are values, not empty.** | `defaultIsEmpty` |
| `overwrite` | `"never"`, `"suggest"` (populated cells only in explicit selections, never auto-applied) or `"apply"` | `"never"` |
| `fillScopes` | Any of `"selection"`, `"selection-empty"`, `"column-empty"`, `"column"` | the first three |
| `policy` | Gates and `decide` (see below) | everything valid is suggested; nothing auto-applies |
| `output` | `format(value, answer)` for display text and `toCell(value, current, ctx)` for the written cell, plus primitive-specific mapping | per primitive |
| `presentation` | Display options | per primitive |
| `model` | A per-column model | grid `model` |

Primitive-specific settings:

- **Choice:** `options: { [id]: { description, label?, value?, outcome? } }`. `label` is what users see, `value` is what is stored (default `label ?? id`). `outcome: "none" | "unknown"` marks semantic outcomes such as none-of-the-above or insufficient information; they are answers, distinct from withheld, review and errors, and store nothing unless the option sets a `value`. `presentation: { showProbability?, showConfidence?, alternatives?: { count, minProbability? } }`.
- **Score:** `levels` (lowest first; a string, or `{ description, label?, value? }` where `description` is a string or an object such as `{ what, examples }`). `output.store`: `"score"` (rounded to `output.precision`, default 2), `"level"`, `"level-label"`, `"level-value"` (every level needs a `value`) or a function of the answer. `output.levelFrom`: `"nearest"` (half up, the default) or `"most-probable"` (ties to the lower level). `presentation: { showConfidence?, rubricBar? }`.
- **Noul:** `criteria?: { true?, false? }`. `output.store`: `"probability"` (the default, rounded to `precision`), `"boolean"` or `"label"`. The last two need `bands: { falseAtOrBelow, trueAtOrAbove, between: "review" | "withhold" }`; there are no default bands. `labels` default to `Yes`, `No` and `Uncertain`. `presentation: { probabilityBar? }`.

The raw answer, the display text and the committed value are always three separate things: `mapOutput` returns `answer`, `display` and `value` (with `hasValue`), plus the semantic `outcome`.

`validateAIFillConfig(config, { columns, isBrowser })` returns every problem as `{ path, message, columnId? }`. An issue with a `columnId` disables that column; one without disables AI Fill for the grid. Overlapping gates, out-of-range thresholds, unknown option or level ids, missing Noul bands, a confidence measure on a Noul and a direct-mode key in a browser without `dangerouslyAllowBrowser` are all reported.

## Result policies

A policy has up to three declarative gates and an optional callback:

- `show`: a result that fails it is **withheld**. It isn't shown and nothing is written, but the reason is kept.
- `ready`: a shown result that fails it goes to **review**. Review results are never auto-applied or included in "accept all eligible".
- `autoApply`: a ready result that passes it is an **apply candidate**, but only in a "Fill and apply" run and only when there is a value to write. Without `autoApply`, nothing is ever applied automatically.
- `decide(ctx)`: runs last, with the full answer, the cell context, the mapped candidate and the declarative decision. They are frozen copies, so it can't change the stored answer or give a result a value.

Every condition inside a gate must pass. A gate that isn't configured passes, except `autoApply`, which never passes unless configured.

| Primitive | Gate measures |
|---|---|
| Choice | `minProbability` (the selected option's probability, and nothing else), `minConfidence`, `minMargin` (top minus second probability), `options: { in?, notIn? }`, `optionProbability: { [id]: { min?, max? } }` |
| Score | `minConfidence`, `score: { min?, max? }`, `levelProbability: { [level]: { min?, max? } }` |
| Noul | `noul: { min?, max? }`. Mapped modes use `output.bands`. There is no confidence measure. |

### Precedence

For each answer, the first step that matches decides:

1. A transport or evaluation error: `error`.
2. A malformed answer (`parseAnswer` rejects it): `error: malformed`. It rejects a wrong type, a choice that isn't an option, probability keys that don't match the criteria, values that are non-finite or outside [0, 1], probabilities summing outside 1 ± 0.01, a Score outside [0, n − 1], a choice that isn't the most probable option (tolerance 1e-9), a non-object Score legend, and a response without a model.
3. Stale inputs: `stale`, never committed.
4. Mapping (`mapOutput`): a value that can't be produced or doesn't fit the destination is `error: type-mismatch`.
5. Gates: `show` fails → `withheld`; a Noul in the middle band → `review` (or `withheld`); `ready` fails → `review`; otherwise `suggested`, or `apply-candidate` when `autoApply` passes in a "Fill and apply" run.
6. `decide`: returns `withheld`, `review`, `suggested` or `apply`, or `undefined` to keep the decision. It can't create a value. `apply` counts only when the column configures `autoApply` (otherwise the result is `suggested` and a configuration error is reported). A throw is `error: policy-callback`, and nothing is written.
7. Commit guards, for every write: not already committed, the row still exists, the fingerprints match, the destination is unchanged, the cell is writable, the overwrite policy and scope allow it, and `validateCell` passes. `checkCommitGuards` runs them in that order.

`evaluatePolicy` runs steps 4–6 on a parsed answer. It makes no request, so when only the policy, `output.format`, the presentation or `decide` change, stored answers are re-decided for free.

### Exact comparisons

- A `min` passes when `value >= min`; a `max` passes when `value <= max`.
- Values are compared as the raw doubles from the response, with no epsilon and no rounding. So with `show: { minProbability: 0.8 }`, **0.79 is withheld, 0.80 is shown, and 0.7999999 is withheld.**
- Display rounding never feeds a decision. Reasons quote exact values, for example `withheld: probability 0.79 < show.minProbability 0.8`.
- A gate reads only the measure it names. **Confidence is never substituted for probability**, or the reverse: a Choice with probability 0.79 and confidence 0.95 is withheld by `minProbability: 0.8`, and one with probability 0.85 and confidence 0.30 is shown.
- Noul bands: at or below `falseAtOrBelow` is false, at or above `trueAtOrAbove` is true. With 0.2 / 0.8, 0.02 is a usable `false` (a strong no), 0.20 is false, 0.2000001 is in the middle band, 0.80 is true, and 0.5 is "Uncertain", never "No".
- Gates must be monotonic: `show.min ≤ ready.min ≤ autoApply.min` for every shared measure (the reverse for `max`). A looser later gate is reported as an overlapping-gate error.

**Thresholds are your choice, not accuracy guarantees.** Probability and confidence are what the model reports; they aren't measured correctness. Evaluate thresholds on your own data before relying on them.

## Identity and staleness

- `buildQuestion(definition)` is exactly what is sent to Jev.
- `questionFingerprint(definition)` is canonical JSON (sorted keys) of that question plus the column's `sources`. `inputFingerprint(state)` is canonical JSON of the state sent.
- `cacheKey({ rowId, columnId, questionFingerprint, inputFingerprint, model })` keys cached answers. It uses the exact canonical strings, so a hash collision can't attach a wrong answer. `shortHash` (8 hex digits) is for display and metadata only.
- Changing the instructions, context, options, levels, criteria, sources, state or model changes the key. Changing the policy, output mapping, presentation, labels or `decide` doesn't.

## Development

From the repository root:

```bash
npm run build            # builds and lints every package, including this one
npm run test-ai -- --run # this package's tests
```

Tests never call Jev. See the repository's `CONTRIBUTING.md` for the full check list.

## License

MIT. See `LICENSE`. Forked from Glide Data Grid by Glide (typeguard, Inc.), MIT licensed.

# Deterministic Eval Engine

ADR 009 mandates a **Deterministic Eval Engine** to gate the "Data-First" flywheel. Evaluation is the final arbiter of correctness for a recipe's improvement attempt.

## Purity Law

The evaluation engine must be a pure function of the **Artifact Index**.

- **Forbidden**: Network calls, filesystem access outside `.tmp/**`, `Date.now()`, `Math.random()`.
- **Input**: The collection of all artifacts produced by a run.
- **Output**: A set of `(pass, reason)` tuples.

## Eval DSL

A recipe defines its evaluation criteria using a domain-specific language (DSL) of primitive checks:

| Kind           | Description                                            |
| :------------- | :----------------------------------------------------- |
| `file_exists`  | Assert a file exists in the artifact index.            |
| `jsonschema`   | Validate an artifact against a JSON schema.            |
| `rowcount_gte` | Assert a table artifact has at least N rows.           |
| `regex`        | Assert an artifact's content matches a pattern.        |
| `diff_le`      | Assert the diff size between two artifacts is $\le N$. |

## Promotion Dependency

A recipe version cannot be promoted to `stable` unless its evaluation coverage floor is met.

### Snippet: Eval Check Schema

```typescript
type EvalCheck =
  | { id: string; kind: "file_exists"; glob: string }
  | { id: string; kind: "jsonschema"; artifact: string; schema: JSONSchema }
  | { id: string; kind: "rowcount_gte"; artifact: string; n: number }
  | { id: string; kind: "regex"; artifact: string; re: string }
  | { id: string; kind: "diff_le"; artifactA: string; artifactB: string; max: number };
```

## Flake Detector

Before promotion, the engine executes the same eval suite twice. If the output hashes differ (e.g., due to timestamped fields or non-canonical sort in artifacts), the version is blocked as **FLAKY**.

# Recipe Lifecycle & Immutability

ADR 009 enforces the **Immutability Law** for recipes. A recipe is not just a configuration; it's a versioned, hash-addressed data asset that governs the execution of a workflow.

## Versioning Model

A recipe's identity is defined by its `id` and `v` (e.g., `seed.r01@1.0.0`).

- **Draft**: Initial version, editable JSON.
- **Candidate**: Locked version, undergoing fixtures/eval testing.
- **Stable**: Immutable version, eligible for `/api/run` product ingress.

## Storage Hierarchy

Split recipe storage ensures clean lifecycle management and coverage tracking:

| Table                 | Scope                | Key                           |
| :-------------------- | :------------------- | :---------------------------- |
| `app.recipes`         | Global pointer       | `(id, active_v)`              |
| `app.recipe_versions` | Versioned store      | `(id, v, hash, status, json)` |
| `app.recipe_fixtures` | Versioned fixtures   | `(id, v, fixture_id, json)`   |
| `app.eval_results`    | Proof of correctness | `(run_id, check_id, pass)`    |

## Promotion Guard

The transition `Candidate -> Stable` is an atomic, fail-closed transaction.

- **Guard 1**: All fixtures associated with `id@v` must have completed successfully.
- **Guard 2**: All `eval_checks` must pass for each fixture run.
- **Guard 3**: Flake detector must confirm the output is deterministic across two independent runs.

## Snippet: Atomic Promotion

```sql
BEGIN;
  -- Fail if not a candidate or if eval coverage is missing
  UPDATE app.recipe_versions
  SET status = 'stable'
  WHERE id = $1 AND v = $2 AND status = 'candidate'
    AND EXISTS (SELECT 1 FROM app.eval_results WHERE run_id IN (SELECT id FROM app.runs WHERE recipe_id=$1 AND recipe_v=$2));

  -- Flip the global pointer
  UPDATE app.recipes SET active_v = $2 WHERE id = $1;
COMMIT;
```

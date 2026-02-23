# Identity Derivation & Dedupe

ADR 009 establishes the **Identity Derivation** rule to preserve the workflowID law while enabling hash-idempotent ingress. This is the cornerstone of the system's "exactly-once" behavior.

## Concept: Intent Hash

The `intentHash` is the canonical SHA-256 hash of a fully rendered intent (recipe + form-data). It defines the **User's Goal**.

### Identity Mapping

1.  **Form Ingress**: `POST /api/run {recipeRef, formData}`.
2.  **Compilation**: `intent = instantiateIntent(recipeRef, formData)`. Pure function.
3.  **Hash**: `intentHash = sha256(canonicalStringify(intent))`.
4.  **WorkflowID**: `intentId = workflowID = "ih_" + intentHash`.

## Deduplication Logic

- **Submission**: `/api/run` computes the `intentHash` and attempts to `startWorkflow(id=intentId)`.
- **Idempotence**: If the workflow with `intentId` already exists, DBOS returns the existing handle.
- **Divergence Guard**: If the `intentHash` matches but the payload (formData) diverges, return `409 Conflict`.

### Snippet: Identity Formula

```typescript
function computeIntentId(recipe: Recipe, formData: Record<string, unknown>): string {
  const rendered = instantiateIntent(recipe, formData);
  const hash = sha256(canonicalStringify(rendered));
  return `ih_${hash}`;
}
```

## Egress Parity

All run-read APIs (`/api/runs/:wid`) must include the `intentHash`, `recipeRef`, and `recipeHash` in their response headers and view bodies to allow downstream systems to verify the hash-idempotent handle.

### Snippet: Run Ingress Contract

```typescript
type RunStartRequest = {
  recipeRef: { id: string; v: string };
  formData: Record<string, unknown>;
  opts?: {
    queuePartitionKey?: string;
  };
};

type RunStartResponse = {
  workflowID: string;
  intentHash: string;
  recipeRef: { id: string; v: string };
  recipeHash: string;
};
```

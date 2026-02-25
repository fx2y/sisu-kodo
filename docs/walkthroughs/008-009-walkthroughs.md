# Sisu-Kodo Walkthrough: Cycles 08 & 09 (HITL & Recipe Flywheel)

## Core Philosophy
- **Data-First:** Logic lives in Recipes; the Workflow is a deterministic engine.
- **Fail-Closed:** Malformed ingress or contract drift results in immediate `400/409` with zero writes.
- **Oracle-First:** SQL (`app.*`, `dbos.*`) is the sole truth. UI and logs are adjunct.
- **Identity-Locked:** `workflowID = intentId = ih_<sha256(intent)>`.

---

## 08: HITL Gates (Human-In-The-Loop)

### 1. Developer: The `awaitHuman` Primitive
Replace ad-hoc polling with the `awaitHuman` event-recv pattern.

**Snippet: Core Gate Logic**
```typescript
// src/workflow/wf/hitl-gates.ts
async function awaitHuman<T>(gateKey: string, prompt: GatePrompt, topic: string, ttlS: number) {
  // 1. Emit prompt event FIRST (Uniqueness asserted by setEvent)
  await svc.setEvent(wid, `ui:${gateKey}`, prompt);

  // 2. Block on recv with TTL
  const msg = await svc.recv<T>(topic, ttlS);

  // 3. Persist result event
  const out = msg === null 
    ? { state: 'TIMED_OUT' } 
    : { state: 'RECEIVED', payload: msg, at: Date.now() };
  await svc.setEvent(wid, `ui:${gateKey}:result`, out);
  
  return out;
}
```

### 2. Operator: Manual Gate Interaction (SSOT)
Use the API to triage and resolve stuck gates.

**Environment Setup**
```bash
export PORT=3001
export WID="ih_..." # Target Workflow ID
```

**Step 1: List Active Gates**
```bash
curl -sf http://localhost:$PORT/api/runs/$WID/gates | jq
```

**Step 2: Submit Reply (Dedupe Required)**
```bash
GATE_KEY="step1:approve:a1"
curl -sf -X POST http://localhost:$PORT/api/runs/$WID/gates/$GATE_KEY/reply 
  -H 'Content-Type: application/json' 
  -d '{
    "payload": {"choice": "yes", "rationale": "Manual override"},
    "dedupeKey": "ops-resolve-20260225",
    "origin": "manual"
  }'
```

---

## 09: Recipe Flywheel & Intent Compiler

### 1. Developer: The Intent Compiler
formData + Recipe v0 -> Deterministic Intent.

**Snippet: InstantiateIntent**
```typescript
// src/intent-compiler/index.ts
export function instantiateIntent(rv: RecipeVersion, formData: unknown): Intent {
  const data = applyDefaults(rv.formSchema, formData);
  const intent = renderTemplate(rv.intentTmpl, data);
  return assertIntent(intent); // Strict AJV check
}
```

### 2. Developer: Reversible Patch Apply
Never mutate without a preimage hash and rollback path.

**Snippet: ApplyPatchST**
```typescript
// src/workflow/steps/apply-patch.step.ts
async function ApplyPatchST(ctx: StepContext, patch: PatchPlan) {
  const preHash = sha256(await readFile(patch.path));
  
  // Persist ledger before effect
  await repo.insertPatchHistory({ runId, path: patch.path, preHash });
  
  await applyDiff(patch.path, patch.diff);
  
  // Validation: Post-apply check
  const postHash = sha256(await readFile(patch.path));
  if (postHash !== patch.postHash) throw new Error('PATCH_DRIFT');
}
```

### 3. Operator: Seed & Promote (Live Environment)
Initialize the system with the production seed-pack.

**Step 1: Import Seed Pack**
```bash
curl -sS -X POST http://localhost:3001/api/recipes/import 
  -H 'Content-Type: application/json' 
  --data-binary @fixtures/seed-pack/bundle.v1.json
```

**Step 2: Promote to Stable (Enables /api/run)**
```bash
# promotion requires passing fixtures + eval
mise run ops:promote seed.r01 1.0.0
```

---

## Live End-User: Value Delivery

### 1. Execute a Data-Driven Recipe
Users no longer describe "goals"; they submit forms to Recipes.

**Command**
```bash
curl -sS -X POST http://localhost:3001/api/run 
  -H 'Content-Type: application/json' 
  -d '{
    "recipeRef": {"id": "seed.r01", "v": "1.0.0"},
    "formData": {"target": "production-db-01"},
    "opts": {"queuePartitionKey": "user-group-a"}
  }' | jq .
```

### 2. Triage via Repro Pack
If a run fails, the End-User/FDE gets a full bit-identical snapshot.

**Command**
```bash
pnpm exec tsx scripts/repro-pack.ts --run <WID> --out repro.json
# repro.json includes: intentHash, recipeHash, artifacts, and DBOS events.
```

---

## Proof Floor (Mandatory Signoff)
Any red here = **NO_GO**.

```bash
mise run quick      # Lint + Type + Policy
mise run check      # Unit + Integration
mise run full       # E2E + Chaos Matrix
mise tasks deps check # Verify DAG monotonicity
```

## Environment Configuration
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `OC_MODE` | `replay` | Deterministic OC calls |
| `SBX_MODE` | `mock` | Speed + isolation |
| `SBX_QUEUE_PARTITION` | `true` | Enforce fairness |
| `DBOS__APPVERSION` | `v1` | Parity across Shim/Worker |
| `PORT` | `3001` | API Shim port |
| `ADMIN_PORT` | `3002` | DBOS Admin port |

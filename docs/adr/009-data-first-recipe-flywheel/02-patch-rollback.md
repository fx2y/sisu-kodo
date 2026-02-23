# Patch Rollback & Reversibility

ADR 009 mandates that all workspace modifications by a workflow be **reversible**. This ensures that an improvement attempt (patch) can be safely rolled back if it fails to pass human approval or fixture testing.

## Patch Logic

1.  **Step**: `ApplyPatchST` applies a multi-patch plan to the workspace (`.tmp/**`).
2.  **Persistence**: Before applying, the step persists a reversible tuple for each patch in `app.patch_history`.
3.  **Hash Guard**:
    - **Apply**: `pre_hash` check (must match current file content).
    - **Rollback**: `post_hash` check (must match current file content after apply).
4.  **Idempotence**:
    - Apply is success if the file already matches `post_hash`.
    - Rollback is success if the file already matches `pre_hash`.
    - Any other mismatch results in a fail-closed error.

## Workflow-Level Rollback

On post-apply failure (HITL reject/timeout or downstream fault), the workflow must invoke deterministic rollback of applied patches in **reverse order**.

### Snippet: Reversible Tuple

```typescript
type ReversiblePatch = {
  runId: string;
  stepId: string;
  patchIdx: number;
  path: string;
  preHash: string;
  postHash: string;
  diffHash: string;
  preimage: string;
  patch: string;
};
```

### Flow: Failure Path

```typescript
try {
  await applyPatchStep(plan);
  const decision = await awaitHumanApproval();
  if (!decision.approved) {
    throw new ApprovalRejectError();
  }
  await promoteToStable();
} catch (e) {
  // Rollback in reverse index order
  await rollbackAppliedPatches(runId);
  throw e;
}
```

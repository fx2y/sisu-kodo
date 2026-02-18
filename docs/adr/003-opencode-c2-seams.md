# ADR 003: OpenCode Cycle 2 Seams and Integration

## Status

Accepted

## Context

We are integrating OpenCode (OC) as a first-class "compiler" service within our DBOS-based workflow system. The goal is to move from a fixture-based placeholder to a real SDK integration while preserving our hard-won durability and exactly-once guarantees.

## Decision

1. **Additive Integration**: OC integration MUST be additive. We will not redesign the existing storage schema or topology. Existing tables (`app.opencode_calls`, `app.run_steps`) are extended, not replaced.
2. **Hard Seam (OCClientPort)**: All OC interactions MUST pass through the `OCClientPort` interface. Direct usage of `@opencode-ai/sdk` is forbidden outside `src/oc/**`.
3. **Single Session per Run**: Each DBOS run maps to exactly one OC session (`title=runId`). Session lifecycle is managed by the `OCWrapper`.
4. **Tool Allowlist Enforcement**: The `OCWrapper` MUST enforce a tool allowlist, treating agent-level "deny" rules as advisory only (due to known SDK bypass bugs).
5. **Fail-Closed Contracts**: All OC outputs MUST be validated against strict JSON schemas via the Ajv kernel. Invalid outputs MUST trigger deterministic step failure before any durable writes.

## Rationale

- **Durability First**: Our existing DBOS-based exactly-once proof is the source of truth. OC is a subroutine, not a replacement for the workflow engine.
- **Safety**: SDK bugs (like the `parentID` recursion or `deny` bypass) are mitigated at the wrapper level.
- **Maintainability**: Centralizing OC logic makes it easier to upgrade the SDK or change providers without touching workflow business logic.

## Consequences

- No topology or storage redesign needed for Cycle 2.
- Policy gates (`policy:oc-boundary`) will block accidental SDK leakage.
- Replay remains possible using only SQL rows and OC fixtures/daemon.

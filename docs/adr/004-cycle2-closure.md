# ADR 004: Cycle 2 (OC Integration) Closure

## Status

Accepted (Feb 2026)

## Context

Cycle 2 aimed to integrate OpenCode SDK (MP20-MP23) while preserving DBOS split topology and exactly-once durability.

## Decisions

1.  **Single Wrapper Surface:** All OC interaction is gated through `OCWrapper`. Direct `@opencode-ai/sdk` usage outside `src/oc` is forbidden by policy.
2.  **Deterministic Step IDs:** Fixed `CompileST|ApplyPatchST|DecideST|ExecuteST` IDs preserved across integration.
3.  **Fail-Closed Boundary:** Ajv schema lattice mandatory for all step outputs.
4.  **Bet E Hardening:**
    - **Child Sessions Banned:** Runtime + static checks forbid `parentID`/`parent_id`.
    - **Stall Detector:** Terminate sessions with zero progress > 30s; maintain `stall_heartbeat.json`.
    - **Timeout Revert:** Auto-revert + single retry with tightened scope on stall.
    - **Session Rotation:** Forced rotation after 20 messages or 100k tokens.

## Remaining Stubs

- `oc:live:smoke` and `sbx:live:smoke` are adapter-based until real provider credentials land.
- `OCSDKAdapter.run` remains a legacy stub; `promptStructured` is the primary ingress.

## Version Caveats (Feb 2026)

- DBOS SDK 4.8.x snakes_case only for system DB.
- OpenCode SDK v1.x ESM-only requires dynamic imports in CJS.

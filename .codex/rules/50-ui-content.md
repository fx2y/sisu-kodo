---
description: UI/content/state contract determinism rules
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
  - "web/**/*"
  - "frontend/**/*"
---

# UI + Content Rules

- UI optional; contract fidelity mandatory.
- Boards are operator surfaces, not proof oracles; truth remains API+SQL+artifacts.
- Same input/state must produce same DOM/text/order.
- Keep one canonical state source per feature; derive, never duplicate.
- Async UI state machine explicit+total: `loading|error|empty|running|waiting_input|terminal`.
- Client/server payloads use shared contracts with parse/assert guards; no unchecked casts.
- Fetch seam law: branch on `res.ok` before success parsing; then parse JSON; then contract assert.
- Error classes must be explicit (`http|parse|contract|policy`) with deterministic copy.
- Unknown/malformed payloads render explicit error surfaces; no silent fallback/console-only failure.
- Lattice UX parity required for operator actions: visible deterministic handling of `400|404|409|500`.
- `alert(...)` is forbidden in control-plane flows.
- HITL UI consumes frozen key/topic ABI; compat variants require explicit structural guard.
- `origin` enum values are imported from contract source; local duplicate enums forbidden.
- Reply dedupe keys must be stable intent-scoped values; never time/random-derived.
- Deep-link contract is strict: supported `tab` set and `gate` focus/scroll behavior must match emitted links.
- Tab/panel routing must be typed by enums/contracts, never claim-substring heuristics.
- Status projection deterministic, documented, monotonic under merge.
- Canonical projection: `queued->ENQUEUED`, `running|waiting_input|repairing->PENDING`, `succeeded->SUCCESS`, `failed|retries_exceeded->ERROR`.
- Timeline merge/sort stable (`startedAt` then deterministic tie-breaker).
- Visible claims/metrics/cards require per-card provenance chips (`source`,`rawRef`, optional `evidenceRefs`,`sourceTs`).
- Provenance UI must reflect backend truth; decorative/source-snippet placeholders are forbidden.
- Timestamps must be source-honest (durable ts preferred; otherwise labeled `service clock`).
- Operator-critical times render ISO + relative form.
- Mutating forms are fail-closed: required actor/reason, legality preview, disabled illegal actions, reset on context change.
- Trace/span fields nullable-safe; client must not synthesize IDs.
- Streams adjunct UX only; SQL/events remain proof oracle.
- Artifact viewers require parse guards, MIME-aware rendering, active-content sanitization.
- Accessibility baseline mandatory: semantic structure, keyboard path, visible focus, deterministic labels.
- Copy terse, domain-specific, assertion-friendly.

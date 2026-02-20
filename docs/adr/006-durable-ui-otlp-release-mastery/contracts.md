# Cycle 6 Contract Lattice (V1)

## StepRowV1 (Egress)
```json
{
  "type": "object",
  "properties": {
    "stepID": { "type": "string" },
    "phase": { "enum": ["COMPILE", "APPLY_PATCH", "DECIDE", "EXECUTE"] },
    "status": { "enum": ["PENDING", "SUCCESS", "ERROR", "SKIPPED"] },
    "attempt": { "type": "integer" },
    "startedAt": { "type": "string", "format": "date-time" },
    "artifactRefs": { "type": "array", "items": { "$ref": "ArtifactRefV1" } }
  },
  "required": ["stepID", "phase", "status", "attempt", "startedAt"],
  "additionalProperties": false
}
```

## Status Mapping (DBOS -> UI)
| DBOS Status | UI Display Enum |
| :--- | :--- |
| `PENDING`, `ENQUEUED` | `ENQUEUED` |
| `EXECUTING`, `WAITING_INPUT`, `REPAIRING` | `PENDING` |
| `COMPLETED` | `SUCCESS` |
| `FAILED` | `ERROR` |
| `RETRIES_EXCEEDED` | `MAX_RECOVERY_ATTEMPTS_EXCEEDED` |

## Artifact Sentinel
- **Goal:** Visual feedback for non-domain steps (e.g., `DecideST` without patch).
- **Rule:** `insertArtifact(kind='none', idx=999)`.
- **UI:** Render as "None" or "Sentinel" badge to prove step completion.

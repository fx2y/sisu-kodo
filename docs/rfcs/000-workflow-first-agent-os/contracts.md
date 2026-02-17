# RFC 000 Contracts (Minimal + Strict)

## 1) Intent schema (v0)

```json
{
  "$id": "Intent.v0",
  "type": "object",
  "additionalProperties": false,
  "required": ["goal", "inputs", "constraints"],
  "properties": {
    "goal": { "type": "string", "minLength": 1 },
    "inputs": { "type": "object" },
    "constraints": { "type": "object" },
    "connectors": { "type": "array", "items": { "type": "string" } }
  }
}
```

## 2) Plan schema (v0)

```json
{
  "$id": "Plan.v0",
  "type": "object",
  "additionalProperties": false,
  "required": ["nodes"],
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "kind", "deps"],
        "properties": {
          "id": { "type": "string" },
          "kind": { "enum": ["compute", "decision", "io", "approval"] },
          "deps": { "type": "array", "items": { "type": "string" } },
          "budget": { "type": "object" }
        }
      }
    }
  }
}
```

## 3) Patch schema (v0)

```json
{
  "$id": "Patch.v0",
  "type": "object",
  "additionalProperties": false,
  "required": ["files"],
  "properties": {
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path", "diff"],
        "properties": {
          "path": { "type": "string" },
          "diff": { "type": "string" }
        }
      }
    },
    "tests": { "type": "array", "items": { "type": "string" } }
  }
}
```

## 4) RunViewModel schema (v0)

```json
{
  "$id": "RunViewModel.v0",
  "type": "object",
  "additionalProperties": false,
  "required": ["runId", "status", "steps", "artifacts"],
  "properties": {
    "runId": { "type": "string" },
    "status": { "enum": ["queued", "running", "waiting_input", "succeeded", "failed", "canceled"] },
    "steps": { "type": "array", "items": { "type": "object" } },
    "artifacts": { "type": "array", "items": { "type": "object" } },
    "traceId": { "type": "string" }
  }
}
```

## 5) OpenCode adapter interface

```ts
export type OCCompileInput = { intent: unknown; schemaVersion: number; seed: string };
export type OCCompileOutput = {
  plan: unknown;
  patch: unknown;
  tests: string[];
  transcript: unknown;
};

export interface OCClient {
  health(): Promise<{ ok: boolean }>;
  compile(input: OCCompileInput): Promise<OCCompileOutput>;
  diff(sessionId: string): Promise<unknown>;
}
```

Rules:

- Adapter must persist request/response payloads before returning success.
- Replay key must be deterministic `(intent,schemaVersion,seed)` hash.

## 6) Sandbox adapter interface

```ts
export type SandboxJob = {
  imageOrTemplate: string;
  cmd: string;
  files: Record<string, string>;
  env: Record<string, string>;
  timeoutMs: number;
};

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  files: Record<string, string>;
  meta: { bootMs: number; provider: "microsandbox" | "e2b" };
};

export interface SandboxClient {
  run(job: SandboxJob): Promise<SandboxResult>;
}
```

Rules:

- No host exec fallback in production mode.
- Files map is canonically sorted before persistence.

## 7) API examples

Create intent:

```bash
curl -sS -X POST http://127.0.0.1:3001/intents \
  -H 'content-type: application/json' \
  -d '{"goal":"daily brief","inputs":{"topics":["infra"]},"constraints":{}}'
```

Run intent:

```bash
curl -sS -X POST http://127.0.0.1:3001/intents/it_123/run
```

Resume waiting run:

```bash
curl -sS -X POST http://127.0.0.1:3001/runs/run_123/events \
  -H 'content-type: application/json' \
  -d '{"event":"approval","choice":"approve"}'
```

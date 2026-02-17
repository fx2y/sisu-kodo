# ADR 001: External API Shim

## Status

Proposed

## Context

To improve scalability and security, we are splitting the monolithic application into two distinct binaries:

1. **Worker**: Responsible for workflow execution, long-running processes, and I/O-intensive steps. It runs the full DBOS runtime.
2. **API Shim**: A stateless ingress layer that accepts HTTP requests and enqueues workflows into the Worker via `DBOSClient`.

## Decision

- Use `DBOSClient` in the API Shim to interact with the DBOS system database.
- Enforce black-box separation: the API Shim must NOT import worker-specific modules (workflows, steps).
- The API Shim must provide the correct `application_version` when enqueuing to ensure the Worker picks up the tasks.
- Shared contracts and repositories are allowed for database access and validation.

## Implications

- Deployment requires two separate processes/containers.
- The API Shim depends on the Worker being registered in the system database.
- Scalability: Workers can be scaled independently of the API ingress.
- Reliability: API Shim failures do not interrupt running workflows.

## Runbook

### Starting the Worker

```bash
npm run start:worker
# or
mise run start:worker
```

### Starting the API Shim

```bash
npm run start:api-shim
# or
mise run start:api-shim
```

### Ops Commands

- List workflows: `mise run dbos:workflow:list`
- Get workflow status: `mise run dbos:workflow:status <workflowID>`
- List queued workflows: `mise run dbos:workflow:queue:list`

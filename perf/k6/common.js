import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

export const baseUrl = __ENV.K6_BASE_URL || "http://127.0.0.1:3021";
const expectedArtifactStatus = http.expectedStatuses(200, 404);

function failThresholds() {
  return {
    http_req_failed: ["rate<0"],
    checks: ["rate>1.1"]
  };
}

function passThresholds(maxP95Ms) {
  return {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    http_req_duration: [`p(95)<${maxP95Ms}`]
  };
}

export function buildThresholds(maxP95Ms) {
  return __ENV.K6_BAD_FIXTURE === "1" ? failThresholds() : passThresholds(maxP95Ms);
}

function postJson(path, payload) {
  return http.post(`${baseUrl}${path}`, JSON.stringify(payload), {
    headers: { "content-type": "application/json" }
  });
}

function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

export function runScenario() {
  const suffix = `${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
  const intentRes = postJson("/api/intents", {
    goal: `k6-${suffix}`,
    inputs: {},
    constraints: {}
  });
  const intentOk = check(intentRes, {
    "intent accepted": (r) => r.status === 201
  });
  if (!intentOk) {
    return;
  }
  const intentBody = parseJson(intentRes);
  const intentId = intentBody && typeof intentBody.intentId === "string" ? intentBody.intentId : null;
  if (!intentId) {
    check(null, { "intent id present": () => false });
    return;
  }

  const runRes = postJson("/api/runs", {
    intentId,
    queuePartitionKey: `k6-part-${exec.vu.idInTest % 8}`
  });
  const runOk = check(runRes, {
    "run accepted": (r) => r.status === 202
  });
  if (!runOk) {
    return;
  }
  const runBody = parseJson(runRes);
  const workflowID =
    runBody && typeof runBody.workflowID === "string" ? runBody.workflowID : intentId;

  const statusRes = http.get(`${baseUrl}/api/runs/${encodeURIComponent(workflowID)}`);
  check(statusRes, {
    "status reachable": (r) => r.status === 200
  });

  const depthRes = http.get(`${baseUrl}/api/ops/queue-depth?limit=10`);
  check(depthRes, {
    "queue-depth reachable": (r) => r.status === 200
  });

  const stepsRes = http.get(`${baseUrl}/api/runs/${encodeURIComponent(workflowID)}/steps`);
  check(stepsRes, {
    "steps reachable": (r) => r.status === 200
  });
  const steps = parseJson(stepsRes);
  const artifactUri =
    Array.isArray(steps) &&
    steps.length > 0 &&
    Array.isArray(steps[0]?.artifacts) &&
    typeof steps[0].artifacts[0]?.uri === "string"
      ? steps[0].artifacts[0].uri
      : "artifact://k6/missing";
  const artifactRes = http.get(`${baseUrl}/api/artifacts/${encodeURIComponent(artifactUri)}`, {
    responseCallback: expectedArtifactStatus
  });
  check(artifactRes, {
    "artifact endpoint reachable": (r) => r.status === 200 || r.status === 404
  });
}

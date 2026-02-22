import { buildThresholds, runScenario } from "./common.js";

export const options = {
  vus: Number(__ENV.K6_VUS || 4),
  duration: __ENV.K6_DURATION || "20s",
  thresholds: buildThresholds(Number(__ENV.K6_P95_MS || 1200))
};

export default function smoke() {
  runScenario();
}

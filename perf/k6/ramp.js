import { buildThresholds, runScenario } from "./common.js";

export const options = {
  stages: [
    { duration: __ENV.K6_RAMP_UP || "20s", target: Number(__ENV.K6_RAMP_TARGET || 12) },
    { duration: __ENV.K6_STEADY || "40s", target: Number(__ENV.K6_RAMP_TARGET || 12) },
    { duration: __ENV.K6_RAMP_DOWN || "20s", target: 0 }
  ],
  thresholds: buildThresholds(Number(__ENV.K6_P95_MS || 1500))
};

export default function ramp() {
  runScenario();
}

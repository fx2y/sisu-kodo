export type ArtifactUriParts = {
  runId: string;
  stepId: string;
  taskKey: string;
  name: string;
};

const ARTIFACT_PREFIX = "artifact://";

export function isArtifactUri(uri: string): boolean {
  return uri.startsWith(ARTIFACT_PREFIX);
}

export function parseArtifactUri(uri: string): ArtifactUriParts {
  if (!isArtifactUri(uri)) {
    throw new Error(`Invalid artifact URI: ${uri}`);
  }

  const path = uri.slice(ARTIFACT_PREFIX.length);
  const parts = path.split("/");

  // Format: run/<run>/step/<step>/task/<task>/<name>
  if (parts.length < 8 || parts[0] !== "run" || parts[2] !== "step" || parts[4] !== "task") {
    throw new Error(`Malformed artifact URI: ${uri}`);
  }

  return {
    runId: parts[1],
    stepId: parts[3],
    taskKey: parts[5],
    name: parts.slice(6).join("/")
  };
}

export function buildArtifactUri(parts: ArtifactUriParts): string {
  return `${ARTIFACT_PREFIX}run/${parts.runId}/step/${parts.stepId}/task/${parts.taskKey}/${parts.name}`;
}

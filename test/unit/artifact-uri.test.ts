import { describe, it, expect } from "vitest";
import { buildArtifactUri, parseArtifactUri } from "../../src/lib/artifact-uri";

describe("artifact-uri", () => {
  it("should build and parse symmetric URIs", () => {
    const parts = {
      runId: "run-123",
      stepId: "ExecuteST",
      taskKey: "task-456",
      name: "file.txt"
    };
    const uri = buildArtifactUri(parts);
    expect(uri).toBe("artifact://run/run-123/step/ExecuteST/task/task-456/file.txt");
    expect(parseArtifactUri(uri)).toEqual(parts);
  });

  it("should handle empty taskKey", () => {
    const parts = {
      runId: "run-123",
      stepId: "CompileST",
      taskKey: "",
      name: "plan.json"
    };
    const uri = buildArtifactUri(parts);
    expect(uri).toBe("artifact://run/run-123/step/CompileST/task//plan.json");
    expect(parseArtifactUri(uri)).toEqual(parts);
  });

  it("should handle names with slashes", () => {
    const parts = {
      runId: "run-123",
      stepId: "ExecuteST",
      taskKey: "task-456",
      name: "path/to/nested/file.txt"
    };
    const uri = buildArtifactUri(parts);
    expect(uri).toBe("artifact://run/run-123/step/ExecuteST/task/task-456/path/to/nested/file.txt");
    expect(parseArtifactUri(uri)).toEqual(parts);
  });

  it("should throw on invalid prefix", () => {
    expect(() => parseArtifactUri("file://foo")).toThrow("Invalid artifact URI");
  });

  it("should throw on malformed structure", () => {
    expect(() => parseArtifactUri("artifact://foo/bar")).toThrow("Malformed artifact URI");
    expect(() => parseArtifactUri("artifact://run/1/step/2/task/3")).toThrow(
      "Malformed artifact URI"
    );
  });
});

import { ajv } from "../contracts";
import {
  assertEvalCheckResult,
  assertEvalCheckResults,
  type EvalCheckResult
} from "../contracts/eval.schema";
import type { RecipeEvalCheck as EvalCheck } from "../contracts/recipe.schema";
import type { ArtifactIndex } from "../contracts/sbx/artifact-index.schema";
import { canonicalStringify, sha256 } from "../lib/hash";

export type EvalArtifact = {
  uri: string;
  inline: unknown;
  sha256: string;
};

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function toStableText(value: unknown): string {
  if (typeof value === "string") return value;
  return canonicalStringify(value);
}

function countRows(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") {
    if (value.trim() === "") return 0;
    return value.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  }
  if (value && typeof value === "object") return 1;
  return 0;
}

function editDistance(lhs: string, rhs: string, max: number): number {
  if (lhs === rhs) return 0;
  if (Math.abs(lhs.length - rhs.length) > max) return max + 1;
  const prev = Array.from({ length: rhs.length + 1 }, (_, idx) => idx);
  const curr = new Array(rhs.length + 1).fill(0);
  for (let i = 1; i <= lhs.length; i++) {
    curr[0] = i;
    let minInRow = curr[0];
    for (let j = 1; j <= rhs.length; j++) {
      const cost = lhs[i - 1] === rhs[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      minInRow = Math.min(minInRow, curr[j]);
    }
    if (minInRow > max) return max + 1;
    for (let j = 0; j <= rhs.length; j++) prev[j] = curr[j];
  }
  return prev[rhs.length];
}

export function evaluateChecks(
  checks: EvalCheck[],
  index: ArtifactIndex,
  artifacts: ReadonlyMap<string, EvalArtifact>
): EvalCheckResult[] {
  const sortedChecks = [...checks].sort((a, b) => a.id.localeCompare(b.id));
  const results: EvalCheckResult[] = [];

  for (const check of sortedChecks) {
    let result: EvalCheckResult | null = null;
    switch (check.kind) {
      case "file_exists": {
        const re = globToRegex(check.glob);
        const hit = index.items.some((it) => re.test(it.uri));
        result = {
          checkId: check.id,
          pass: hit,
          reason: hit ? `file_exists:ok:${check.glob}` : `file_exists:missing:${check.glob}`
        };
        break;
      }
      case "jsonschema": {
        const art = artifacts.get(check.artifact);
        if (!art) {
          result = {
            checkId: check.id,
            pass: false,
            reason: `jsonschema:artifact_missing:${check.artifact}`
          };
          break;
        }
        const validate = ajv.compile(check.schema);
        const ok = validate(art.inline);
        result = {
          checkId: check.id,
          pass: Boolean(ok),
          reason: ok ? `jsonschema:ok:${check.artifact}` : `jsonschema:invalid:${check.artifact}`
        };
        break;
      }
      case "rowcount_gte": {
        const art = artifacts.get(check.artifact);
        const rows = countRows(art?.inline);
        const pass = rows >= check.n;
        result = {
          checkId: check.id,
          pass,
          reason: pass
            ? `rowcount_gte:ok:${rows}>=${check.n}`
            : `rowcount_gte:fail:${rows}<${check.n}`,
          payload: { rows, min: check.n }
        };
        break;
      }
      case "regex": {
        const art = artifacts.get(check.artifact);
        if (!art) {
          result = {
            checkId: check.id,
            pass: false,
            reason: `regex:artifact_missing:${check.artifact}`
          };
          break;
        }
        const re = new RegExp(check.re, "u");
        const text = toStableText(art.inline);
        const pass = re.test(text);
        result = {
          checkId: check.id,
          pass,
          reason: pass ? `regex:ok:${check.artifact}` : `regex:miss:${check.artifact}`
        };
        break;
      }
      case "diff_le": {
        const left = artifacts.get(check.artifactA);
        const right = artifacts.get(check.artifactB);
        if (!left || !right) {
          result = {
            checkId: check.id,
            pass: false,
            reason: `diff_le:artifact_missing:${check.artifactA}|${check.artifactB}`
          };
          break;
        }
        const max = Math.floor(check.max);
        const dist = editDistance(toStableText(left.inline), toStableText(right.inline), max);
        const pass = dist <= max;
        result = {
          checkId: check.id,
          pass,
          reason: pass ? `diff_le:ok:${dist}<=${max}` : `diff_le:fail:${dist}>${max}`,
          payload: { distance: dist, max }
        };
        break;
      }
    }
    if (!result) {
      throw new Error(`unsupported eval check kind for ${check.id}`);
    }
    assertEvalCheckResult(result);
    results.push(result);
  }

  assertEvalCheckResults(results);
  return results;
}

export function normalizeFixtureResults(
  results: ReadonlyArray<{ fixtureId: string; ok: boolean; eval: EvalCheckResult[] }>
): string {
  const normalized = [...results]
    .map((item) => ({
      fixtureId: item.fixtureId,
      ok: item.ok,
      eval: [...item.eval]
        .sort((a, b) => a.checkId.localeCompare(b.checkId))
        .map((x) => ({ checkId: x.checkId, pass: x.pass, reason: x.reason }))
    }))
    .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
  return canonicalStringify(normalized);
}

export function computeFlakeHash(
  results: ReadonlyArray<{ fixtureId: string; ok: boolean; eval: EvalCheckResult[] }>
): string {
  return sha256(normalizeFixtureResults(results));
}

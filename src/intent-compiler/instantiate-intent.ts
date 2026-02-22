import { ValidationError } from "../contracts/assert";
import type { Intent } from "../contracts/intent.schema";
import { assertIntent } from "../contracts/intent.schema";
import type { RecipeSpec } from "../contracts/recipe.schema";
import { canonicalStringify } from "../lib/hash";

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError([], "formData must be an object");
  }
  return value as Record<string, unknown>;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function applySchemaDefaults(
  schema: Record<string, unknown>,
  formData: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...formData };
  const properties =
    typeof schema.properties === "object" && schema.properties !== null ? schema.properties : {};

  for (const [key, rawProp] of Object.entries(properties)) {
    if (Object.hasOwn(next, key)) continue;
    if (typeof rawProp !== "object" || rawProp === null || Array.isArray(rawProp)) continue;
    if (!Object.hasOwn(rawProp, "default")) continue;
    next[key] = cloneJson((rawProp as { default: unknown }).default);
  }
  return next;
}

function readPath(root: Record<string, unknown>, dottedPath: string): unknown {
  const segments = dottedPath.split(".");
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function renderTemplateValue(value: unknown, scope: Record<string, unknown>): JsonLike {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/);
    if (exact) {
      const lookedUp = readPath(scope, exact[1]);
      if (lookedUp === undefined) {
        throw new ValidationError([], `missing template key: ${exact[1]}`);
      }
      return JSON.parse(canonicalStringify(lookedUp)) as JsonLike;
    }

    return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
      const lookedUp = readPath(scope, path);
      if (lookedUp === undefined) {
        throw new ValidationError([], `missing template key: ${path}`);
      }
      return String(lookedUp);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, scope));
  }

  if (value && typeof value === "object") {
    const out: Record<string, JsonLike> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderTemplateValue(v, scope);
    }
    return out;
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  throw new ValidationError([], "intent template contains non-JSON value");
}

export function instantiateIntent(recipeVersion: RecipeSpec, formDataRaw: unknown): Intent {
  const formData = asRecord(formDataRaw);
  const withDefaults = applySchemaDefaults(recipeVersion.formSchema, formData);
  const scope = { formData: withDefaults };
  const rendered = renderTemplateValue(recipeVersion.intentTmpl, scope);
  const canonical = JSON.parse(canonicalStringify(rendered)) as unknown;
  assertIntent(canonical);
  return canonical;
}

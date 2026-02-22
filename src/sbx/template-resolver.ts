import type { Pool } from "pg";
import { findRunById } from "../db/runRepo";
import { findSbxTemplateByKey } from "../db/sbxTemplateRepo";
import { sha256 } from "../lib/hash";

export type ResolvedSbxTemplate =
  | {
      source: "hot";
      templateId: string;
      templateKey: string;
      depsHash: string;
      envRef?: string;
      recipeRef: { id: string; v: string };
    }
  | {
      source: "cold";
      envRef: string;
      templateKey: string;
      depsHash: string;
      templateId?: string;
      recipeRef?: { id: string; v: string };
      reason:
        | "no_recipe_ref"
        | "missing_recipe_hash"
        | "template_unregistered";
    };

export async function resolveSbxTemplateSelection(
  pool: Pool,
  runId: string,
  fallbackEnvRef: string
): Promise<ResolvedSbxTemplate> {
  const run = await findRunById(pool, runId);
  if (!run) {
    throw new Error(`Run ${runId} not found for SBX template resolution`);
  }

  if (!run.recipe_id || !run.recipe_v) {
    return {
      source: "cold",
      envRef: fallbackEnvRef,
      templateKey: `env:${fallbackEnvRef}`,
      depsHash: sha256({ envRef: fallbackEnvRef }),
      reason: "no_recipe_ref"
    };
  }

  const recipeRef = { id: run.recipe_id, v: String(run.recipe_v) };
  const depsHash = run.recipe_hash ?? "";
  if (depsHash.length === 0) {
    return {
      source: "cold",
      envRef: fallbackEnvRef,
      templateKey: `${recipeRef.id}:${recipeRef.v}:${sha256({ fallbackEnvRef })}`,
      depsHash: sha256({ recipeRef, fallbackEnvRef }),
      recipeRef,
      reason: "missing_recipe_hash"
    };
  }

  const row = await findSbxTemplateByKey(pool, {
    recipeId: recipeRef.id,
    recipeV: recipeRef.v,
    depsHash
  });
  const templateKey = `${recipeRef.id}:${recipeRef.v}:${depsHash}`;
  if (!row) {
    return {
      source: "cold",
      envRef: fallbackEnvRef,
      templateKey,
      depsHash,
      recipeRef,
      reason: "template_unregistered"
    };
  }

  if (row.template_key !== templateKey) {
    throw new Error(
      `SBX template key drift for ${recipeRef.id}@${recipeRef.v}:${depsHash} (${row.template_key} != ${templateKey})`
    );
  }

  return {
    source: "hot",
    templateId: row.template_id,
    templateKey: row.template_key,
    depsHash,
    recipeRef
  };
}


import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { parseJsonBody } from "@src/server/json-body";
import { ValidationError, assertValid } from "@src/contracts/assert";
import { canonicalStringify } from "@src/lib/hash";
import { exportBundle } from "@src/db/recipeRepo";
import { ajv } from "@src/contracts/ajv";
import type { JSONSchemaType, ValidateFunction } from "ajv";

type ExportRequest = { id: string };
const exportSchema: JSONSchemaType<ExportRequest> = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: { type: "string", minLength: 1 } }
};
const validateExport = ajv.compile(exportSchema) as ValidateFunction<ExportRequest>;

export async function POST(req: Request) {
  try {
    const { pool } = await getServices();
    const payload = parseJsonBody(await req.text());
    assertValid(validateExport, payload, "RecipeExportRequest");
    const bundle = await exportBundle(pool, payload.id);
    return new NextResponse(canonicalStringify(bundle), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, details: error.errors }, { status: 400 });
    }
    console.error(`[API] POST /api/recipes/export error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

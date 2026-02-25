import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ProofCard = {
  id: string; // stable ID for deep linking
  claim: string;
  evidence: string;
  source: "sql" | "api" | "dbos" | "artifact" | "k6" | "policy" | "test";
  ts: number; // ingestion ts
  sourceTs?: number; // actual evidence ts
  provenance: string; // e.g. "app.v_ops_queue_depth"
  rawRef?: string; // Deep link or ref
};

const schema: JSONSchemaType<ProofCard> = {
  $id: "ProofCard.v1",
  type: "object",
  additionalProperties: false,
  required: ["id", "claim", "evidence", "source", "ts", "provenance"],
  properties: {
    id: { type: "string" },
    claim: { type: "string" },
    evidence: { type: "string" },
    source: {
      type: "string",
      enum: ["sql", "api", "dbos", "artifact", "k6", "policy", "test"]
    },
    ts: { type: "number" },
    sourceTs: { type: "number", nullable: true },
    provenance: { type: "string" },
    rawRef: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ProofCard>;

export function assertProofCard(value: unknown): asserts value is ProofCard {
  assertValid(validate, value, "ProofCard");
}

import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";

export type ProofCard = {
  claim: string;
  evidence: string;
  source: "SQL" | "API" | "DBOS" | "Artifact";
  ts: number;
  provenance: string; // e.g. "app.v_ops_queue_depth"
  rawRef?: string; // Deep link or ref
};

const schema: JSONSchemaType<ProofCard> = {
  $id: "ProofCard.v1",
  type: "object",
  additionalProperties: false,
  required: ["claim", "evidence", "source", "ts", "provenance"],
  properties: {
    claim: { type: "string" },
    evidence: { type: "string" },
    source: {
      type: "string",
      enum: ["SQL", "API", "DBOS", "Artifact"]
    },
    ts: { type: "number" },
    provenance: { type: "string" },
    rawRef: { type: "string", nullable: true }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<ProofCard>;

export function assertProofCard(value: unknown): asserts value is ProofCard {
  assertValid(validate, value, "ProofCard");
}

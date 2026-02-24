import { ajv, assertValid } from "../index";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { RunHeader } from "./run-header.schema";
import type { SignoffTile } from "./signoff-tile.schema";

export type SignoffBoardResponse = {
  verdict: "GO" | "NO_GO";
  posture: Pick<RunHeader, "topology" | "runtimeMode" | "ocMode" | "sbxMode" | "sbxProvider" | "appVersion" | "claimScope">;
  pfTiles: SignoffTile[];
  proofTiles: SignoffTile[];
  rollbackTriggers: SignoffTile[];
  ts: number;
};

const schema: JSONSchemaType<SignoffBoardResponse> = {
  $id: "SignoffBoardResponse.v1",
  type: "object",
  additionalProperties: false,
  required: ["verdict", "posture", "pfTiles", "proofTiles", "rollbackTriggers", "ts"],
  properties: {
    verdict: { type: "string", enum: ["GO", "NO_GO"] },
    posture: {
      type: "object",
      additionalProperties: false,
      required: ["topology", "runtimeMode", "ocMode", "sbxMode", "sbxProvider", "appVersion", "claimScope"],
      properties: {
        topology: { type: "string" },
        runtimeMode: { type: "string" },
        ocMode: { type: "string" },
        sbxMode: { type: "string" },
        sbxProvider: { type: "string" },
        appVersion: { type: "string" },
        claimScope: { type: "string", enum: ["signoff", "demo", "live-smoke"], nullable: true }
      }
    } as any, // Cast because of Pick and complex RunHeader types
    pfTiles: {
      type: "array",
      items: { $ref: "SignoffTile.v1" }
    },
    proofTiles: {
      type: "array",
      items: { $ref: "SignoffTile.v1" }
    },
    rollbackTriggers: {
      type: "array",
      items: { $ref: "SignoffTile.v1" }
    },
    ts: { type: "number" }
  }
};

const validate = ajv.compile(schema) as ValidateFunction<SignoffBoardResponse>;

export function assertSignoffBoardResponse(value: unknown): asserts value is SignoffBoardResponse {
  assertValid(validate, value, "SignoffBoardResponse");
}

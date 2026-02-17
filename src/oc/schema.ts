import Ajv from "ajv";

export type OCToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type OCOutput = {
  prompt: string;
  toolcalls: OCToolCall[];
  responses: unknown[];
  diffs: unknown[];
};

const ajv = new Ajv({ allErrors: true, strict: true });

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "toolcalls", "responses", "diffs"],
  properties: {
    prompt: { type: "string" },
    toolcalls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "args"],
        properties: {
          name: { type: "string" },
          args: { type: "object", additionalProperties: true }
        }
      }
    },
    responses: { type: "array", items: {} },
    diffs: { type: "array", items: {} }
  }
} as const;

const validate = ajv.compile(schema);

export function assertOCOutput(value: unknown): asserts value is OCOutput {
  if (validate(value)) return;
  const reason = ajv.errorsText(validate.errors, { separator: "; " });
  throw new Error(`invalid OC output: ${reason}`);
}

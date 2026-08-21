import {
  JsonSchemaValidationError,
  validateJsonSchema,
} from "./JsonSchemaValidator";

describe("validateJsonSchema object cardinality", () => {
  const schema = {
    type: "object",
    properties: { hp: { type: "object" }, conditions: { type: "array" } },
    minProperties: 1,
    maxProperties: 2,
    additionalProperties: false,
  };

  it("accepts an object within its property bounds", () => {
    expect(() =>
      validateJsonSchema(schema, { hp: { current: 3 } }),
    ).not.toThrow();
  });

  it("rejects objects outside their property bounds", () => {
    expect(() => validateJsonSchema(schema, {})).toThrow(
      JsonSchemaValidationError,
    );
  });
});

describe("validateJsonSchema string patterns", () => {
  const schema = { type: "string", pattern: "^[0-9]+$" };

  it("accepts matching cursor strings and rejects malformed values", () => {
    expect(() => validateJsonSchema(schema, "42")).not.toThrow();
    expect(() => validateJsonSchema(schema, "4x")).toThrow(
      JsonSchemaValidationError,
    );
  });
});

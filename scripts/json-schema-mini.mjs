// Minimal JSON Schema (2020-12 subset) validator — Node standard library only.
//
// This repo has no npm dependency surface (see AGENTS.md), so the public
// schemas it publishes are checked by a small in-repo validator rather than by
// ajv. The supported keyword set is deliberately the one the committed public
// schemas actually use:
//
//   $ref (local "#/..." pointers only), type, const, enum, required,
//   properties, additionalProperties (false or a schema), items, minItems,
//   maxItems, uniqueItems, minLength, maxLength, pattern, allOf, anyOf,
//   oneOf, not, if/then/else.
//
// Anything else in a schema is ignored, so a schema must not rely on an
// unsupported keyword for a constraint it cares about. `assertSupported`
// fails loudly when a schema reaches for a keyword this validator would
// silently drop.

const SUPPORTED = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "title",
  "description",
  "examples",
  "default",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
}

function resolvePointer(root, ref) {
  if (!ref.startsWith("#")) throw new Error(`unsupported non-local $ref: ${ref}`);
  let node = root;
  for (const rawSegment of ref.slice(1).split("/").filter(Boolean)) {
    const segment = decodeURIComponent(rawSegment).replaceAll("~1", "/").replaceAll("~0", "~");
    node = node?.[segment];
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`);
  }
  return node;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Throws if `schema` uses a keyword this validator would silently ignore. */
export function assertSupported(schema, path = "#") {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return;
  for (const [keyword, value] of Object.entries(schema)) {
    if (!SUPPORTED.has(keyword)) throw new Error(`${path}: unsupported schema keyword "${keyword}"`);
    if (keyword === "properties" || keyword === "$defs") {
      for (const [name, child] of Object.entries(value)) assertSupported(child, `${path}/${keyword}/${name}`);
    } else if (keyword === "allOf" || keyword === "anyOf" || keyword === "oneOf") {
      value.forEach((child, index) => assertSupported(child, `${path}/${keyword}/${index}`));
    } else if (["items", "additionalProperties", "not", "if", "then", "else"].includes(keyword)) {
      assertSupported(value, `${path}/${keyword}`);
    }
  }
}

function check(root, schema, value, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${path}: value is not allowed here`);
    return;
  }
  if (schema.$ref) {
    check(root, resolvePointer(root, schema.$ref), value, path, errors);
  }

  if (schema.type !== undefined) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((candidate) => matchesType(value, candidate))) {
      errors.push(`${path}: expected type ${expected.join("|")}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than ${schema.maxLength} characters`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: allows at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) errors.push(`${path}: items must be unique`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => check(root, schema.items, item, `${path}/${index}`, errors));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value, name)) errors.push(`${path}: missing required property "${name}"`);
    }
    const declared = new Set(Object.keys(schema.properties ?? {}));
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, name)) check(root, child, value[name], `${path}/${name}`, errors);
    }
    if (schema.additionalProperties !== undefined) {
      for (const name of Object.keys(value)) {
        if (declared.has(name)) continue;
        if (schema.additionalProperties === false) errors.push(`${path}: unexpected property "${name}"`);
        else check(root, schema.additionalProperties, value[name], `${path}/${name}`, errors);
      }
    }
  }

  for (const child of schema.allOf ?? []) check(root, child, value, path, errors);
  if (schema.anyOf && !schema.anyOf.some((child) => isValid(root, child, value))) {
    errors.push(`${path}: matches none of the anyOf branches`);
  }
  if (schema.oneOf) {
    const matched = schema.oneOf.filter((child) => isValid(root, child, value)).length;
    if (matched !== 1) errors.push(`${path}: must match exactly one oneOf branch (matched ${matched})`);
  }
  if (schema.not && isValid(root, schema.not, value)) errors.push(`${path}: must not match the "not" schema`);

  if (schema.if !== undefined) {
    const branch = isValid(root, schema.if, value) ? schema.then : schema.else;
    if (branch !== undefined) check(root, branch, value, path, errors);
  }
}

function isValid(root, schema, value) {
  const errors = [];
  check(root, schema, value, "#", errors);
  return errors.length === 0;
}

/** Validate `value` against `schema`; returns an array of human-readable errors. */
export function validate(schema, value, path = "#") {
  const errors = [];
  check(schema, schema, value, path, errors);
  return errors;
}

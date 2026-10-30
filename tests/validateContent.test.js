/**
 * Tests of the content validator (scripts/validateContent.js), on the cases handle's validator must also pass (see
 * tests/validators.yaml), & on the vault itself.
 */

import assert from "assert/strict";
import { readFileSync } from "fs";
import { describe, test } from "node:test";
import { parse } from "yaml";
import { checkEntry, checkValue, loadSchema, validateVault } from "../scripts/validateContent.js";

const CASES = parse(readFileSync(new URL("validators.yaml", import.meta.url), "utf8"));
const schema = await loadSchema();

describe("YAML reading", () => {
    for (const { yaml, json } of CASES.parsing)
        test(`${JSON.stringify(yaml)} reads as ${json}`, () => assert.deepEqual(parse(yaml), JSON.parse(json)));
});

describe("field types", () => {
    for (const [ name, { field, valid, invalid } ] of Object.entries(CASES.types)) {
        for (const value of valid)
            test(`${name}: ${JSON.stringify(value)} passes`, () => assert.equal(checkValue(field, value), undefined));
        for (const value of invalid)
            test(`${name}: ${JSON.stringify(value)} fails`, () => assert.notEqual(checkValue(field, value), undefined));
    }
});

describe("entries", () => {
    for (const { collection, slug, fields, errors } of CASES.entries)
        test(`${collection}/${slug} ${JSON.stringify(fields)}`, () => {
            const fieldsWrong = [ ...new Set(checkEntry(schema, collection, slug, fields).map(({ field }) => field)) ];
            assert.deepEqual(fieldsWrong.sort(), [ ...errors ].sort());
        });
});

test("vault is valid", async () => assert.deepEqual(await validateVault(), []));

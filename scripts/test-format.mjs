import assert from "node:assert/strict";
import { groupDigits } from "../src/lib/format.ts";

assert.equal(groupDigits(1500000000), "1\u202f500\u202f000\u202f000");
assert.equal(groupDigits("1234567890123"), "1\u202f234\u202f567\u202f890\u202f123");
assert.equal(groupDigits(12.5), "12,5");
assert.equal(groupDigits(-1234.56), "-1\u202f234,56");
assert.equal(groupDigits("0001234.50"), "1\u202f234,50");
assert.equal(groupDigits(null), "0");
assert.equal(groupDigits(1e21), "1\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000\u202f000");

console.log("format tests passed");

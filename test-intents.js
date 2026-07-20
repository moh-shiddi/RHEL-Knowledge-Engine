"use strict";
const fs = require("fs");
const path = require("path");
const Engine = require("./intent-engine.js");
const root = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(root, "intents.json"), "utf8"));
const knowledge = JSON.parse(fs.readFileSync(path.join(root, "knowledge.json"), "utf8"));
const suite = JSON.parse(fs.readFileSync(path.join(root, "intent-tests.json"), "utf8"));
const engine = new Engine(config, knowledge.entities);
let correct = 0;
const failures = [];
for (const test of suite.tests) {
  const result = engine.analyze(test.query);
  const actual = result.intent?.id || null;
  let ok = actual === test.expected_intent;
  const entityErrors = [];
  for (const [name, expected] of Object.entries(test.expected_entities || {})) {
    if (String(result.extracted.values[name] || "").toLowerCase() !== String(expected).toLowerCase()) {
      entityErrors.push(`${name}: expected=${expected}, actual=${result.extracted.values[name] || "—"}`);
      ok = false;
    }
  }
  if (ok) correct++;
  else failures.push({ query: test.query, expected: test.expected_intent, actual, score: result.intentScore, entityErrors });
}
const accuracy = suite.tests.length ? (correct / suite.tests.length * 100) : 0;
console.log(`Intent tests: ${correct}/${suite.tests.length} (${accuracy.toFixed(1)}%)`);
for (const failure of failures.slice(0, 30)) console.log(`FAIL: ${failure.query} | expected=${failure.expected} actual=${failure.actual} score=${failure.score} ${failure.entityErrors.join("; ")}`);
if (accuracy < 90) process.exitCode = 1;

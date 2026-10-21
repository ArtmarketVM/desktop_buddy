import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coverage } from "./acceptance-coverage.mjs";
import {
  evaluate,
  exitCode,
  markdown,
  parseFrontend,
  parseRust,
  rustSummary,
  projectRoot,
  readChecklist,
} from "./run-acceptance.mjs";

test("every checklist ID has an explicit scope and evidence or manual instructions", () => {
  const items = readChecklist(
    readFileSync(
      join(projectRoot, "docs/TEN_PHASES_ACCEPTANCE_CHECKLIST.md"),
      "utf8",
    ),
  );
  assert.equal(items.length, 122);
  assert.equal(items.filter((item) => /^P\d\d-/.test(item.id)).length, 93);
});

test("checklist changes cannot silently lose or duplicate evidence mappings", () => {
  const entry = { scope: "contract", evidence: ["suite:rust"], remaining: "" };
  const text = "- [ ] P01-01 — A check";
  assert.throws(() => readChecklist(text, {}), /Unmapped/);
  assert.throws(
    () => readChecklist(`${text}\n${text}`, { "P01-01": entry }),
    /Duplicate/,
  );
  assert.throws(
    () => readChecklist(text, { "P01-01": entry, "P01-02": entry }),
    /Unknown mapped/,
  );
  assert.throws(
    () => readChecklist(text, { "P01-01": { ...entry, evidence: [] } }),
    /Missing evidence/,
  );
});

test("cargo evidence preserves failing and ignored tests and accepts Windows newlines", () => {
  const results = parseRust(
    "test skills::tests::created ... ok\r\ntest voice::rejected ... FAILED\r\ntest live::account ... ignored, paid request\r\ntest dispatch::guard - should panic ... ok\r\n",
  );
  assert.deepEqual(
    results.map((item) => item.status),
    ["passed", "failed", "skipped", "passed"],
  );
  assert.equal(results[0].fullName, "skills::tests::created");
  assert.equal(results[3].name, "guard");
  assert.deepEqual(
    rustSummary(
      "test result: ok. 2 passed; 0 failed; 1 ignored;\ntest result: ok. 0 passed; 0 failed; 0 ignored;",
    ),
    { passed: 2, failed: 0, skipped: 1 },
  );
});

test("frontend evidence is file-qualified and skipped assertions never become passes", () => {
  const parsed = parseFrontend({
    testResults: [
      {
        name: join(projectRoot, "src/example.test.tsx"),
        assertionResults: [
          { title: "works", status: "passed" },
          { title: "pending", status: "pending" },
        ],
      },
    ],
  });
  assert.equal(parsed[0].name, "src/example.test.tsx::works");
  assert.equal(parsed[1].status, "skipped");
});

test("partial coverage, absent evidence, duplicate names, and ignored tests cannot establish full acceptance", () => {
  const item = { id: "P01-01", description: "A check" };
  const entry = {
    scope: "partial",
    evidence: ["rust:created"],
    remaining: "Use a live model",
  };
  const suites = {
    rust: {
      status: "passed",
      tests: [
        { name: "created", fullName: "skills::created", status: "passed" },
      ],
    },
  };
  assert.equal(evaluate(item, entry, suites).status, "partial-pass");
  assert.equal(evaluate(item, entry, {}).status, "blocked");
  assert.equal(
    evaluate(item, entry, { rust: { status: "passed", tests: [] } }).status,
    "failed",
  );
  assert.equal(
    evaluate(item, entry, {
      rust: {
        ...suites.rust,
        tests: [suites.rust.tests[0], suites.rust.tests[0]],
      },
    }).status,
    "failed",
  );
  assert.equal(
    evaluate(item, entry, {
      rust: {
        status: "passed",
        tests: [{ name: "created", status: "skipped" }],
      },
    }).status,
    "blocked",
  );
  assert.equal(
    evaluate(
      item,
      { scope: "manual", evidence: [], remaining: "Device required" },
      suites,
    ).status,
    "manual",
  );
});

test("suite failures and missing prerequisites fail the automated gate even when a referenced test passes", () => {
  assert.equal(
    exitCode({ rust: { status: "failed" } }, [{ status: "automated-pass" }]),
    1,
  );
  assert.equal(
    exitCode({ rust: { status: "blocked" } }, [{ status: "manual" }]),
    2,
  );
  assert.equal(
    exitCode({ rust: { status: "passed" } }, [{ status: "failed" }]),
    1,
  );
  assert.equal(
    exitCode({ rust: { status: "passed" } }, [
      { status: "partial-pass" },
      { status: "manual" },
    ]),
    0,
  );
});

test("the Markdown report preserves manual work and never marks the original checklist", () => {
  const report = {
    version: "0.27.3",
    commit: "fixture",
    dirty: true,
    platform: "win32",
    architecture: "x64",
    osRelease: "test",
    startedAt: "test",
    mode: "test",
    counts: { manual: 1 },
    exitCode: 0,
    suites: {},
    items: [
      {
        id: "REL-04",
        status: "manual",
        scope: "manual",
        remaining: "Install | restart",
        observations: [],
      },
    ],
  };
  const text = markdown(report);
  assert.match(text, /Original acceptance boxes remain unchanged/);
  assert.match(text, /Install \\\| restart/);
  assert.doesNotMatch(text, /\[x\]/);
});

test("every mapped Rust test exists as an annotated test in source", () => {
  const sources = [
    "skills/tests.rs",
    "memory/tests.rs",
    "memory/retrieval_tests.rs",
    "work_context/tests.rs",
    "agent_runtime/tests.rs",
    "goal_matching/cascade_tests.rs",
    "research/tests.rs",
    "continuity/tests.rs",
    "engine_observability/tests.rs",
    "engine_observability/hero_tests.rs",
    "ai_chat_tests.rs",
    "buddy_tests.rs",
    "core_tests.rs",
  ];
  const names = new Set(
    sources.flatMap((file) =>
      [
        ...readFileSync(
          join(projectRoot, "src-tauri/src", file),
          "utf8",
        ).matchAll(
          /#\[(?:tokio::)?test\][\s\S]*?\b(?:async\s+)?fn\s+(\w+)\s*\(/g,
        ),
      ].map((match) => match[1]),
    ),
  );
  for (const [id, entry] of Object.entries(coverage)) {
    for (const selector of entry.evidence)
      if (selector.startsWith("rust:"))
        assert.ok(names.has(selector.slice(5)), `${id}: missing ${selector}`);
  }
});

test("every mapped frontend case still exists in its source file", () => {
  for (const [id, entry] of Object.entries(coverage)) {
    for (const selector of entry.evidence) {
      if (!selector.startsWith("frontend:")) continue;
      const [file, title] = selector.slice("frontend:".length).split("::");
      const source = readFileSync(join(projectRoot, file), "utf8");
      assert.ok(
        source.includes(JSON.stringify(title)),
        `${id}: missing ${selector}`,
      );
    }
  }
});

test("reused Rust evidence is explicit in the human-readable acceptance report", () => {
  const run = "https://github.com/ArtmarketVM/desktop_buddy/actions/runs/123";
  const report = {
    version: "fixture",
    commit: "fixture",
    dirty: false,
    platform: "test",
    architecture: "test",
    osRelease: "test",
    startedAt: "test",
    mode: "test",
    exitCode: 0,
    counts: {},
    suites: {
      rust: {
        id: "rust",
        status: "passed",
        counts: { passed: 2, failed: 0, skipped: 1 },
        log: "rust-reused.log",
        reusedFrom: { run },
      },
    },
    items: [],
  };
  const text = markdown(report);
  assert.match(text, /passed \(reused\)/);
  assert.ok(text.includes(run));
  assert.ok(text.includes("rust-reused.log"));
});

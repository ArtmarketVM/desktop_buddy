import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync(".tools/quality", { recursive: true });
// The default run finds unused files, exports, types and dependencies; tests count as users.
// The production run ignores tests, so a module imported only by its own tests fails too.
const runs = {
  knip: [],
  "knip-production": ["--production", "--include", "files"],
};
const findings = [];
let failed = false;
for (const [name, args] of Object.entries(runs)) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/knip/bin/knip.js", "--reporter", "json", ...args],
    { encoding: "utf8", windowsHide: true },
  );
  // Knip exits 1 for findings; anything else without a report is a tool failure, not a clean result.
  if (result.error || ![0, 1].includes(result.status) || !result.stdout) {
    console.error(result.error?.message ?? result.stderr);
    failed = true;
    continue;
  }
  writeFileSync(`.tools/quality/${name}.json`, result.stdout);
  for (const issue of JSON.parse(result.stdout).issues)
    for (const [kind, items] of Object.entries(issue))
      if (Array.isArray(items))
        for (const item of items)
          findings.push(
            kind === "files"
              ? `unused file ${issue.file}`
              : `unused ${kind} ${issue.file}: ${item.name}`,
          );
}
const unique = [...new Set(findings)];
for (const finding of unique) console.log(finding);
console.log(
  `Knip: ${unique.length} findings (unused files, exports, types or dependencies). Reports: .tools/quality/knip*.json`,
);
const budget = JSON.parse(
  readFileSync(new URL("./lint-budget.json", import.meta.url), "utf8"),
).unusedCode;
if (unique.length > budget)
  console.error(
    `Unused code exceeds the budget of ${budget} in scripts/lint-budget.json.`,
  );
else if (unique.length < budget)
  console.log(
    `Unused code is below the budget of ${budget}; lower it in scripts/lint-budget.json.`,
  );
process.exitCode = failed || unique.length > budget ? 1 : 0;

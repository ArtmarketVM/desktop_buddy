import { ESLint } from "eslint";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".tools/quality", { recursive: true });
const eslint = new ESLint();
const results = await eslint.lintFiles([
  "src",
  "visual",
  "playwright.config.ts",
]);
writeFileSync(".tools/quality/eslint.json", JSON.stringify(results, null, 2));
const counts = results.reduce(
  (sum, file) => ({
    errors: sum.errors + file.errorCount,
    warnings: sum.warnings + file.warningCount,
    files: sum.files + Number(file.messages.length > 0),
  }),
  { errors: 0, warnings: 0, files: 0 },
);
const rules = {};
for (const file of results)
  for (const message of file.messages)
    rules[message.ruleId ?? "parser"] =
      (rules[message.ruleId ?? "parser"] ?? 0) + 1;
writeFileSync(
  ".tools/quality/eslint-summary.json",
  JSON.stringify({ ...counts, rules }, null, 2),
);
console.log((await eslint.loadFormatter("stylish")).format(results));
console.log(
  `ESLint: ${counts.errors} errors, ${counts.warnings} warnings in ${counts.files} files. Report: .tools/quality/eslint.json`,
);
process.exitCode = counts.errors ? 1 : 0;

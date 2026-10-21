import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

mkdirSync(".tools/quality", { recursive: true });
const env = { ...process.env, CARGO_TERM_COLOR: "never" };
const commonGit = execFileSync("git", ["rev-parse", "--git-common-dir"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
const repository = dirname(resolve(commonGit));
const localCargo = join(
  repository,
  ".tools/cargo/bin",
  process.platform === "win32" ? "cargo.exe" : "cargo",
);
let cargo = "cargo";
if (existsSync(localCargo)) {
  cargo = localCargo;
  env.CARGO_HOME = join(repository, ".tools/cargo");
  env.RUSTUP_HOME = join(repository, ".tools/rustup");
  env.PATH = `${dirname(cargo)}${process.platform === "win32" ? ";" : ":"}${env.PATH}`;
}
const child = spawn(
  cargo,
  [
    "clippy",
    "--locked",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--all-targets",
    "--message-format=json",
    "--",
    "-W",
    "clippy::all",
  ],
  { env, windowsHide: true },
);
let output = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
  process.stderr.write(chunk);
});
child.on("error", (error) => {
  console.error(error.message);
});
child.on("close", (code) => {
  writeFileSync(".tools/quality/clippy.jsonl", output);
  writeFileSync(".tools/quality/clippy.log", stderr);
  const findings = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    const value = JSON.parse(line);
    if (
      value.reason !== "compiler-message" ||
      !["warning", "error"].includes(value.message.level)
    )
      continue;
    const message = value.message;
    const key = JSON.stringify([
      message.level,
      message.code?.code,
      message.message,
      message.spans.map((span) => [
        span.file_name,
        span.line_start,
        span.column_start,
      ]),
    ]);
    findings.set(key, message);
  }
  const messages = [...findings.values()];
  const summary = {
    exitCode: code,
    errors: messages.filter((item) => item.level === "error").length,
    warnings: messages.filter((item) => item.level === "warning").length,
    rules: {},
  };
  for (const message of messages) {
    const rule = message.code?.code ?? message.level;
    summary.rules[rule] = (summary.rules[rule] ?? 0) + 1;
    if (message.rendered) process.stdout.write(message.rendered);
  }
  writeFileSync(
    ".tools/quality/clippy-summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(
    `Clippy: ${summary.errors} errors, ${summary.warnings} unique warnings. Exit: ${code}. Report: .tools/quality/clippy.jsonl`,
  );
  // A failed compilation or any error fails. Warnings may not exceed the committed budget.
  const budget = JSON.parse(
    readFileSync(new URL("./lint-budget.json", import.meta.url), "utf8"),
  ).clippyWarnings;
  if (summary.warnings > budget)
    console.error(
      `Clippy warnings exceed the budget of ${budget} in scripts/lint-budget.json.`,
    );
  else if (summary.warnings < budget)
    console.log(
      `Clippy warnings are below the budget of ${budget}; lower it in scripts/lint-budget.json.`,
    );
  process.exitCode =
    code !== 0 || summary.errors || summary.warnings > budget ? 1 : 0;
});

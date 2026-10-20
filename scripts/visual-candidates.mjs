import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Generate and immediately compare in the same Windows environment. The output
// is a candidate artifact; accepting/committing it always requires human review.
if (process.platform !== "win32")
  throw new Error("Visual candidates must be captured on Windows.");
if (!existsSync("visual/baselines")) {
  const base = "11760017314095d75374449690c2a1c42c5af08a";
  const diff = spawnSync(
    "git",
    ["diff", "--exit-code", base, "--", "src", "src-tauri"],
    { stdio: "inherit", windowsHide: true },
  );
  if (diff.status !== 0)
    throw new Error(
      `Initial candidates require application source unchanged from ${base}. Capture before CSS or application changes merge.`,
    );
}
for (const mode of ["all", "none"]) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      `--update-snapshots=${mode}`,
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

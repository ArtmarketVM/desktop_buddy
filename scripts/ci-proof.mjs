import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { POLICY, outputs } from "./ci-inputs.mjs";

export function readProof(path, key, kind, now = Date.now()) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (
      value.policy !== POLICY ||
      value.key !== key ||
      value.kind !== kind ||
      value.status !== "passed"
    )
      return null;
    if (
      !/^[a-f0-9]{40}$/.test(value.commit) ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(
        value.run,
      )
    )
      return null;
    const age = now - Date.parse(value.recordedAt);
    if (!(age >= 0 && age < 7 * 86400000)) return null;
    return value;
  } catch {
    return null;
  }
}
export function writeProof(path, key, kind, payload) {
  if (!/^[a-f0-9]{64}$/.test(key ?? ""))
    throw new Error("A content and environment key is required");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...payload,
        policy: POLICY,
        key,
        kind,
        status: "passed",
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        run: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}
export function validRustSuite(suite) {
  if (
    suite?.status !== "passed" ||
    !Array.isArray(suite.tests) ||
    !suite.tests.length
  )
    return false;
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const test of suite.tests) {
    if (
      !test.name ||
      !test.fullName ||
      !["passed", "skipped"].includes(test.status)
    )
      return false;
    counts[test.status]++;
  }
  return (
    counts.passed > 0 && JSON.stringify(counts) === JSON.stringify(suite.counts)
  );
}
export function rustProof(path, key) {
  const proof = readProof(path, key, "rust");
  return proof && validRustSuite(proof.suite) ? proof : null;
}
export function distDigest(directory) {
  const hash = createHash("sha256");
  function walk(path, prefix = "") {
    for (const file of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const name = join(path, file.name),
        relative = `${prefix}${file.name}`;
      if (file.isSymbolicLink())
        throw new Error("Frontend artifacts must not contain symlinks");
      if (file.isDirectory()) walk(name, relative + "/");
      else
        hash
          .update(relative + "\0")
          .update(readFileSync(name))
          .update("\0");
    }
  }
  if (!existsSync(join(directory, "index.html")))
    throw new Error("Missing production frontend");
  walk(directory);
  return hash.digest("hex");
}
export function validReport(report) {
  const required = [
    "tooling",
    "versions",
    "frontend",
    "release",
    "typescript",
    "bundle",
    "rust",
  ];
  return (
    report?.exitCode === 0 &&
    required.every((name) => report.suites?.[name]?.status === "passed") &&
    validRustSuite(report.suites.rust) &&
    report.suites.frontend.counts?.passed > 0 &&
    report.suites.frontend.counts.failed === 0 &&
    report.suites.tooling.counts?.tests > 0 &&
    report.suites.release.counts?.tests > 0
  );
}
export function fullProof(path, key, dist) {
  const proof = readProof(path, key, "full");
  try {
    if (!proof || proof.distDigest !== distDigest(dist)) return null;
    const raw = readFileSync(join(dirname(path), "acceptance/report.json"));
    const report = JSON.parse(raw);
    if (
      !validReport(report) ||
      proof.reportDigest !== createHash("sha256").update(raw).digest("hex")
    )
      return null;
    return proof;
  } catch {
    return null;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [operation, key] = process.argv.slice(2);
  const path = ".tools/ci/full/receipt.json";
  if (operation === "inspect")
    outputs({ reusable: Boolean(fullProof(path, key, "dist")) });
  else if (operation === "record") {
    const raw = readFileSync(".tools/ci/full/acceptance/report.json"),
      report = JSON.parse(raw);
    if (!validReport(report))
      throw new Error("Cannot certify failed or incomplete validation");
    writeProof(path, key, "full", {
      distDigest: distDigest("dist"),
      reportDigest: createHash("sha256").update(raw).digest("hex"),
    });
  } else if (operation === "clean") {
    rmSync(".tools/ci/full", { recursive: true, force: true });
    rmSync("dist", { recursive: true, force: true });
  } else if (operation === "prebuilt") {
    if (!fullProof(path, key, "dist"))
      throw new Error(
        "Production frontend does not match validated inputs and artifacts",
      );
    writeFileSync(
      ".tools/ci/prebuilt-frontend.json",
      JSON.stringify({ build: { beforeBuildCommand: null } }),
    );
  } else if (operation === "visual-inspect") {
    const proof = readProof(".tools/ci/visual/receipt.json", key, "visual");
    const reportPath = ".tools/ci/visual/report.json";
    let reusable = false;
    if (proof && existsSync(reportPath)) {
      const raw = readFileSync(reportPath);
      const stats = JSON.parse(raw).stats;
      reusable =
        proof.reportDigest === createHash("sha256").update(raw).digest("hex") &&
        stats.expected > 0 &&
        stats.unexpected === 0 &&
        stats.flaky === 0;
    }
    outputs({ reusable });
  } else if (operation === "visual-record") {
    const raw = readFileSync(".tools/ci/visual/report.json"),
      report = JSON.parse(raw);
    if (!(
      report.stats.expected > 0 &&
      report.stats.unexpected === 0 &&
      report.stats.flaky === 0
    ))
      throw new Error("Cannot certify unsuccessful visual tests");
    writeProof(".tools/ci/visual/receipt.json", key, "visual", {
      reportDigest: createHash("sha256").update(raw).digest("hex"),
    });
  } else throw new Error("Unknown CI proof operation");
}

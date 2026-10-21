import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const POLICY = "ci-proof-v1";
const sha = (value) => createHash("sha256").update(value).digest("hex");
export function ordinaryDocs(p) {
  return (
    /\.(md|txt)$/i.test(p) &&
    (p.startsWith("docs/") || !p.includes("/")) &&
    p !== "docs/TEN_PHASES_ACCEPTANCE_CHECKLIST.md"
  );
}
export function classify(paths) {
  const changed = paths.filter((p) => !ordinaryDocs(p));
  return {
    checks: changed.some((p) => !p.startsWith("visual/")),
    rust: changed.some((p) => included(p, "rust")),
    visual: changed.some((p) =>
      /^(src\/|public\/|visual\/|\.github\/|scripts\/ci-|package(?:-lock)?\.json$|(?:vite|playwright|tsconfig|eslint)[./])/.test(
        p,
      ),
    ),
  };
}
export function normalizeVersion(path, bytes) {
  if (
    ![
      "package.json",
      "package-lock.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ].includes(path)
  )
    return bytes;
  let text = bytes.toString("utf8").replaceAll("\r\n", "\n");
  if (
    ["package.json", "package-lock.json", "src-tauri/tauri.conf.json"].includes(
      path,
    )
  ) {
    const value = JSON.parse(text);
    delete value.version;
    if (path === "package-lock.json" && value.packages?.[""])
      delete value.packages[""].version;
    return Buffer.from(JSON.stringify(value));
  }
  if (path === "src-tauri/Cargo.toml")
    text = text.replace(
      /(\[package\][\s\S]*?\nversion = )"[^"]+"/,
      '$1"<app-version>"',
    );
  if (path === "src-tauri/Cargo.lock")
    text = text.replace(
      /(\[\[package\]\]\nname = "desktop-buddy"\nversion = )"[^"]+"/,
      '$1"<app-version>"',
    );
  return Buffer.from(text);
}
export function included(path, suite) {
  if (suite === "visual")
    return /^(src\/|public\/|visual\/|scripts\/|\.github\/|package(?:-lock)?\.json$|(?:vite|playwright|tsconfig|eslint)[./])/.test(
      path,
    );
  if (suite === "rust")
    return /^(src-tauri\/|src\/data\/.*\.json$|scripts\/|\.github\/|package(?:-lock)?\.json$|rust-toolchain|\.cargo\/)/.test(
      path,
    );
  return !ordinaryDocs(path);
}
export function fingerprint(root, suite) {
  const entries = execFileSync("git", ["ls-files", "--stage", "-z"], {
    cwd: root,
  })
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [metadata, path] = entry.split("\t");
      return { path, mode: metadata.split(" ")[0] };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256").update(POLICY + suite);
  for (const { path, mode } of entries.filter((entry) =>
    included(entry.path, suite),
  )) {
    const raw = readFileSync(resolve(root, path));
    hash
      .update(path + "\0" + mode + "\0")
      .update(suite === "rust" ? normalizeVersion(path, raw) : raw)
      .update("\0");
  }
  return hash.digest("hex");
}
export function environment(includeRust = true) {
  return {
    os: process.platform,
    arch: process.arch,
    node: process.version,
    rust: includeRust
      ? execFileSync("rustc", ["-Vv"], { encoding: "utf8" }).trim()
      : "not applicable",
    image: process.env.ImageVersion ?? "local",
    imageOS: process.env.ImageOS ?? "local",
    deployment: process.env.MACOSX_DEPLOYMENT_TARGET ?? "",
    rustflags: process.env.RUSTFLAGS ?? "",
    developerDir: process.env.DEVELOPER_DIR ?? "",
    devDebug: process.env.CARGO_PROFILE_DEV_DEBUG ?? "",
    testDebug: process.env.CARGO_PROFILE_TEST_DEBUG ?? "",
  };
}
export function inputKeys(root, host = environment(), now = Date.now()) {
  const bucket = Math.floor(now / (7 * 86400000));
  const key = (suite) =>
    sha(
      JSON.stringify({
        policy: POLICY,
        suite,
        source: fingerprint(root, suite),
        host,
        bucket,
      }),
    );
  return {
    validation_key: key("full"),
    rust_key: key("rust"),
    visual_key: key("visual"),
  };
}
export function outputs(values) {
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}\n`;
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, line);
    else process.stdout.write(line);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.includes("--plan")) {
    let plan;
    try {
      const base = process.env.BASE_SHA;
      if (!/^[a-f0-9]{40}$/.test(base ?? "") || /^0+$/.test(base))
        throw new Error("No usable base");
      const paths = execFileSync("git", [
        "diff",
        "--name-only",
        "-z",
        base,
        "HEAD",
      ])
        .toString()
        .split("\0")
        .filter(Boolean);
      plan = classify(paths);
      plan.rust = paths
        .filter((path) => included(path, "rust"))
        .some((path) => {
          try {
            return !normalizeVersion(
              path,
              execFileSync("git", ["show", `${base}:${path}`]),
            ).equals(normalizeVersion(path, readFileSync(path)));
          } catch {
            return true;
          }
        });
    } catch {
      plan = { checks: true, visual: true, rust: true };
    }
    if (process.env.FORCE_CHECKS === "true")
      plan = { checks: true, visual: true, rust: true };
    outputs(plan);
  } else if (process.argv.includes("--visual"))
    outputs({
      validation_key: inputKeys(process.cwd(), environment(false)).visual_key,
    });
  else outputs(inputKeys(process.cwd()));
}

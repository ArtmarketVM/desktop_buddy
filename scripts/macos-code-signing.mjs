import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
export function signingPolicy() {
  const policy = JSON.parse(
    readFileSync(resolve(root, "src-tauri/macos-code-signing.json")),
  );
  const certificate = new X509Certificate(
    readFileSync(resolve(root, "src-tauri/internal-macos-signing.pem")),
  );
  const normalize = (value) => value.replaceAll(":", "").toLowerCase();
  if (
    policy.mode !== "internal" ||
    normalize(certificate.fingerprint) !== policy.certificateSha1 ||
    normalize(certificate.fingerprint256) !== policy.certificateSha256
  )
    throw new Error(
      "The public macOS certificate and signing policy disagree.",
    );
  return policy;
}

export function internalRequirement(identifier, policy = signingPolicy()) {
  if (
    !/^[a-zA-Z0-9.-]+$/.test(identifier) ||
    !/^[a-f0-9]{40}$/.test(policy.certificateSha1)
  )
    throw new Error("Invalid signing requirement metadata.");
  return `identifier "${identifier}" and certificate root = H"${policy.certificateSha1}"`;
}

export function validateInternalRequirement(actual, expected) {
  if (actual.trim() !== expected)
    throw new Error(
      "The app must retain its exact certificate-bound designated requirement; ad-hoc or alternate identities are not allowed.",
    );
}

export function verifyInternalApp(app) {
  const policy = signingPolicy();
  const identifier = JSON.parse(
    readFileSync(resolve(root, "src-tauri/tauri.conf.json")),
  ).identifier;
  const expected = internalRequirement(identifier, policy);
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], {
    stdio: "pipe",
  });
  const metadata = execFileSync(
    "/usr/bin/codesign",
    ["--display", "-r-", app],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const actual = metadata.match(/^designated => (.+)$/m)?.[1];
  if (!actual)
    throw new Error("No designated requirement was returned by codesign.");
  validateInternalRequirement(actual, expected);
  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--strict", "-R", `=${expected}`, app],
    { stdio: "pipe" },
  );
  return policy.certificateSha256;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    `Verified internal macOS signature: ${verifyInternalApp(resolve(process.argv[2]))}. Apple notarization is not provided.`,
  );

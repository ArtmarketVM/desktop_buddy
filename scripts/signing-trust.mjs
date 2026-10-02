import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

export function publicKey(value) {
  if (typeof value !== "string" || value.length > 4096)
    throw new Error("Invalid public key.");
  const text = value.trim().startsWith("untrusted comment:")
    ? value.trim()
    : Buffer.from(value.trim(), "base64").toString("utf8").trim();
  const lines = text.split(/\r?\n/);
  const bytes = Buffer.from(lines[1] ?? "", "base64");
  if (
    !lines[0]?.startsWith("untrusted comment:") ||
    bytes.length !== 42 ||
    !["Ed", "ED"].includes(bytes.subarray(0, 2).toString())
  )
    throw new Error("Use a Tauri public .pub key, never a private key.");
  return {
    encoded: Buffer.from(text + "\n").toString("base64"),
    id: bytes.subarray(2, 10).toString("hex"),
    bytes,
  };
}

export function validateTrust(trust, primary) {
  if (
    !Number.isSafeInteger(trust?.epoch) ||
    trust.epoch < 1 ||
    !Array.isArray(trust.signers) ||
    trust.signers.length < 1 ||
    trust.signers.length > 16
  )
    throw new Error("Invalid signing trust configuration.");
  const names = new Set(),
    keys = new Set();
  for (const signer of trust.signers) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(signer.id) || names.has(signer.id))
      throw new Error("Signer IDs must be unique lowercase names.");
    const key = publicKey(signer.pubkey);
    if (keys.has(key.id)) throw new Error("Duplicate signing key ID.");
    names.add(signer.id);
    keys.add(key.id);
  }
  if (primary && !keys.has(publicKey(primary).id))
    throw new Error("The configured default public key must be trusted.");
  return trust;
}

export function readTrust(root) {
  return validateTrust(
    JSON.parse(readFileSync(`${root}/src-tauri/trusted-signers.json`, "utf8")),
    JSON.parse(readFileSync(`${root}/src-tauri/tauri.conf.json`, "utf8"))
      .plugins.updater.pubkey,
  );
}

export function verifyArtifact(bytes, encodedSignature, trust, version) {
  const text = Buffer.from(encodedSignature.trim(), "base64").toString("utf8");
  const lines = text.trim().split(/\r?\n/);
  const signature = Buffer.from(lines[1] ?? "", "base64");
  const global = Buffer.from(lines[3] ?? "", "base64");
  if (
    lines.length !== 4 ||
    !lines[0].startsWith("untrusted comment:") ||
    !lines[2].startsWith("trusted comment: ") ||
    signature.length !== 74 ||
    global.length !== 64 ||
    signature.subarray(0, 2).toString() !== "ED"
  )
    throw new Error("Invalid updater signature.");
  const id = signature.subarray(2, 10).toString("hex");
  const signer = trust.signers.find((item) => publicKey(item.pubkey).id === id);
  if (!signer)
    throw new Error(
      "This signing key is not trusted. Enroll its public key in a transition release first.",
    );
  const key = publicKey(signer.pubkey);
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    key.bytes.subarray(10),
  ]);
  const cryptoKey = createPublicKey({ key: der, format: "der", type: "spki" });
  const sig = signature.subarray(10);
  const comment = lines[2].slice(17);
  if (
    !verify(
      null,
      createHash("blake2b512").update(bytes).digest(),
      cryptoKey,
      sig,
    ) ||
    !verify(null, Buffer.concat([sig, Buffer.from(comment)]), cryptoKey, global)
  )
    throw new Error("Installer signature verification failed.");
  if (version && !comment.split(/\s+/).includes(`version:${version}`))
    throw new Error("Signed installer version does not match the release.");
  return signer.id;
}

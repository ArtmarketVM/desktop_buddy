import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function validatePrivacyCopy(intervalSource, policy) {
  const seconds = intervalSource.match(
    /const SAMPLE_INTERVAL:\s*Duration\s*=\s*Duration::from_secs\((\d+)\)/,
  )?.[1];
  const text = policy.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const documented = text.match(
    /at most one capture attempt per (\d+) seconds/,
  )?.[1];
  if (!seconds || documented !== seconds)
    throw new Error(
      "Privacy capture cadence differs from observation::SAMPLE_INTERVAL. Correct documentation before native builds.",
    );
  if (
    !/encrypted temporary review evidence/.test(text) ||
    !/deleted after the corresponding daily summary is successfully saved/.test(
      text,
    ) ||
    /images are temporary and are not saved/i.test(text)
  )
    throw new Error(
      "Privacy policy must describe encrypted temporary evidence and deletion after the saved daily summary.",
    );
}
export function checkPrivacySource(root = process.cwd()) {
  validatePrivacyCopy(
    readFileSync(resolve(root, "src-tauri/src/observation.rs"), "utf8"),
    readFileSync(resolve(root, "docs/privacy.html"), "utf8"),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  checkPrivacySource();
  console.log(
    "Privacy source cadence and temporary-evidence disclosure verified before native builds.",
  );
}

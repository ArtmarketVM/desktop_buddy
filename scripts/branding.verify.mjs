import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assetPrefix } from "./product-branding.mjs";
const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("sumi branding preserves the existing application and installer identities", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  assert.equal(config.productName, "sumi");
  assert.equal(config.mainBinaryName, "sumi");
  assert.equal(config.identifier, "com.artmarketvm.desktopbuddy");
  assert(config.plugins["deep-link"].desktop.schemes.includes("desktopbuddy"));
  const template = read("src-tauri/" + config.bundle.windows.nsis.template);
  assert(template.includes('!define PRODUCTNAME "{{product_name}}"'));
  assert(
    template.includes(
      '!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Desktop Buddy"',
    ),
  );
  assert(
    template.includes('!define MANUPRODUCTKEY "${MANUKEY}\\Desktop Buddy"'),
  );
  assert(template.includes("RestorePreviousInstallLocation"));
  const hook = read("src-tauri/" + config.bundle.windows.nsis.installerHooks);
  assert(hook.includes("IsShortcutTarget"));
});
test("new asset branding does not rewrite delivered compatibility asset names", () => {
  assert.equal(assetPrefix("0.49.1"), "Desktop.Buddy");
  for (const v of ["0.49.2", "0.50.0", "1.0.0"])
    assert.equal(assetPrefix(v), "sumi");
  assert.throws(() => assetPrefix("invalid"));
});

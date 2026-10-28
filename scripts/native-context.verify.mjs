import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test(
  "macOS native context traversal and safe window selection",
  {
    skip:
      process.platform !== "darwin"
        ? "Requires the macOS SDK; no OS permissions or UI needed"
        : false,
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "buddy-native-context-"));
    try {
      const binary = join(directory, "context-test");
      const source = fileURLToPath(
        new URL("../src-tauri/native/context_test.m", import.meta.url),
      );
      execFileSync(
        "xcrun",
        [
          "clang",
          "-fobjc-arc",
          "-fblocks",
          "-Wall",
          "-Werror",
          source,
          "-o",
          binary,
          "-framework",
          "Foundation",
          "-framework",
          "CoreGraphics",
        ],
        { stdio: "pipe" },
      );
      execFileSync(binary, [], { stdio: "pipe", timeout: 10000 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

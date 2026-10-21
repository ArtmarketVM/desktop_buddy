import type { KnipConfig } from "knip";

// Unused files, exports, types and dependencies fail CI (docs/QUALITY_GATES.md).
const config: KnipConfig = {
  // index.html (src/main.tsx) comes from the Vite plugin, tests from Vitest and Playwright.
  entry: [
    // Loaded by visual/index.html for the Playwright screens.
    "visual/boot.ts",
    // Documented integration boundary (docs/AI_BUDDY_TAVILY_TRACKING.md).
    "src/ai/contracts.ts!",
    "scripts/*.mjs",
    "server/*.mjs",
    "browser-extension/*.{js,mjs}",
  ],
  project: [
    "src/**/*.{ts,tsx,css}!",
    "visual/**/*.ts",
    "scripts/**/*.mjs",
    "server/**/*.mjs",
    "browser-extension/**/*.{js,mjs}",
  ],
  // Fonts are imported from CSS.
  compilers: {
    css: (text: string) => [...text.matchAll(/(?<=@)import[^;]+/g)].join("\n"),
  },
  // Run on demand (npx prettier); not part of any script.
  ignoreDependencies: ["prettier"],
  // Rust toolchain, not an npm package.
  ignoreBinaries: ["rustc"],
};

export default config;

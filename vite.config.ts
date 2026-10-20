import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: { exclude: [...configDefaults.exclude, "visual/**"] },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/.tools/**"] },
  },
  clearScreen: false,
});

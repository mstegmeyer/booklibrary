import { defineConfig } from "rolldown";

// Production bundle: everything except the native modules (SQLite, sharp) is inlined,
// so the runtime image needs no dev or peer dependencies.
export default defineConfig({
  input: "src/main.ts",
  platform: "node",
  external: ["better-sqlite3", "sharp"],
  output: { file: "dist/main.js", format: "esm", codeSplitting: false },
});

import { defineConfig } from "rolldown";

// Production bundle: everything except the native SQLite binding is inlined,
// so the runtime image needs no dev or peer dependencies.
export default defineConfig({
  input: "src/main.ts",
  platform: "node",
  external: ["better-sqlite3"],
  output: { file: "dist/main.js", format: "esm", codeSplitting: false },
});

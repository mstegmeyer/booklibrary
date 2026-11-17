import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { loadConfig, version, webRoot } from "./config.ts";
import { openDatabase } from "./db/client.ts";

const config = loadConfig();
const db = openDatabase(config.dataDir);
const auth = createAuth(db, config);
const production = process.env.NODE_ENV === "production";

const server = serve(
  {
    fetch: createApp(db, auth, {
      libraryDir: config.libraryDir,
      webRoot: production ? webRoot : undefined,
    }).fetch,
    port: config.port,
  },
  (info) => console.log(`Hootshelf ${version} listening on port ${info.port}`),
);

// As PID 1 in a container Node ignores SIGTERM unless it is handled.
process.on("SIGTERM", () => server.close(() => process.exit(0)));

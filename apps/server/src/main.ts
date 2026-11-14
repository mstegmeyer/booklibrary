import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { loadConfig, version } from "./config.ts";
import { openDatabase } from "./db/client.ts";

const config = loadConfig();
const db = openDatabase(config.dataDir);
const auth = createAuth(db, config);
const webRoot =
  process.env.NODE_ENV === "production"
    ? join(import.meta.dirname, "../../web/dist")
    : undefined;

const server = serve(
  { fetch: createApp(db, auth, { webRoot }).fetch, port: config.port },
  (info) =>
    console.log(`Book Library ${version} listening on port ${info.port}`),
);

// As PID 1 in a container Node ignores SIGTERM unless it is handled.
process.on("SIGTERM", () => server.close(() => process.exit(0)));

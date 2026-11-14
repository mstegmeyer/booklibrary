import { createRouter } from "../api/router.ts";
import { locationsRoutes } from "./locations/routes.ts";
import { usersRoutes } from "./users/routes.ts";

// Every feature that needs a signed-in user is mounted here, under /api/v1.
export const features = createRouter()
  .route("/users", usersRoutes)
  .route("/locations", locationsRoutes);

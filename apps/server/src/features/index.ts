import { createRouter } from "../api/router.ts";
import { booksRoutes } from "./books/routes.ts";
import { contactsRoutes } from "./contacts/routes.ts";
import { genresRoutes } from "./genres/routes.ts";
import { loansRoutes } from "./loans/routes.ts";
import { locationsRoutes } from "./locations/routes.ts";
import { metadataRoutes } from "./metadata/routes.ts";
import { readingRoutes } from "./reading/routes.ts";
import { statisticsRoutes } from "./statistics/routes.ts";
import { usersRoutes } from "./users/routes.ts";

// Every feature that needs a signed-in user is mounted here, under /api/v1.
export const features = createRouter()
  .route("/users", usersRoutes)
  .route("/locations", locationsRoutes)
  .route("/genres", genresRoutes)
  .route("/books", booksRoutes)
  .route("/metadata", metadataRoutes)
  .route("/contacts", contactsRoutes)
  .route("/loans", loansRoutes)
  .route("/reading", readingRoutes)
  .route("/statistics", statisticsRoutes);

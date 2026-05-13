# Modular Refactor Design

## Goal

Refactor the Bar POS application toward maintainable Node/Express practices while preserving the current user-visible behavior, database schema, routes, views, and Docker runtime.

## Context

The README describes a deliberately simple app with most backend logic in `src/server.js`. That file has grown to roughly 3,000 lines and now owns app setup, middleware, uploads, settings, auth, products, categories, POS, tables, sales, reports, dues, members, and users. The size makes small changes risky because unrelated concerns are coupled in one file.

The project has no git repository in this workspace and no automated test suite beyond `npm run check`, which runs Node syntax checks.

## Requirements

- Keep existing route paths and EJS view names unchanged.
- Keep the MariaDB schema and migration behavior unchanged.
- Keep Docker Compose startup behavior unchanged.
- Extract shared helpers and setup code into focused modules.
- Add lightweight tests for pure helper behavior before changing production code where practical.
- Keep each change small enough to verify with syntax checks and targeted tests.
- Fix documentation/runtime inconsistencies discovered while reading the README.

## Architecture

The refactor will keep Express and EJS. `src/server.js` will become the composition entry point: it loads environment config, creates the Express app, installs middleware, mounts route registration modules, and starts the server.

Shared concerns will move into focused CommonJS modules:

- `src/lib/parsing.js`: numeric parsing and date/year helpers.
- `src/lib/formatting.js`: money and date/time formatting.
- `src/lib/async-route.js`: async Express error wrapper.
- `src/lib/flash.js`: session flash helper.
- `src/config/brand-config.js`: file-backed brand settings.
- `src/middleware/auth.js`: `requireAuth` and `requireAdmin`.
- `src/uploads/product-images.js`: multer setup and product image persistence helpers.

Route extraction will be incremental. The first implementation pass will extract low-risk shared modules and update `server.js` to use them. Deeper route splitting can follow once helper extraction is verified.

## Error Handling

Existing route-level behavior stays unchanged. New modules will preserve current fallbacks, such as default brand values, invalid numeric input fallbacks, upload validation messages, and admin PIN compatibility.

## Testing

Add Node's built-in test runner for pure helpers, avoiding extra dependencies. The first tests will cover parsing, formatting shape, and brand config default/validation behavior. Verification will use:

- `npm test`
- `npm run check`

## Documentation

Update README and `.env.example` only for factual inconsistencies:

- `docker-compose.yaml` is the named-volume recommended Compose file.
- `docker-compose.yml` is the fixed-host-volume variant.
- Remove the leading space before `ADMIN_CANCEL_PIN` in `.env.example`.

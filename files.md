# Files

Brief description of each file in the codebase.

## Root

| File | Description |
|------|-------------|
| `package.json` | npm package configuration, dependencies, and scripts |
| `tsconfig.json` | TypeScript compiler configuration |
| `README.md` | Installation and usage documentation |
| `LICENSE` | MIT license |
| `.gitignore` | Git ignore patterns |
| `.npmignore` | npm publish ignore patterns |
| `changelog.md` | Version history and changes |
| `files.md` | This file, describes codebase structure |
| `task.md` | Tracks completed and pending tasks |

## src/

| File | Description |
|------|-------------|
| `src/index.ts` | Plugin entry point, exports Config, SyncClient, and hook handlers |
| `src/cli.ts` | CLI commands: login, logout, status, config, set, setup, verify, synctest, hook |

## dist/ (generated)

| File | Description |
|------|-------------|
| `dist/index.js` | Compiled plugin entry point |
| `dist/index.d.ts` | TypeScript type definitions |
| `dist/cli.js` | Compiled CLI executable |

## .cursor/rules/

| File | Description |
|------|-------------|
| `.cursor/rules/dev2.mdc` | Development guidelines and coding rules |
| `.cursor/rules/convex2.mdc` | Convex best practices |
| `.cursor/rules/convex-write-conflicts.mdc` | Convex write conflict prevention patterns |
| `.cursor/rules/gitruels.mdc` | Git safety rules |
| `.cursor/rules/help.mdc` | Core development guidelines |
| `.cursor/rules/rulesforconvex.mdc` | Additional Convex guidelines |

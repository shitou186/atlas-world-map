# Atlas Source Build Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the current session.

**Goal:** Rebuild and run Atlas from maintained source after deleting dist.

**Architecture:** Restore app and geometry modules from the current page, replace bundled libraries with pinned packages, and build with Vite. Keep models/textures in public and generate both Node and Cloudflare artifacts.

**Tech Stack:** JavaScript ES modules, Vite, MapLibre, Three.js, Node test runner.

**Spec:** docs/superpowers/specs/2026-11-16-source-build-design.md

## Global Constraints

- Node.js 22.12+; preserve existing map behavior and asset attribution.
- No dependency on previously generated dist or remote source downloads at build time.
- Preserve current uncommitted changes; perform implementation in the user's current workspace.

## Review Focus

- Clean build without dist/cloudflare.
- Worker URLs and dynamically imported profiling code must resolve in production.
- Models and textures retain binary compatibility.
- Search, mobile settings and visibility controls retain behavior.
- Cloudflare deploy preparation builds fresh artifacts instead of stale copies.

### Task 1: Capture regression and recovery inputs

- [x] Save reference artifacts outside build output for investigation only.
- [x] Add clean-build regression test in build.test.mjs using an isolated temporary source copy; observe failure with current pipeline.
- [x] Record baseline handler tests.

### Task 2: Restore maintainable source modules

- [x] Separate src/AtlasApp.js, scene renderers, models/codec, routes, geometry builders, tile decoding and Worker entry.
- [x] Replace library implementations with npm imports; retain readable algorithms and descriptive module/class names.
- [x] Preserve HTML and app CSS; move original data/model/texture assets to public/.
- [x] Test codec round trips, geometry features and app controls against actual module behavior.

### Task 3: Implement source build pipeline

- [x] Add Vite config and pinned dependencies; build frontend before packaging Node/Cloudflare output.
- [x] Ensure start/test/deploy use fresh build; ignore all generated output.
- [x] Run clean build regression and handler/source tests.

### Task 4: Verify and document

- [x] Run a clean source build, production HTTP smoke and browser checks; fix regressions.
- [x] Update README and SOURCES with commands, source layout and reconstruction limitations.
- [x] Review final diff and leave local changes for user review without deployment or commit.

## Verification record

- Baseline: original start reproduced ERR_MODULE_NOT_FOUND; original clean build reproduced ENOENT on missing dist.
- Final: removed both generated directories in the working copy; pnpm test rebuilt Node and Cloudflare output and passed 10/10 tests.
- Browser: 2/2 production tests passed using real Worker/WASM with deterministic MVT input; confirmed visible triangles, building picking, controls, search and mobile layout.
- All seven original model/texture/style inputs compare byte-for-byte with the saved original artifacts.
- Dependency manifests match both lock files; independent whole-change review reported no actionable findings.
- Live third-party map/search availability was not validated; browser regression isolates those services with fixtures.
- No deployment or commit was performed.

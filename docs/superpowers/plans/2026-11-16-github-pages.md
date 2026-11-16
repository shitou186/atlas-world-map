# GitHub Pages Implementation Plan（历史记录）

后续部署隔离调整见[两个平台独立部署](../../独立部署说明.md)。外部 Cloudflare API 配置已停用，此处保留原实施和验证记录。

Goal: publish the static frontend under a repository prefix while retaining local and Cloudflare hosting.

Spec: docs/superpowers/specs/2026-11-16-github-pages-design.md

- [x] Frontend: centralize asset/API URLs and unit-test root/subpath/external API behavior.
- [x] Backend: implement configurable CORS with binary/HEAD/error/preflight regression coverage.
- [x] Build: add pages-only build and preview; force default Node/Cloudflare build to root and same-origin API.
- [x] CI: add official Pages workflow with pinned actions, tests and configurable public API/base path.
- [x] Integration: clean Pages build and nested static browser tests; retain Node/CF and dev regressions.
- [x] Documentation/review: update README, review complete diff, resolve findings.
Delivery: commit and push the verified adaptation; inspect the automatic workflow result and report any required account settings.

## Verification

- Full regression suite: 37 tests passed, including clean Node/CF and Pages builds, CORS, proxy and URL resolution.
- Browser regression: 2 Pages tests, 2 production tests and 3 development tests passed; includes real geometry Worker, dynamic modules, model/texture subpaths, cross-origin API URLs, picking and HMR.
- Wrangler dry-run passed. Official action tags resolved to fixed commit SHAs; workflow YAML and deployment dependencies checked.
- Independent read-only review reported no actionable findings.
- CLI rollout correction: use `pnpm run deploy`; `pnpm deploy` is pnpm's built-in workspace deployment command.

- Existing Worker updated successfully (version e926db3c-f0b9-462d-8459-6f3bf1ca287b). Live root site, Pages/local-preview OPTIONS, binary tile GET and Chinese geocode GET passed; unlisted origin returns 403.

- CI follow-up: Node22 uses `--experimental-test-isolation=none`; the stable flag name is only accepted on newer Node releases. Updated the shared test script and verified with the installed Node22 runtime before retrying deployment.

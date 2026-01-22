# Issue #38 plan notes

## Summary

- Feature: optional generation of package.json + lock file during build executor.
- Motivation: SSR deploys from Nx monorepo should avoid installing unused deps.
- Desired behavior: opt-in flag (default false), modeled after @nx/vite/@nx/webpack.
- Implementation will happen in dedicated branch: feature/cursor/$BRANCH_NAME
- Support optional inclusion of devDependencies in generated package.json.
- Support optional inclusion of peerDependencies, with an option to merge peers into dependencies.

## Current state

- Build executor: nx-astro/src/executors/build/executor.ts
- Options: outputPath/mode/verbose/root/config/site/base/sourcemap/clean/additionalArgs
- Astro outDir is injected to dist/<projectRoot> in generator templates.
- Docs: docs/executors.md, docs/api-reference.md, docs/configuration.md
- Tests: nx-astro/src/executors/build/executor.spec.ts, nx-astro-e2e tests.

## Proposed options (align with @nx/vite)

- generatePackageJson?: boolean (default false)
- includeDevDependencies?: boolean (default false)
- includePeerDependencies?: boolean (default false)
- mergePeerInDependencies?: boolean (default false)
- skipOverrides?: boolean
- skipPackageManager?: boolean
- packageManager?: "npm" | "pnpm" | "yarn" | "bun"

## Implementation outline

1. Schema + types
   - Add new fields to build schema.json + schema.d.ts.
   - Update docs tables and schema snippets.

2. Executor logic
   - Determine output dir:
     - Use options.outputPath when provided (overrides outDir).
     - Otherwise prefer astro.config.mjs outDir when present.
     - Otherwise default to dist/<projectRoot> (matches injected astro outDir).
   - After successful build, when generatePackageJson:
     - Call @nx/js createPackageJson with project graph + flags.
     - Write package.json into output dir.
     - Handle peerDependencies:
       - When includePeerDependencies, keep in peerDependencies by default.
       - When mergePeerInDependencies, copy peers into dependencies.
     - Call @nx/js createLockFile to generate lock file alongside package.json.
       - Use canonical lockfile name for selected packageManager.
       - If packageManager flag is provided, use that lockfile format.
     - Respect skipOverrides/skipPackageManager/includeDevDependencies/includePeerDependencies/mergePeerInDependencies flags.
   - Ensure output dir exists before writing.
   - Log generated file locations.

3. Tests
   - Unit: verify createPackageJson/createLockFile called when enabled.
   - Unit: verify not called when disabled.
   - Unit: verify output dir uses outputPath override.
   - Optional e2e: add config in fixture to enable generatePackageJson, assert files.

4. Dependencies
   - Add @nx/js to runtime dependencies (executor imports it).
   - Regenerate pnpm-lock.yaml.
5. Docs
   - Update docs and README/CHANGELOG to mention new build options.

## Open questions

- Decision: apply to all builds (not SSR-only).
- Decision: outputPath overrides outDir; otherwise prefer outDir, else default to dist/<projectRoot>.
- Decision: best choice is to skip lockfile generation for unsupported package
  managers (e.g., bun) with a clear log message. If skipPackageManager is set,
  skip lockfile regardless.
- Decision: includePeerDependencies keeps peers in peerDependencies; optional
  mergePeerInDependencies copies them into dependencies.
- Decision: use canonical lockfile names; allow packageManager flag to select
  lockfile format.
- Decision: document in docs and README/CHANGELOG.

export interface BuildExecutorSchema {
  /**
   * Override the default output directory
   */
  outputPath?: string;

  /**
   * Build mode: 'static' for static site generation, 'server' for SSR
   */
  mode?: 'static' | 'server';

  /**
   * Enable verbose output
   * @default false
   */
  verbose?: boolean;

  /**
   * Project root path (usually provided by Nx)
   */
  root?: string;

  /**
   * Path to Astro config file
   * @default "astro.config.mjs"
   */
  config?: string;

  /**
   * Site URL for absolute URLs
   */
  site?: string;

  /**
   * Base path for deployment
   */
  base?: string;

  /**
   * Generate source maps
   * @default false
   */
  sourcemap?: boolean;

  /**
   * Clean output directory before build
   * @default true
   */
  clean?: boolean;

  /**
   * Additional CLI arguments to pass to Astro
   */
  additionalArgs?: string[];

  /**
   * Generate a package.json and lockfile in the build output directory
   * @default false
   */
  generatePackageJson?: boolean;

  /**
   * Include devDependencies in the generated package.json
   * @default false
   */
  includeDevDependencies?: boolean;

  /**
   * Include peerDependencies in the generated package.json
   * @default false
   */
  includePeerDependencies?: boolean;

  /**
   * Copy peerDependencies into dependencies in the generated package.json
   * @default false
   */
  mergePeerInDependencies?: boolean;

  /**
   * Skip merging package manager overrides/resolutions into the generated package.json
   * @default false
   */
  skipOverrides?: boolean;

  /**
   * Skip setting the packageManager field in the generated package.json
   * @default false
   */
  skipPackageManager?: boolean;

  /**
   * Target package manager for lockfile generation (overrides auto-detected)
   */
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
}

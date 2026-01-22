import {
  detectPackageManager,
  ExecutorContext,
  logger,
  readJsonFile,
  writeJsonFile,
} from '@nx/devkit';
import { createLockFile, createPackageJson, getLockFileName } from '@nx/js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { BuildExecutorSchema } from './schema';
import { buildAstroCommandString } from '../../utils/command-builder';
import { syncAstrojsDependencies } from '../../utils/sync-astrojs-deps';
import { parseAstroConfig } from '../../utils/astro-config-parser';

const execAsync = promisify(exec);

export interface BuildExecutorOutput {
  success: boolean;
  error?: string;
}

export default async function buildExecutor(
  options: BuildExecutorSchema,
  context: ExecutorContext,
): Promise<BuildExecutorOutput> {
  try {
    // Get project configuration
    const projectName = context.projectName;
    if (!projectName) {
      throw new Error('Project name is not defined in executor context');
    }

    const projectConfig =
      context.projectsConfigurations?.projects?.[projectName];
    if (!projectConfig) {
      throw new Error(`Project configuration not found for ${projectName}`);
    }

    // Determine project root
    const projectRoot = options.root
      ? path.isAbsolute(options.root)
        ? options.root
        : path.join(context.root, options.root)
      : path.join(context.root, projectConfig.root);

    // Sync @astrojs/* dependencies before build
    syncAstrojsDependencies(options.root || projectConfig.root, context.root);

    // Build the command arguments (exclude 'astro' and 'build')
    const commandArgs: string[] = [];

    // Add root flag
    commandArgs.push('--root', projectRoot);

    // Add optional flags
    if (options.outputPath) {
      commandArgs.push('--outDir', options.outputPath);
    }

    if (options.mode) {
      commandArgs.push('--mode', options.mode);
    }

    if (options.verbose) {
      commandArgs.push('--verbose');
    }

    if (options.site) {
      commandArgs.push('--site', options.site);
    }

    if (options.base) {
      commandArgs.push('--base', options.base);
    }

    if (options.config) {
      commandArgs.push('--config', options.config);
    }

    // Add additional arguments
    if (options.additionalArgs && options.additionalArgs.length > 0) {
      commandArgs.push(...options.additionalArgs);
    }

    // Build command string with package manager prefix
    const commandString = buildAstroCommandString(
      'build',
      commandArgs,
      context.root,
    );
    logger.info(`Executing: ${commandString}`);

    // Execute the build command
    const { stdout, stderr } = await execAsync(commandString, {
      cwd: context.root,
      env: process.env,
    });

    if (stdout) {
      logger.info(stdout);
    }

    if (stderr) {
      logger.warn(stderr);
    }

    logger.info('Build completed successfully');

    if (options.generatePackageJson) {
      const outputPath = resolveOutputPath(
        options,
        projectRoot,
        projectConfig.root,
        context.root,
      );
      await generatePackageArtifacts(options, context, projectRoot, outputPath);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Build failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

function resolveOutputPath(
  options: BuildExecutorSchema,
  projectRoot: string,
  projectConfigRoot: string,
  workspaceRoot: string,
): string {
  if (options.outputPath) {
    return resolvePathFromProjectRoot(projectRoot, options.outputPath);
  }

  const configPath = resolveAstroConfigPath(projectRoot, options.config);
  const configOutDir = readAstroOutDir(configPath);
  if (configOutDir) {
    return resolvePathFromProjectRoot(projectRoot, configOutDir);
  }

  return path.join(workspaceRoot, 'dist', projectConfigRoot);
}

function resolveAstroConfigPath(
  projectRoot: string,
  configPath?: string,
): string {
  const resolvedConfigPath = configPath ?? 'astro.config.mjs';
  return path.isAbsolute(resolvedConfigPath)
    ? resolvedConfigPath
    : path.join(projectRoot, resolvedConfigPath);
}

function readAstroOutDir(configPath: string): string | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }

  const configContent = readFileSync(configPath, 'utf-8');
  const astroConfig = parseAstroConfig(configContent);
  return astroConfig.outDir;
}

function resolvePathFromProjectRoot(projectRoot: string, targetPath: string) {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(projectRoot, targetPath);
}

async function generatePackageArtifacts(
  options: BuildExecutorSchema,
  context: ExecutorContext,
  projectRoot: string,
  outputPath: string,
): Promise<void> {
  if (!context.projectName) {
    throw new Error('Project name is not defined in executor context');
  }

  if (!context.projectGraph) {
    throw new Error('Project graph is not available in executor context');
  }

  await mkdir(outputPath, { recursive: true });

  const includeDevDependencies = options.includeDevDependencies ?? false;
  const includePeerDependencies = Boolean(
    options.includePeerDependencies || options.mergePeerInDependencies,
  );

  const builtPackageJson = createPackageJson(
    context.projectName,
    context.projectGraph,
    {
      target: context.targetName,
      root: context.root,
      isProduction: !includeDevDependencies,
      skipOverrides: options.skipOverrides,
      skipPackageManager: options.skipPackageManager,
    },
  );

  if (includePeerDependencies) {
    const projectPackageJson = readProjectPackageJson(projectRoot);
    mergePeerDependencies(builtPackageJson, projectPackageJson);
  } else {
    delete builtPackageJson.peerDependencies;
    delete builtPackageJson.peerDependenciesMeta;
  }

  if (options.mergePeerInDependencies && builtPackageJson.peerDependencies) {
    builtPackageJson.dependencies ??= {};
    for (const [name, version] of Object.entries(
      builtPackageJson.peerDependencies,
    )) {
      if (!builtPackageJson.dependencies[name]) {
        builtPackageJson.dependencies[name] = version;
      }
    }
  }

  const packageJsonPath = path.join(outputPath, 'package.json');
  writeJsonFile(packageJsonPath, builtPackageJson);
  logger.info(`Generated package.json at ${packageJsonPath}`);

  if (options.skipPackageManager) {
    logger.info(
      'Skipping lockfile generation because skipPackageManager is set',
    );
    return;
  }

  const packageManager =
    options.packageManager ?? detectPackageManager(context.root);

  if (packageManager === 'bun') {
    logger.warn(
      'Bun lockfile generation is not supported. The generated package.json will not include a lockfile. Run "bun install" in the output directory after deployment if needed.',
    );
    return;
  }

  const lockFile = createLockFile(
    builtPackageJson,
    context.projectGraph,
    packageManager,
  );
  const lockFileName = getLockFileName(packageManager);
  const lockFilePath = path.join(outputPath, lockFileName);
  writeFileSync(lockFilePath, lockFile, { encoding: 'utf-8' });
  logger.info(`Generated ${lockFileName} at ${lockFilePath}`);
}

function readProjectPackageJson(projectRoot: string) {
  const projectPackageJsonPath = path.join(projectRoot, 'package.json');
  if (!existsSync(projectPackageJsonPath)) {
    return undefined;
  }

  return readJsonFile(projectPackageJsonPath);
}

function mergePeerDependencies(
  builtPackageJson: { peerDependencies?: Record<string, string> },
  projectPackageJson?: {
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  },
) {
  if (!projectPackageJson?.peerDependencies) {
    return;
  }

  builtPackageJson.peerDependencies ??= {};
  for (const [name, version] of Object.entries(
    projectPackageJson.peerDependencies,
  )) {
    if (!builtPackageJson.peerDependencies[name]) {
      builtPackageJson.peerDependencies[name] = version;
    }
  }

  if (projectPackageJson.peerDependenciesMeta) {
    const peerDependenciesMeta =
      (
        builtPackageJson as {
          peerDependenciesMeta?: Record<string, { optional?: boolean }>;
        }
      ).peerDependenciesMeta ?? {};

    for (const [name, meta] of Object.entries(
      projectPackageJson.peerDependenciesMeta,
    )) {
      if (!peerDependenciesMeta[name]) {
        peerDependenciesMeta[name] = meta;
      }
    }

    (
      builtPackageJson as {
        peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      }
    ).peerDependenciesMeta = peerDependenciesMeta;
  }
}

import { ExecutorContext, logger } from '@nx/devkit';
import { createLockFile, createPackageJson, getLockFileName } from '@nx/js';
import { exec } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { promisify } from 'util';
import * as path from 'path';
import { BuildExecutorSchema } from './schema';
import { buildAstroCommandString } from '../../utils/command-builder';
import { detectPackageManager } from '../../utils/dependency-checker';
import { syncAstrojsDependencies } from '../../utils/sync-astrojs-deps';

const execAsync = promisify(exec);

export interface BuildExecutorOutput {
  success: boolean;
  error?: string;
}

function resolveOutputPath(
  outputPath: string | undefined,
  workspaceRoot: string,
  projectRoot: string,
): string {
  if (outputPath) {
    return path.isAbsolute(outputPath)
      ? outputPath
      : path.join(workspaceRoot, outputPath);
  }

  return path.join(workspaceRoot, 'dist', projectRoot);
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
    const projectRoot =
      options.root || path.join(context.root, projectConfig.root);

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

    if (options.generatePackageJson) {
      const outputDirectory = resolveOutputPath(
        options.outputPath,
        context.root,
        projectConfig.root,
      );
      mkdirSync(outputDirectory, { recursive: true });

      const packageJson = createPackageJson(projectName, context.projectGraph, {
        root: context.root,
        target: context.targetName,
        isProduction: !options.includeDevDependencies,
        skipOverrides: options.skipOverrides,
        skipPackageManager: options.skipPackageManager ?? false,
      });

      if (!options.includePeerDependencies) {
        delete packageJson.peerDependencies;
        delete packageJson.peerDependenciesMeta;
      }

      writeFileSync(
        path.join(outputDirectory, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );
      logger.info(
        `Generated package.json for ${projectName} in ${outputDirectory}`,
      );

      if (!options.skipPackageManager) {
        const packageManager = detectPackageManager(context.root);
        const lockFile = createLockFile(
          packageJson,
          context.projectGraph,
          packageManager,
        );
        const lockFileName = getLockFileName(packageManager);
        writeFileSync(path.join(outputDirectory, lockFileName), lockFile);
        logger.info(
          `Generated ${lockFileName} for ${projectName} in ${outputDirectory}`,
        );
      }
    }

    logger.info('Build completed successfully');

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

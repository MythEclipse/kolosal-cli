/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

export const initCommand: CommandModule = {
  command: 'init',
  describe: 'Initialize a new Kolosal configuration',
  builder: (yargs) =>
    yargs.option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'Overwrite existing configuration file',
      default: false,
    }),
  handler: async (argv) => {
    const configDir = path.join(process.cwd(), '.kolosal');
    const configFile = path.join(configDir, 'config.json');

    console.log('🚀 Initializing Kolosal configuration...\n');

    if (fs.existsSync(configFile) && !argv['force']) {
      logger.error('Configuration file already exists at .kolosal/config.json');
      console.log('Use --force to overwrite.');
      process.exit(1);
    }

    const defaultConfig = {
      model: {
        name: 'gemini-2.0-flash-exp',
        provider: 'google',
      },
      security: {
        auth: {
          selectedType: 'no_auth',
        },
      },
      ui: {
        theme: 'default',
        language: 'en',
      },
      context: {
        includeDirectories: [],
        fileFiltering: {
          respectGitIgnore: true,
        },
      },
    };

    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log(`Created directory: ${configDir}`);
      }

      fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
      console.log(`✅ Created configuration file: ${configFile}`);
      console.log(
        '\nYou can now modify this file or run "kolosal" to start using the CLI.',
      );
    } catch (error) {
      logger.error('Failed to create configuration file', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
    process.exit(0);
  },
};

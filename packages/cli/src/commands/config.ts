/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadSettings, SettingScope } from '../config/settings.js';
import process from 'node:process';
import { get } from 'lodash-es';

export const configCommand: CommandModule = {
  command: 'config <command>',
  describe: 'Manage configuration values',
  builder: (yargs) =>
    yargs
      .command({
        command: 'list',
        describe: 'List all configuration values',
        handler: () => {
          const settings = loadSettings(process.cwd());
          console.log(JSON.stringify(settings.merged, null, 2));
        },
      })
      .command({
        command: 'get <key>',
        describe: 'Get a specific configuration value',
        builder: (yargs) =>
          yargs.positional('key', {
            type: 'string',
            describe: 'The configuration key (e.g. model.name)',
          }),
        handler: (argv) => {
          const settings = loadSettings(process.cwd());
          const key = argv.key as string;
          const value = get(settings.merged, key);

          if (value === undefined) {
            console.error(`Key '${key}' not found.`);
            process.exit(1);
          }

          if (typeof value === 'object') {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(value);
          }
        },
      })
      .command({
        command: 'set <key> <value>',
        describe: 'Set a configuration value in user settings',
        builder: (yargs) =>
          yargs
            .positional('key', {
              type: 'string',
              describe: 'The configuration key (e.g. model.name)',
            })
            .positional('value', {
              type: 'string',
              describe: 'The value to set',
            }),
        handler: (argv) => {
          const settings = loadSettings(process.cwd());
          const key = argv.key as string;
          let value: unknown = argv.value;

          // Simple type inference
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (!isNaN(Number(value)) && value !== '') value = Number(value);

          try {
            settings.setValue(SettingScope.User, key, value);
            console.log(`Updated '${key}' to:`, value);
          } catch (error) {
            console.error(
              'Failed to update setting:',
              error instanceof Error ? error.message : String(error),
            );
            process.exit(1);
          }
        },
      })
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {},
};

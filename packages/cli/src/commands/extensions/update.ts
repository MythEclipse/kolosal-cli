/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import {
  updateExtension,
  loadUserExtensions,
  toOutputString,
} from '../../config/extension.js';
import { FatalConfigError, getErrorMessage } from '@kolosal-ai/kolosal-ai-core';

interface UpdateArgs {
  name: string;
}

export async function handleUpdate(args: UpdateArgs) {
  try {
    // Check if extension exists before attempting update
    const extensions = loadUserExtensions();
    const extensionExists = extensions.some(
      (ext) => ext.config.name === args.name,
    );

    if (!extensionExists) {
      if (extensions.length === 0) {
        console.log(`Extension "${args.name}" is not installed.`);
        console.log('No extensions are currently installed.');
      } else {
        console.log(`Extension "${args.name}" is not installed.`);
        console.log('\nAvailable extensions:');
        console.log(
          extensions
            .map((extension) => toOutputString(extension))
            .join('\n\n'),
        );
      }
      return;
    }

    const updatedExtensionInfo = await updateExtension(args.name);
    if (!updatedExtensionInfo) {
      console.log(`Extension "${args.name}" failed to update.`);
      return;
    }
    console.log(
      `Extension "${args.name}" successfully updated: ${updatedExtensionInfo.originalVersion} → ${updatedExtensionInfo.updatedVersion}.`,
    );
  } catch (error) {
    throw new FatalConfigError(getErrorMessage(error));
  }
}

export const updateCommand: CommandModule = {
  command: 'update <name>',
  describe: 'Updates an extension.',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'The name of the extension to update.',
        type: 'string',
      })
      .check((_argv) => true),
  handler: async (argv) => {
    await handleUpdate({
      name: argv['name'] as string,
    });
  },
};

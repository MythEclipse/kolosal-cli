/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadUserExtensions, toOutputString } from '../../config/extension.js';
import { FatalConfigError, getErrorMessage } from '@kolosal-ai/kolosal-ai-core';

export async function handleList() {
  try {
    const extensions = loadUserExtensions();
    if (extensions.length === 0) {
      console.log('No extensions installed.');
      return;
    }
    console.log(
      extensions
        .map((extension, _): string => toOutputString(extension))
        .join('\n\n'),
    );
  } catch (error) {
    throw new FatalConfigError(getErrorMessage(error));
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'Lists installed extensions.',
  builder: (yargs) => yargs,
  handler: async () => {
    await handleList();
  },
};

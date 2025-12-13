/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import process from 'node:process';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { logger } from '../utils/logger.js';

export const doctorCommand: CommandModule = {
  command: 'doctor',
  describe: 'Check your system for potential issues',
  handler: async () => {
    console.log('🩺  Kolosal CLI Doctor\n');

    const checks = [
      {
        name: 'Node.js Version',
        run: () => {
          const version = process.version;
          const major = parseInt(version.replace('v', '').split('.')[0], 10);
          if (major < 18) {
            throw new Error(
              `Node.js version ${version} is too old. Please upgrade to Node.js 18 or later.`,
            );
          }
          return `v${process.versions.node}`;
        },
      },
      {
        name: 'Git Installation',
        run: () => {
          try {
            const version = execSync('git --version', {
              encoding: 'utf8',
            }).trim();
            return version;
          } catch {
            throw new Error('Git is not installed or not in your PATH.');
          }
        },
      },
      {
        name: 'Operating System',
        run: () => `${os.type()} ${os.release()} (${os.arch()})`,
      },
      {
        name: 'API Key Configuration',
        run: () => {
          const hasOpenAI = !!process.env['OPENAI_API_KEY'];
          const hasKolosalToken = !!process.env['KOLOSAL_OAUTH_TOKEN'];
          const hasGeminiKey = !!process.env['GOOGLE_GENAI_API_KEY']; // Assuming this might be used

          if (hasOpenAI || hasKolosalToken || hasGeminiKey) {
            const keys = [];
            if (hasOpenAI) keys.push('OPENAI_API_KEY');
            if (hasKolosalToken) keys.push('KOLOSAL_OAUTH_TOKEN');
            if (hasGeminiKey) keys.push('GOOGLE_GENAI_API_KEY');
            return `Found: ${keys.join(', ')}`;
          }
          return 'No API keys found in environment variables (this is okay if using config files)';
        },
      },
    ];

    let issuesFound = 0;

    for (const check of checks) {
      process.stdout.write(`Checking ${check.name}... `);
      try {
        const result = check.run();
        console.log(`✅ ${result}`);
      } catch (error) {
        issuesFound++;
        console.log(`❌`);
        logger.error(
          `  Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    console.log('\n');
    if (issuesFound > 0) {
      console.log(`⚠️  Doctor found ${issuesFound} issue(s).`);
      process.exit(1);
    } else {
      console.log('✨  Everything looks good!');
      process.exit(0);
    }
  },
};

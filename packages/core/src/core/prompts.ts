/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ToolNames } from '../tools/tool-names.js';
import process from 'node:process';
import { isGitRepository } from '../utils/gitUtils.js';
import { GEMINI_CONFIG_DIR } from '../tools/memoryTool.js';
import type { GenerateContentConfig } from '@google/genai';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ModelTemplateMapping {
  baseUrls?: string[];
  modelNames?: string[];
  template?: string;
}

export interface SystemPromptConfig {
  systemPromptMappings?: ModelTemplateMapping[];
}

/**
 * Helper to load prompt from file and replace placeholders
 */
function loadPrompt(filename: string): string {
  const filePath = path.join(__dirname, 'prompts', filename);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace ToolNames placeholders
  for (const [key, value] of Object.entries(ToolNames)) {
    // Regex to match {{ToolNames.KEY}}
    content = content.replaceAll(`{{ToolNames.${key}}}`, value);
  }
  return content.trim();
}

/**
 * Normalizes a URL by removing trailing slash for consistent comparison
 */
function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Checks if a URL matches any URL in the array, ignoring trailing slashes
 */
function urlMatches(urlArray: string[], targetUrl: string): boolean {
  const normalizedTarget = normalizeUrl(targetUrl);
  return urlArray.some((url) => normalizeUrl(url) === normalizedTarget);
}

/**
 * Processes a custom custom instruction by appending user memory if available.
 * This function should only be used when there is actually a custom instruction.
 *
 * @param customInstruction - Custom system instruction (ContentUnion from @google/genai)
 * @param userMemory - User memory to append
 * @returns Processed custom system instruction with user memory appended
 */
export function getCustomSystemPrompt(
  customInstruction: GenerateContentConfig['systemInstruction'],
  userMemory?: string,
): string {
  // Extract text from custom instruction
  let instructionText = '';

  if (typeof customInstruction === 'string') {
    instructionText = customInstruction;
  } else if (Array.isArray(customInstruction)) {
    // PartUnion[]
    instructionText = customInstruction
      .map((part) => (typeof part === 'string' ? part : part.text || ''))
      .join('');
  } else if (customInstruction && 'parts' in customInstruction) {
    // Content
    instructionText =
      customInstruction.parts
        ?.map((part) => (typeof part === 'string' ? part : part.text || ''))
        .join('') || '';
  } else if (customInstruction && 'text' in customInstruction) {
    // PartUnion (single part)
    instructionText = customInstruction.text || '';
  }

  // Append user memory using the same pattern as getCoreSystemPrompt
  const memorySuffix =
    userMemory && userMemory.trim().length > 0
      ? `\n\n---\n\n${userMemory.trim()}`
      : '';

  return `${instructionText}${memorySuffix}`;
}

function getSandboxInfo(): string {
  // Determine sandbox status based on environment variables
  const isSandboxExec = process.env['SANDBOX'] === 'sandbox-exec';
  const isGenericSandbox = !!process.env['SANDBOX']; // Check if SANDBOX is set to any non-empty value

  if (isSandboxExec) {
    return `
# macOS Seatbelt
You are running under macos seatbelt with limited access to files outside the project directory or system temp directory, and with limited access to host system resources such as ports. If you encounter failures that could be due to MacOS Seatbelt (e.g. if a command fails with 'Operation not permitted' or similar error), as you report the error to the user, also explain why you think it could be due to MacOS Seatbelt, and how the user may need to adjust their Seatbelt profile.
`.trim();
  } else if (isGenericSandbox) {
    return `
# Sandbox
You are running in a sandbox container with limited access to files outside the project directory or system temp directory, and with limited access to host system resources such as ports. If you encounter failures that could be due to sandboxing (e.g. if a command fails with 'Operation not permitted' or similar error), when you report the error to the user, also explain why you think it could be due to sandboxing, and how the user may need to adjust their sandbox configuration.
`.trim();
  } else {
    return `
# Outside of Sandbox
You are running outside of a sandbox container, directly on the user's system. For critical commands that are particularly likely to modify the user's system outside of the project directory or system temp directory, as you explain the command to the user (per the Explain Critical Commands rule above), also remind the user to consider enabling sandboxing.
`.trim();
  }
}

function getGitInfo(): string {
  if (isGitRepository(process.cwd())) {
    return `
# Git Repository
- The current working (project) directory is being managed by a git repository.
- When asked to commit changes or prepare a commit, always start by gathering information using shell commands:
  - \`git status\` to ensure that all relevant files are tracked and staged, using \`git add ...\` as needed.
  - \`git diff HEAD\` to review all changes (including unstaged changes) to tracked files in work tree since last commit.
    - \`git diff --staged\` to review only staged changes when a partial commit makes sense or was requested by the user.
  - \`git log -n 3\` to review recent commit messages and match their style (verbosity, formatting, signature line, etc.)
- Combine shell commands whenever possible to save time/steps, e.g. \`git status && git diff HEAD && git log -n 3\`.
- Always propose a draft commit message. Never just ask the user to give you the full commit message.
- Prefer commit messages that are clear, concise, and focused more on "why" and less on "what".
- Keep the user informed and ask for clarification or confirmation where needed.
- After each commit, confirm that it was successful by running \`git status\`.
- If a commit fails, never attempt to work around the issues without being asked to do so.
- Never push changes to a remote repository without being asked explicitly by the user.
`.trim();
  }
  return '';
}

export function getCoreSystemPrompt(
  userMemory?: string,
  config?: SystemPromptConfig,
  model?: string,
): string {
  // if GEMINI_SYSTEM_MD is set (and not 0|false), override system prompt from file
  // default path is .gemini/system.md but can be modified via custom path in GEMINI_SYSTEM_MD
  let systemMdEnabled = false;
  let systemMdPath = path.resolve(path.join(GEMINI_CONFIG_DIR, 'system.md'));
  const systemMdVar = process.env['GEMINI_SYSTEM_MD'];
  if (systemMdVar) {
    const systemMdVarLower = systemMdVar.toLowerCase();
    if (!['0', 'false'].includes(systemMdVarLower)) {
      systemMdEnabled = true; // enable system prompt override
      if (!['1', 'true'].includes(systemMdVarLower)) {
        let customPath = systemMdVar;
        if (customPath.startsWith('~/')) {
          customPath = path.join(os.homedir(), customPath.slice(2));
        } else if (customPath === '~') {
          customPath = os.homedir();
        }
        systemMdPath = path.resolve(customPath); // use custom path from GEMINI_SYSTEM_MD
      }
      // require file to exist when override is enabled
      if (!fs.existsSync(systemMdPath)) {
        throw new Error(`missing system prompt file '${systemMdPath}'`);
      }
    }
  }

  // Check for system prompt mappings from global config
  if (config?.systemPromptMappings) {
    const currentModel = process.env['OPENAI_MODEL'] || '';
    const currentBaseUrl = process.env['OPENAI_BASE_URL'] || '';

    const matchedMapping = config.systemPromptMappings.find((mapping) => {
      const { baseUrls, modelNames } = mapping;
      // Check if baseUrl matches (when specified)
      if (
        baseUrls &&
        modelNames &&
        urlMatches(baseUrls, currentBaseUrl) &&
        modelNames.includes(currentModel)
      ) {
        return true;
      }

      if (baseUrls && urlMatches(baseUrls, currentBaseUrl) && !modelNames) {
        return true;
      }
      if (modelNames && modelNames.includes(currentModel) && !baseUrls) {
        return true;
      }

      return false;
    });

    if (matchedMapping?.template) {
      const isGitRepo = isGitRepository(process.cwd());

      // Replace placeholders in template
      let template = matchedMapping.template;
      template = template.replace(
        '{RUNTIME_VARS_IS_GIT_REPO}',
        String(isGitRepo),
      );
      template = template.replace(
        '{RUNTIME_VARS_SANDBOX}',
        process.env['SANDBOX'] || '',
      );

      return template;
    }
  }

  let basePrompt = '';

  if (systemMdEnabled) {
    // If override is enabled, read from the user specified file
    basePrompt = fs.readFileSync(systemMdPath, 'utf8');
  } else {
    // Load default system prompt from package
    basePrompt = loadPrompt('system_prompt.md');

    // Generate dynamic parts
    const sandboxInfo = getSandboxInfo();
    const gitInfo = getGitInfo();
    const toolExamples = getToolCallExamples(model || '');

    // Construct dynamic content block
    // We trim each part to ensure clean spacing
    const dynamicContent = [sandboxInfo, gitInfo, toolExamples]
      .filter(s => s.length > 0)
      .join('\n\n');

    basePrompt = basePrompt.replace('{{DYNAMIC_CONTENT}}', dynamicContent);
  }

  // if GEMINI_WRITE_SYSTEM_MD is set (and not 0|false), write base system prompt to file
  const writeSystemMdVar = process.env['GEMINI_WRITE_SYSTEM_MD'];
  if (writeSystemMdVar) {
    const writeSystemMdVarLower = writeSystemMdVar.toLowerCase();
    if (!['0', 'false'].includes(writeSystemMdVarLower)) {
      if (['1', 'true'].includes(writeSystemMdVarLower)) {
        fs.mkdirSync(path.dirname(systemMdPath), { recursive: true });
        fs.writeFileSync(systemMdPath, basePrompt); // write to default path, can be modified via GEMINI_SYSTEM_MD
      } else {
        let customPath = writeSystemMdVar;
        if (customPath.startsWith('~/')) {
          customPath = path.join(os.homedir(), customPath.slice(2));
        } else if (customPath === '~') {
          customPath = os.homedir();
        }
        const resolvedPath = path.resolve(customPath);
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, basePrompt); // write to custom path from GEMINI_WRITE_SYSTEM_MD
      }
    }
  }

  const memorySuffix =
    userMemory && userMemory.trim().length > 0
      ? `\n\n---\n\n${userMemory.trim()}`
      : '';

  return `${basePrompt}${memorySuffix}`;
}

/**
 * Provides the system prompt for the history compression process.
 * This prompt instructs the model to act as a specialized state manager,
 * think in a scratchpad, and produce a structured XML summary.
 */
export function getCompressionPrompt(): string {
  return loadPrompt('compression_prompt.md');
}

/**
 * Provides the system prompt for generating project summaries in markdown format.
 * This prompt instructs the model to create a structured markdown summary
 * that can be saved to a file for future reference.
 */
export function getProjectSummaryPrompt(): string {
  return loadPrompt('project_summary_prompt.md');
}

function getToolCallExamples(model?: string): string {
  // Check for environment variable override first
  const toolCallStyle = process.env['QWEN_CODE_TOOL_CALL_STYLE'];
  if (toolCallStyle) {
    switch (toolCallStyle.toLowerCase()) {
      case 'qwen-coder':
        return loadPrompt('tool_examples_qwen_coder.md');
      case 'qwen-vl':
        return loadPrompt('tool_examples_qwen_vl.md');
      case 'general':
        return loadPrompt('tool_examples_general.md');
      default:
        console.warn(
          `Unknown QWEN_CODE_TOOL_CALL_STYLE value: ${toolCallStyle}. Using model-based detection.`,
        );
        break;
    }
  }

  // Enhanced regex-based model detection
  if (model && model.length < 100) {
    // Match qwen*-coder patterns (e.g., qwen3-coder, qwen2.5-coder, qwen-coder)
    if (/qwen[^-]*-coder/i.test(model)) {
      return loadPrompt('tool_examples_qwen_coder.md');
    }
    // Match qwen*-vl patterns (e.g., qwen-vl, qwen2-vl, qwen3-vl)
    if (/qwen[^-]*-vl/i.test(model)) {
      return loadPrompt('tool_examples_qwen_vl.md');
    }
    // Match coder-model pattern (same as qwen3-coder)
    if (/coder-model/i.test(model)) {
      return loadPrompt('tool_examples_qwen_coder.md');
    }
    // Match vision-model pattern (same as qwen3-vl)
    if (/vision-model/i.test(model)) {
      return loadPrompt('tool_examples_qwen_vl.md');
    }
  }

  return loadPrompt('tool_examples_general.md');
}

/**
 * Generates a system reminder message about available subagents for the AI assistant.
 *
 * This function creates an internal system message that informs the AI about specialized
 * agents it can delegate tasks to. The reminder encourages proactive use of the TASK tool
 * when user requests match agent capabilities.
 *
 * @param agentTypes - Array of available agent type names (e.g., ['python', 'web', 'analysis'])
 * @returns A formatted system reminder string wrapped in XML tags for internal AI processing
 *
 * @example
 * ```typescript
 * const reminder = getSubagentSystemReminder(['python', 'web']);
 * // Returns: "<system-reminder>You have powerful specialized agents..."
 * ```
 */
export function getSubagentSystemReminder(agentTypes: string[]): string {
  return `<system-reminder>You have powerful specialized agents at your disposal, available agent types are: ${agentTypes.join(', ')}. PROACTIVELY use the ${ToolNames.TASK} tool to delegate user's task to appropriate agent when user's task matches agent capabilities. Ignore this message if user's task is not relevant to any agent. This message is for internal use only. Do not mention this to user in your response.</system-reminder>`;
}

/**
 * Generates a system reminder message for plan mode operation.
 *
 * This function creates an internal system message that enforces plan mode constraints,
 * preventing the AI from making any modifications to the system until the user confirms
 * the proposed plan. It overrides other instructions to ensure read-only behavior.
 *
 * @returns A formatted system reminder string that enforces plan mode restrictions
 *
 * @example
 * ```typescript
 * const reminder = getPlanModeSystemReminder();
 * // Returns: "<system-reminder>Plan mode is active..."
 * ```
 *
 * @remarks
 * Plan mode ensures the AI will:
 * - Only perform read-only operations (research, analysis)
 * - Present a comprehensive plan via ExitPlanMode tool
 * - Wait for user confirmation before making any changes
 * - Override any other instructions that would modify system state
 */
export function getPlanModeSystemReminder(): string {
  return `<system-reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received (for example, to make edits). Instead, you should:
1. Answer the user's query comprehensively
2. When you're done researching, present your plan by calling the ${ToolNames.EXIT_PLAN_MODE} tool, which will prompt the user to confirm the plan. Do NOT make any file changes or run any tools that modify the system state in any way until the user has confirmed the plan.
</system-reminder>`;
}

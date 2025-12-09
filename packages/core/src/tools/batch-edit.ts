/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import { BaseDeclarativeTool, Kind, ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import * as Diff from 'diff';
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import { ReadFileTool } from './read-file.js';
import { ToolNames } from './tool-names.js';
import { applyReplacement } from './edit.js';
import { IDEConnectionStatus } from '../ide/ide-client.js';
import { FileOperation } from '../telemetry/metrics.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';

export interface BatchEditParams {
  file_path: string;
  edits: Array < {
    old_string: string;
    new_string: string;
  }>;
}

class BatchEditToolInvocation
  implements ToolInvocation<BatchEditParams, ToolResult> {
  constructor(
    private readonly config: Config,
    public params: BatchEditParams,
  ) {}

  toolLocations(): ToolLocation[] {
    return [{ path: this.params.file_path }];
  }

  private async calculateBatchEdit(params: BatchEditParams): Promise < {
    currentContent: string | null;
    newContent: string;
    totalReplacements: number;
    error?: { display: string; raw: string; type: ToolErrorType };
  }> {
    let currentContent: string | null = null;
    try {
      currentContent = await this.config
        .getFileSystemService()
        .readTextFile(params.file_path);
      // Normalize line endings
      currentContent = currentContent.replace(/\r\n/g, '\n');
    } catch (err) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        return {
          currentContent: null,
          newContent: '',
          totalReplacements: 0,
          error: {
            display: `File not found: ${params.file_path}`,
            raw: `File not found: ${params.file_path}`,
            type: ToolErrorType.FILE_NOT_FOUND,
          },
        };
      }
      throw err;
    }

    let tempContent = currentContent;
    let totalReplacements = 0;

    for (const [index, edit] of params.edits.entries()) {
      const occurrences = this.countOccurrences(tempContent, edit.old_string);
      if (occurrences === 0) {
        return {
          currentContent,
          newContent: tempContent,
          totalReplacements,
          error: {
            display: `Edit #${index + 1} failed: could not find old_string.`,
            raw: `Edit #${index + 1} failed: old_string not found in file content. Ensure you include sufficient unique context. Old String: "${edit.old_string.substring(0, 50)}"...`,
            type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
          },
        };
      }
      // We only support single occurrence replacement per edit block in batch mode for safety/simplicity,
      // unless we want to implement 'expected_replacements' per block.
      // For now, let's assume global replacement is risky in batch without explicit counts.
      // But adhering to 'edit' tool logic: it replaces ALL occurrences.
      tempContent = applyReplacement(
        tempContent,
        edit.old_string,
        edit.new_string,
        false,
      );
      totalReplacements += occurrences;
    }

    return {
      currentContent,
      newContent: tempContent,
      totalReplacements,
    };
  }

  private countOccurrences(str: string, substr: string): number {
    if (substr === '') return 0;
    let count = 0;
    let pos = str.indexOf(substr);
    while (pos !== -1) {
      count++;
      pos = str.indexOf(substr, pos + substr.length);
    }
    return count;
  }

  async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    let editData;
    try {
      editData = await this.calculateBatchEdit(this.params);
    } catch (error) {
      console.log(`Error preparing batch edit: ${error}`);
      return false;
    }

    if (editData.error) {
      console.log(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(this.params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent ?? '',
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const ideClient = this.config.getIdeClient();
    const ideConfirmation =
      this.config.getIdeMode() &&
      ideClient?.getConnectionStatus().status === IDEConnectionStatus.Connected
        ? ideClient.openDiff(this.params.file_path, editData.newContent)
        : undefined;

    return {
      type: 'edit',
      title: `Confirm Batch Edit: ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))} (${this.params.edits.length} changes)`,
      fileName,
      filePath: this.params.file_path,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
      ideConfirmation,
    } as ToolEditConfirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    let editData;
    try {
      editData = await this.calculateBatchEdit(this.params);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing batch edit: ${errorMsg}`,
        returnDisplay: `Error preparing batch edit: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.EDIT_PREPARATION_FAILURE,
        },
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `Error: ${editData.error.display}`,
        error: {
          message: editData.error.raw,
          type: editData.error.type,
        },
      };
    }

    try {
      await this.config
        .getFileSystemService()
        .writeTextFile(this.params.file_path, editData.newContent);

      const fileName = path.basename(this.params.file_path);
      const diffStat = getDiffStat(
        fileName,
        editData.currentContent ?? '',
        editData.newContent, // simplified diff stat for batch
        editData.newContent,
      );

      const fileDiff = Diff.createPatch(
        fileName,
        editData.currentContent ?? '',
        editData.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );

      const lines = editData.newContent.split('\n').length;
      const mimetype = getSpecificMimeType(this.params.file_path);
      const extension = path.extname(this.params.file_path);
      const programming_language = getProgrammingLanguage({
        file_path: this.params.file_path,
      });

      logFileOperation(
        this.config,
        new FileOperationEvent(
          BatchEditTool.Name,
          FileOperation.UPDATE,
          lines,
          mimetype,
          extension,
          diffStat,
          programming_language,
        ),
      );

      return {
        llmContent: `Successfully applied ${this.params.edits.length} edits to ${this.params.file_path}.`,
        returnDisplay: {
          fileDiff,
          fileName,
          originalContent: editData.currentContent,
          newContent: editData.newContent,
          diffStat,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing batch edit: ${errorMsg}`,
        returnDisplay: `Error writing file: ${errorMsg}`,
        error: {
          message: errorMsg,
          type: ToolErrorType.FILE_WRITE_FAILURE,
        },
      };
    }
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.file_path,
      this.config.getTargetDir(),
    );
    return `Batch edit ${shortenPath(relativePath)} (${this.params.edits.length} changes)`;
  }
}

export class BatchEditTool extends BaseDeclarativeTool< 
  BatchEditParams,
  ToolResult
> {
  static readonly Name = ToolNames.BATCH_EDIT;

  constructor(private readonly config: Config) {
    super(
      BatchEditTool.Name,
      'BatchEdit',
      `Applies multiple text replacements to a single file in a single transaction. This is more efficient than calling '${ToolNames.EDIT}' multiple times.
      
      Expectation for required parameters:
      1. 	file_path	MUST be an absolute path.
      2. 	edits	is an array of replacement operations.
      3. Each edit in the array follows the same strict rules as the '${ToolNames.EDIT}' tool:
         - 	old_string	must be exact and unique.
         - 	new_string	is the replacement.
      
      Edits are applied sequentially in the order provided. If any edit fails (e.g., old_string not found), the entire batch operation fails and no changes are written to disk.`,
      Kind.Edit,
      {
        properties: {
          file_path: {
            description: "The absolute path to the file to modify.",
            type: "string",
          },
          edits: {
            type: "array",
            description: "A list of edits to apply sequentially.",
            items: {
              type: "object",
              properties: {
                old_string: {
                  description: "The exact literal text to replace.",
                  type: "string",
                },
                new_string: {
                  description: "The text to replace it with.",
                  type: "string",
                },
              },
              required: ["old_string", "new_string"],
            },
            minItems: 1,
          },
        },
        required: ["file_path", "edits"],
        type: "object",
      },
    );
  }

  protected validateToolParamValues(params: BatchEditParams): string | null {
    if (!params.file_path) return "file_path is required";
    if (!path.isAbsolute(params.file_path)) return "file_path must be absolute";
    if (!params.edits || params.edits.length === 0)
      return "edits array must not be empty";
    
    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(params.file_path)) {
       return `File path must be within the workspace.`;
    }

    return null;
  }

  protected createInvocation(
    params: BatchEditParams,
  ): ToolInvocation<BatchEditParams, ToolResult> {
    return new BatchEditToolInvocation(this.config, params);
  }
}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PartUnion } from '@google/genai';
import mime from 'mime-types';
import type { FileSystemService } from '../services/fileSystemService.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { BINARY_EXTENSIONS } from './ignorePatterns.js';

// Constants for text file processing
export const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;

// Default values for encoding and separator format
export const DEFAULT_ENCODING: BufferEncoding = 'utf-8';

/**
 * Looks up the specific MIME type for a file path.
 * @param filePath Path to the file.
 * @returns The specific MIME type string (e.g., 'text/python', 'application/javascript') or undefined if not found or ambiguous.
 */
export function getSpecificMimeType(filePath: string): string | undefined {
  const lookedUpMime = mime.lookup(filePath);
  return typeof lookedUpMime === 'string' ? lookedUpMime : undefined;
}

/**
 * Checks if a path is within a given root directory.
 * @param pathToCheck The absolute path to check.
 * @param rootDirectory The absolute root directory.
 * @returns True if the path is within the root directory, false otherwise.
 */
export function isWithinRoot(
  pathToCheck: string,
  rootDirectory: string,
): boolean {
  const normalizedPathToCheck = path.resolve(pathToCheck);
  const normalizedRootDirectory = path.resolve(rootDirectory);

  // Ensure the rootDirectory path ends with a separator for correct startsWith comparison,
  // unless it's the root path itself (e.g., '/' or 'C:\').
  const rootWithSeparator =
    normalizedRootDirectory === path.sep ||
    normalizedRootDirectory.endsWith(path.sep)
      ? normalizedRootDirectory
      : normalizedRootDirectory + path.sep;

  return (
    normalizedPathToCheck === normalizedRootDirectory ||
    normalizedPathToCheck.startsWith(rootWithSeparator)
  );
}

/**
 * Determines if a file is likely binary based on content sampling.
 * @param filePath Path to the file.
 * @returns Promise that resolves to true if the file appears to be binary.
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');

    // Read up to 4KB or file size, whichever is smaller
    const stats = await fileHandle.stat();
    const fileSize = stats.size;
    if (fileSize === 0) {
      // Empty file is not considered binary for content checking
      return false;
    }
    const bufferSize = Math.min(4096, fileSize);
    const buffer = Buffer.alloc(bufferSize);
    const result = await fileHandle.read(buffer, 0, buffer.length, 0);
    const bytesRead = result.bytesRead;

    if (bytesRead === 0) return false;

    let nonPrintableCount = 0;
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true; // Null byte is a strong indicator
      if (buffer[i] < 9 || (buffer[i] > 13 && buffer[i] < 32)) {
        nonPrintableCount++;
      }
    }
    // If >30% non-printable characters, consider it binary
    return nonPrintableCount / bytesRead > 0.3;
  } catch (error) {
    // Log error for debugging while maintaining existing behavior
    console.warn(
      `Failed to check if file is binary: ${filePath}`,
      error instanceof Error ? error.message : String(error),
    );
    // If any error occurs (e.g. file not found, permissions),
    // treat as not binary here; let higher-level functions handle existence/access errors.
    return false;
  } finally {
    // Safely close the file handle if it was successfully opened
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        // Log close errors for debugging while continuing with cleanup
        console.warn(
          `Failed to close file handle for: ${filePath}`,
          closeError instanceof Error ? closeError.message : String(closeError),
        );
        // The important thing is that we attempted to clean up
      }
    }
  }
}

/**
 * Detects the type of file based on extension and content.
 * @param filePath Path to the file.
 * @returns Promise that resolves to 'text', 'image', 'pdf', 'audio', 'video', 'binary' or 'svg'.
 */
export async function detectFileType(
  filePath: string,
): Promise<'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary' | 'svg'> {
  const ext = path.extname(filePath).toLowerCase();

  // The mimetype for various TypeScript extensions (ts, mts, cts, tsx) can be
  // MPEG transport stream (a video format), but we want to assume these are
  // TypeScript files instead.
  if (['.ts', '.mts', '.cts'].includes(ext)) {
    return 'text';
  }

  if (ext === '.svg') {
    return 'svg';
  }

  const lookedUpMimeType = mime.lookup(filePath); // Returns false if not found, or the mime type string
  if (lookedUpMimeType) {
    if (lookedUpMimeType.startsWith('image/')) {
      return 'image';
    }
    if (lookedUpMimeType.startsWith('audio/')) {
      return 'audio';
    }
    if (lookedUpMimeType.startsWith('video/')) {
      return 'video';
    }
    if (lookedUpMimeType === 'application/pdf') {
      return 'pdf';
    }
  }

  // Stricter binary check for common non-text extensions before content check
  // These are often not well-covered by mime-types or might be misidentified.
  if (BINARY_EXTENSIONS.includes(ext)) {
    return 'binary';
  }

  // Fall back to content-based check if mime type wasn't conclusive for image/pdf
  // and it's not a known binary extension.
  if (await isBinaryFile(filePath)) {
    return 'binary';
  }

  return 'text';
}

export interface ProcessedFileReadResult {
  llmContent: PartUnion; // string for text, Part for image/pdf/unreadable binary
  returnDisplay: string;
  error?: string; // Optional error message for the LLM if file processing failed
  errorType?: ToolErrorType; // Structured error type
  isTruncated?: boolean; // For text files, indicates if content was truncated
  originalLineCount?: number; // For text files
  linesShown?: [number, number]; // For text files [startLine, endLine] (1-based for display)
}

/**
 * Reads and processes a single file, handling text, images, and PDFs.
 * @param filePath Absolute path to the file.
 * @param rootDirectory Absolute path to the project root for relative path display.
 * @param offset Optional offset for text files (0-based line number).
 * @param limit Optional limit for text files (number of lines to read).
 * @returns ProcessedFileReadResult object.
 */
export async function processSingleFileContent(
  filePath: string,
  rootDirectory: string,
  fileSystemService: FileSystemService,
  offset?: number,
  limit?: number,
  ranges?: Array<[number, number]>, // new parameter
): Promise<ProcessedFileReadResult> {
  try {
    if (!fs.existsSync(filePath)) {
      // Sync check is acceptable before async read
      return {
        llmContent:
          'Could not read file because no file was found at the specified path.',
        returnDisplay: 'File not found.',
        error: `File not found: ${filePath}`,
        errorType: ToolErrorType.FILE_NOT_FOUND,
      };
    }
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return {
        llmContent:
          'Could not read file because the provided path is a directory, not a file.',
        returnDisplay: 'Path is a directory.',
        error: `Path is a directory, not a file: ${filePath}`,
        errorType: ToolErrorType.TARGET_IS_DIRECTORY,
      };
    }

    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > 20) {
      return {
        llmContent: 'File size exceeds the 20MB limit.',
        returnDisplay: 'File size exceeds the 20MB limit.',
        error: `File size exceeds the 20MB limit: ${filePath} (${fileSizeInMB.toFixed(2)}MB)`,
        errorType: ToolErrorType.FILE_TOO_LARGE,
      };
    }

    const fileType = await detectFileType(filePath);
    const relativePathForDisplay = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');

    switch (fileType) {
      case 'binary': {
        return {
          llmContent: `Cannot display content of binary file: ${relativePathForDisplay}`,
          returnDisplay: `Skipped binary file: ${relativePathForDisplay}`,
        };
      }
      case 'svg': {
        const SVG_MAX_SIZE_BYTES = 1 * 1024 * 1024;
        if (stats.size > SVG_MAX_SIZE_BYTES) {
          return {
            llmContent: `Cannot display content of SVG file larger than 1MB: ${relativePathForDisplay}`,
            returnDisplay: `Skipped large SVG file (>1MB): ${relativePathForDisplay}`,
          };
        }
        const content = await fileSystemService.readTextFile(filePath);
        return {
          llmContent: content,
          returnDisplay: `Read SVG as text: ${relativePathForDisplay}`,
        };
      }
      case 'text': {
        const content = await fileSystemService.readTextFile(filePath);
        const lines = content.split('\n');
        const originalLineCount = lines.length;
        let selectedLines: string[] = [];
        let returnDisplay = '';
        let isTruncated = false;
        let linesShown: [number, number] = [0, 0]; // dummy default

        if (ranges && ranges.length > 0) {
           // Handle disjoint ranges
           const contentParts: string[] = [];
           const displayRanges: string[] = [];
           
           for (const [start, end] of ranges) {
              const actualStart = Math.max(0, start); // 0-based index
              const actualEnd = Math.min(end, originalLineCount); // Exclusive or inclusive depending on interpretation? 
              // Assuming ranges are [start, end) or [start, end]?
              // Usually ranges are 1-based inclusive for users but 0-based for slice.
              // Let's assume input `ranges` are 0-based [start, end_inclusive] logic similar to offset/limit?
              // Wait, offset/limit used slice(start, end) where end is start+limit.
              // Let's assume the caller passes 0-based START and 0-based END (exclusive) to match slice?
              // OR 1-based line numbers? The caller (ReadFileTool) will handle parsing.
              // Let's define the contract: ranges contains 0-based [start_index, end_index_exclusive).
              
              const slice = lines.slice(actualStart, actualEnd);
              if (slice.length > 0) {
                contentParts.push(slice.join('\n'));
                displayRanges.push(`${actualStart + 1}-${actualEnd}`);
              }
           }
           
           if (contentParts.length === 0) {
              // Fallback if no valid ranges
              returnDisplay = `Read 0 lines (invalid ranges) from ${relativePathForDisplay}`;
           } else {
              // Join with visual separator
              const separator = `\n... [Skipped lines] ...\n`;
              selectedLines = [contentParts.join(separator)];
              // We don't split again, selectedLines is just an array of the final text block(s) 
              // but existing logic expects array of lines.
              // Actually existing logic: formattedLines = selectedLines.map...
              // So we should reconstruct the "lines" array if we want line length check?
              // Or just join it all?
              // The logic below expects `selectedLines` to be array of strings (lines).
              // If we want to support the "separator", we can't easily fit it into "selectedLines" array of lines 
              // without breaking line-by-line processing unless we treat the separator as a line.
              
              // Simpler approach: Flatten ranges into selectedLines, inserting separator lines.
              selectedLines = [];
              ranges.sort((a, b) => a[0] - b[0]); // Ensure sorted
              
              let lastEnd = 0;
              for (const [start, end] of ranges) {
                 const actualStart = Math.max(0, start);
                 const actualEnd = Math.min(end, originalLineCount);
                 
                 if (actualStart > lastEnd && selectedLines.length > 0) {
                     selectedLines.push('... [Skipped lines] ...');
                 }
                 
                 const slice = lines.slice(actualStart, actualEnd);
                 selectedLines.push(...slice);
                 lastEnd = actualEnd;
              }
              
              returnDisplay = `Read disjoint ranges (${displayRanges.join(', ')}) from ${relativePathForDisplay}`;
              isTruncated = true; // By definition ranges imply truncation unless covering whole file
           }
        } else {
            // Original offset/limit logic
            const startLine = offset || 0;
            const effectiveLimit =
              limit === undefined ? DEFAULT_MAX_LINES_TEXT_FILE : limit;
            const endLine = Math.min(startLine + effectiveLimit, originalLineCount);
            const actualStartLine = Math.min(startLine, originalLineCount);
            selectedLines = lines.slice(actualStartLine, endLine);
            
            const contentRangeTruncated =
              startLine > 0 || endLine < originalLineCount;
            
            isTruncated = contentRangeTruncated;
            linesShown = [actualStartLine + 1, endLine];

            if (contentRangeTruncated) {
              returnDisplay = `Read lines ${
                actualStartLine + 1
              }-${endLine} of ${originalLineCount} from ${relativePathForDisplay}`;
            }
        }

        let linesWereTruncatedInLength = false;
        const formattedLines = selectedLines.map((line) => {
          if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
            linesWereTruncatedInLength = true;
            return (
              line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + '... [truncated]'
            );
          }
          return line;
        });

        if (linesWereTruncatedInLength) {
            isTruncated = true;
            if (!returnDisplay) {
               returnDisplay = `Read all ${originalLineCount} lines from ${relativePathForDisplay} (some lines were shortened)`;
            } else {
               returnDisplay += ' (some lines were shortened)';
            }
        }

        const llmContent = formattedLines.join('\n');

        return {
          llmContent,
          returnDisplay,
          isTruncated,
          originalLineCount,
          linesShown,
        };
      }
      case 'image':
      case 'pdf':
      case 'audio':
      case 'video': {
        const contentBuffer = await fs.promises.readFile(filePath);
        const base64Data = contentBuffer.toString('base64');
        return {
          llmContent: {
            inlineData: {
              data: base64Data,
              mimeType: mime.lookup(filePath) || 'application/octet-stream',
            },
          },
          returnDisplay: `Read ${fileType} file: ${relativePathForDisplay}`,
        };
      }
      default: {
        // Should not happen with current detectFileType logic
        const exhaustiveCheck: never = fileType;
        return {
          llmContent: `Unhandled file type: ${exhaustiveCheck}`,
          returnDisplay: `Skipped unhandled file type: ${relativePathForDisplay}`,
          error: `Unhandled file type for ${filePath}`,
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const displayPath = path
      .relative(rootDirectory, filePath)
      .replace(/\\/g, '/');
    return {
      llmContent: `Error reading file ${displayPath}: ${errorMessage}`,
      returnDisplay: `Error reading file ${displayPath}: ${errorMessage}`,
      error: `Error reading file ${filePath}: ${errorMessage}`,
      errorType: ToolErrorType.READ_CONTENT_FAILURE,
    };
  }
}

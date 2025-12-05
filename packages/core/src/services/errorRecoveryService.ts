// packages/core/src/services/errorRecoveryService.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { ContextState } from '../subagents/subagent.js';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  COMPILATION = 'compilation',
  DEPENDENCY = 'dependency',
  GIT = 'git',
  TESTING = 'testing',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

export interface ErrorAnalysis {
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  timestamp: Date;
  recoverable: boolean;
  suggestedActions: string[];
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  applicableErrors: ErrorCategory[];
  execute: (error: ErrorAnalysis, context: ContextState) => Promise<boolean>;
}

export class ErrorRecoveryService {
  private readonly recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private readonly errorHistory: ErrorAnalysis[] = [];
  private readonly maxHistorySize = 100;

  constructor(private readonly config: Config) {
    this.initializeDefaultStrategies();
  }

  /**
   * Analyzes an error and determines recovery options
   */
  analyzeError(error: Error, context: Record<string, unknown> = {}): ErrorAnalysis {
    const analysis: ErrorAnalysis = {
      severity: this.determineSeverity(error),
      category: this.categorizeError(error),
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date(),
      recoverable: this.isRecoverable(error),
      suggestedActions: this.generateSuggestedActions(error)
    };

    this.addToHistory(analysis);
    return analysis;
  }

  /**
   * Attempts to recover from an error using appropriate strategies
   */
  async attemptRecovery(error: ErrorAnalysis, context: ContextState): Promise<boolean> {
    const applicableStrategies = Array.from(this.recoveryStrategies.values())
      .filter(strategy => strategy.applicableErrors.includes(error.category));

    for (const strategy of applicableStrategies) {
      try {
        console.log(`Attempting recovery strategy: ${strategy.name}`);
        const success = await strategy.execute(error, context);
        if (success) {
          console.log(`Recovery successful using strategy: ${strategy.name}`);
          return true;
        }
      } catch (recoveryError) {
        console.warn(`Recovery strategy ${strategy.name} failed:`, recoveryError);
        continue;
      }
    }

    return false;
  }

  /**
   * Registers a new recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(strategy.name, strategy);
  }

  /**
   * Gets error recovery statistics
   */
  getRecoveryStats(): {
    totalErrors: number;
    recoveryRate: number;
    commonCategories: Record<ErrorCategory, number>;
  } {
    const totalErrors = this.errorHistory.length;
    const recoveredErrors = this.errorHistory.filter(e => e.recoverable).length;
    const recoveryRate = totalErrors > 0 ? recoveredErrors / totalErrors : 0;

    const categoryCounts: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
    for (const error of this.errorHistory) {
      categoryCounts[error.category] = (categoryCounts[error.category] || 0) + 1;
    }

    return {
      totalErrors,
      recoveryRate,
      commonCategories: categoryCounts
    };
  }

  private determineSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();

    if (message.includes('permission denied') || message.includes('access denied')) {
      return ErrorSeverity.CRITICAL;
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ErrorSeverity.HIGH;
    }
    if (message.includes('not found') || message.includes('missing') || message.includes('undefined')) {
      return ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.LOW;
  }

  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('network') || message.includes('fetch') || message.includes('http')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('file') || message.includes('directory') || message.includes('path')) {
      return ErrorCategory.FILESYSTEM;
    }
    if (message.includes('compilation') || message.includes('syntax') || message.includes('typescript')) {
      return ErrorCategory.COMPILATION;
    }
    if (message.includes('dependency') || message.includes('package') || message.includes('module')) {
      return ErrorCategory.DEPENDENCY;
    }
    if (message.includes('git') || message.includes('commit') || message.includes('branch')) {
      return ErrorCategory.GIT;
    }
    if (message.includes('test') || message.includes('spec') || message.includes('assertion')) {
      return ErrorCategory.TESTING;
    }
    if (message.includes('validation') || message.includes('schema') || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  private isRecoverable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Network errors are often recoverable
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return true;
    }

    // File not found might be recoverable with different paths
    if (message.includes('not found') && message.includes('file')) {
      return true;
    }

    // Dependency issues might be recoverable with installation
    if (message.includes('cannot find module') || message.includes('missing dependency')) {
      return true;
    }

    return false;
  }

  private generateSuggestedActions(error: Error): string[] {
    const actions: string[] = [];
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('timeout')) {
      actions.push('Retry the operation');
      actions.push('Check network connectivity');
    }

    if (message.includes('file') && message.includes('not found')) {
      actions.push('Verify file path exists');
      actions.push('Check file permissions');
    }

    if (message.includes('cannot find module')) {
      actions.push('Run dependency installation');
      actions.push('Check package.json for missing dependencies');
    }

    if (message.includes('permission denied')) {
      actions.push('Check file/directory permissions');
      actions.push('Run with elevated privileges if necessary');
    }

    return actions.length > 0 ? actions : ['Review error details and try alternative approach'];
  }

  private initializeDefaultStrategies(): void {
    // Network retry strategy
    this.registerStrategy({
      name: 'network-retry',
      description: 'Retry network operations with exponential backoff',
      applicableErrors: [ErrorCategory.NETWORK],
      execute: async (error, context) => {
        // Implementation would include retry logic with backoff
        console.log('Implementing network retry strategy');
        return false; // Placeholder
      }
    });

    // Dependency installation strategy
    this.registerStrategy({
      name: 'dependency-install',
      description: 'Attempt to install missing dependencies',
      applicableErrors: [ErrorCategory.DEPENDENCY],
      execute: async (error, context) => {
        // Implementation would run package manager install
        console.log('Implementing dependency installation strategy');
        return false; // Placeholder
      }
    });

    // File permission fix strategy
    this.registerStrategy({
      name: 'permission-fix',
      description: 'Attempt to fix file permission issues',
      applicableErrors: [ErrorCategory.FILESYSTEM],
      execute: async (error, context) => {
        // Implementation would check and fix permissions
        console.log('Implementing permission fix strategy');
        return false; // Placeholder
      }
    });
  }

  private addToHistory(analysis: ErrorAnalysis): void {
    this.errorHistory.push(analysis);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }
}</content>
<parameter name="filePath">d:\kolosal-cli-1\packages\core\src\services\errorRecoveryService.ts
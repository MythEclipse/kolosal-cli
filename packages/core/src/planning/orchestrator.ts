// packages/core/src/planning/orchestrator.ts

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import { ContextState } from '../subagents/subagent.js';
import type { ExecutionPlan } from './types.js';
import { SubagentTerminateMode } from '../subagents/types.js';

/**
 * The Orchestrator is the central component responsible for taking a high-level
 * user prompt, generating a detailed execution plan using a Planner subagent,
 * and then systematically executing that plan.
 */
export class Orchestrator {
  private readonly subagentManager: SubagentManager;
  private readonly globalContext: ContextState;

  constructor(private readonly config: Config) {
    this.subagentManager = new SubagentManager(config);
    this.globalContext = new ContextState();
  }

  /**
   * Executes a high-level task based on the user's prompt.
   *
   * @param userPrompt The high-level instruction from the user.
   * @returns A promise that resolves when the task is completed, or rejects if an error occurs.
   */
  async executeTask(userPrompt: string): Promise<string> {
    console.log('Orchestrator received task:', userPrompt);

    // Set the initial user prompt in the global context
    this.globalContext.set('user_prompt', userPrompt);

    // Step 1: Generate the execution plan using the Planner subagent
    const plan = await this.generatePlan(userPrompt);
    console.log('Generated Plan:', JSON.stringify(plan, null, 2));

    // Step 2: Execute the generated plan
    const result = await this.executePlan(plan);
    console.log('Plan execution completed. Final Result:', result);

    return result;
  }

  /**
   * Invokes a specialized Planner subagent to generate a detailed execution plan.
   *
   * @param userPrompt The user's initial prompt.
   * @returns A promise that resolves with the generated `ExecutionPlan`.
   */
  private async generatePlan(userPrompt: string): Promise<ExecutionPlan> {
    const plannerSubagentConfig = await this.subagentManager.loadSubagent('Planner', 'builtin');
    if (!plannerSubagentConfig) {
      throw new Error('Planner subagent not found. Please ensure planner.md is correctly configured.');
    }

    const plannerScope = await this.subagentManager.createSubagentScope(
      plannerSubagentConfig,
      this.config,
    );

    // Pass the user prompt to the Planner subagent via its context
    const plannerContext = new ContextState();
    plannerContext.set('user_prompt', userPrompt);

    await plannerScope.runNonInteractive(plannerContext);

    const planJsonString = plannerScope.getFinalText();
    try {
      const plan = JSON.parse(planJsonString) as ExecutionPlan;
      // Basic validation for the plan structure
      if (!plan.plan_id || !plan.goal || !Array.isArray(plan.steps)) {
        throw new Error('Invalid plan structure received from Planner subagent.');
      }
      return plan;
    } catch (error) {
      console.error('Failed to parse plan from Planner subagent:', planJsonString, error);
      throw new Error(`Failed to parse plan from Planner subagent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Executes the given `ExecutionPlan` step-by-step.
   *
   * @param plan The detailed execution plan.
   * @returns A promise that resolves with the final output of the plan.
   */
  private async executePlan(plan: ExecutionPlan): Promise<string> {
    console.log('Executing plan...');
    if (plan.steps.length === 0) {
      console.log('Plan is empty. Returning.');
      return 'No steps to execute in the plan.';
    }
    const completedSteps = new Set<string>();
    let roundsWithoutProgress = 0; // Track progress to detect deadlocks

    while (completedSteps.size < plan.steps.length) {
      let executedThisRound = false;
      for (const step of plan.steps) {
        if (completedSteps.has(step.id)) {
          continue;
        }

        const allDependenciesMet =
          !step.dependencies ||
          step.dependencies.every((dep) => completedSteps.has(dep));

        if (allDependenciesMet) {
          console.log(`Executing step: ${step.id} - ${step.description}`);
          let stepOutput: Record<string, unknown> | undefined;

          try {
            // Resolve templated arguments using current global context
            const resolvedArgs = this.resolveTemplatedArguments(step.args || {});

            switch (step.type) {
              case 'run_tool': {
                const toolRegistry = this.config.getToolRegistry();
                const tool = toolRegistry.getTool(step.name);
                if (!tool) {
                  throw new Error(`Tool "${step.name}" not found.`);
                }
                const invocation = tool.build(resolvedArgs);
                const toolResult = await invocation.execute(new AbortController().signal);
                if (toolResult.error) {
                  throw new Error(`Tool "${step.name}" failed: ${toolResult.error.message}`);
                }
                stepOutput = { tool_output: toolResult.llmContent };
                if (toolResult.returnDisplay && toolResult.returnDisplay !== toolResult.llmContent) {
                  stepOutput['tool_display_output'] = toolResult.returnDisplay;
                }
                break;
              }
              case 'run_subagent': {
                const subagentConfig = await this.subagentManager.loadSubagent(step.name);
                if (!subagentConfig) {
                  throw new Error(`Subagent "${step.name}" not found.`);
                }
                const subagentScope = await this.subagentManager.createSubagentScope(subagentConfig, this.config);
                const subagentContext = new ContextState();
                for (const key in resolvedArgs) {
                  subagentContext.set(key, resolvedArgs[key]);
                }
                await subagentScope.runNonInteractive(subagentContext);
                if (subagentScope.getTerminateMode() === SubagentTerminateMode.ERROR) {
                  throw new Error(`Subagent "${step.name}" terminated with an error.`);
                }
                stepOutput = { subagent_output: subagentScope.getFinalText() };
                break;
              }
              case 'process_data':
                // For 'process_data' steps, we expect the planner to instruct specific
                // logic or external tools. For now, a simple concatenation.
                if (step.name === 'Finalize output') {
                  const originalPrompt = (resolvedArgs['original_prompt'] as string) || '';
                  const summaryText = (resolvedArgs['summary_text'] as string) || '';
                  stepOutput = { final_answer: `Original Request: "${originalPrompt}"\nSummary: "${summaryText}"` };
                } else {
                   console.warn(`'process_data' step with name '${step.name}' not specifically handled. Returning args as output.`);
                   stepOutput = { processed_data: resolvedArgs };
                }
                break;
              case 'user_interaction':
                // For a "full auto" agent, this might involve logging a message or defaulting to a response.
                console.log(`  -> User interaction step: ${step.name}. This step would typically involve user input.`);
                stepOutput = { user_input_response: 'Simulated user confirmation.' }; // Placeholder
                break;
              default:
                throw new Error(`Unknown step type: ${step.type}`);
            }

            // Update global context with produced variables
            if (stepOutput && step.produces) {
              for (const outputKey in step.produces) {
                const contextVarName = step.produces[outputKey];
                if (stepOutput[outputKey] !== undefined) {
                  this.globalContext.set(contextVarName, stepOutput[outputKey]);
                  console.log(`    -> Context updated: ${contextVarName} =`, stepOutput[outputKey]);
                }
              }
            }

            completedSteps.add(step.id);
            executedThisRound = true;
          } catch (error) {
            console.error(`Error executing step "${step.id} - ${step.description}":`, error);
            throw new Error(`Execution failed at step "${step.id}": ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      if (!executedThisRound) {
        roundsWithoutProgress++;
        if (roundsWithoutProgress > plan.steps.length) { // If no progress for a full cycle, it's a deadlock or bad plan
          throw new Error('Plan execution stalled: no steps could be executed due to unmet dependencies or invalid plan structure.');
        }
      } else {
        roundsWithoutProgress = 0; // Reset counter if progress was made
      }
    }

    // Return final answer or summary from context
    const finalAnswer = this.globalContext.get('final_answer');
    if (finalAnswer) {
      return String(finalAnswer);
    }
    
    // If no specific final_answer was produced, return a generic success message.
    // This ensures all code paths explicitly return a string.
    return 'Plan executed successfully. All steps completed.';
  }

  /**
   * Resolves templated arguments using the current global context.
   * Arguments can be in the format `context.get('key')`.
   */
  private resolveTemplatedArguments(args: Record<string, unknown>): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const key in args) {
      if (typeof args[key] === 'string') {
        let argString = args[key] as string;
        // Replace all occurrences of context.get('key') with the actual value from globalContext
        argString = argString.replace(/context\.get\('([^']+)'\)/g, (match, contextKey) => {
          const value = this.globalContext.get(contextKey);
          return value !== undefined ? String(value) : match; // If not found, keep the original template part
        });
        resolved[key] = argString;
      } else {
        resolved[key] = args[key];
      }
    }
    return resolved;
  }
}

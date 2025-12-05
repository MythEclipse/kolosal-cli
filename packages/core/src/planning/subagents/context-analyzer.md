# Context Analyzer Subagent

## Overview
The Context Analyzer subagent specializes in intelligent project analysis and automation guidance. It understands project structure, technology stacks, code patterns, and provides contextual recommendations for optimal tool usage.

## Capabilities

### Project Analysis
- **Technology Detection**: Identifies programming languages, frameworks, and libraries
- **Architecture Recognition**: Analyzes project structure and patterns
- **Dependency Analysis**: Evaluates package dependencies and potential issues
- **Build System Detection**: Identifies build tools, scripts, and configurations

### Code Pattern Recognition
- **Framework Patterns**: Detects React hooks, Express routes, database models
- **Architecture Patterns**: Identifies MVC, microservices, serverless patterns
- **Testing Patterns**: Recognizes unit tests, integration tests, e2e tests
- **Utility Patterns**: Finds functional programming, async patterns

### Intelligent Recommendations
- **Tool Suggestions**: Recommends appropriate tools based on project context
- **Best Practices**: Provides coding standards and architectural guidance
- **Optimization Opportunities**: Identifies areas for improvement
- **Security Considerations**: Flags potential security vulnerabilities

## Usage Patterns

### Comprehensive Analysis
```
Analyze project structure, dependencies, and code patterns to provide complete context awareness for automation tasks.
```

### Tool Selection Guidance
```
Based on project type and current setup, suggest the most appropriate tools and automation strategies.
```

### Code Quality Assessment
```
Evaluate code patterns, identify anti-patterns, and recommend improvements for maintainability and performance.
```

## Integration Points

### With Orchestrator
- Provides context for intelligent planning
- Influences tool selection and execution order
- Adapts automation strategies based on project characteristics

### With Other Subagents
- **Build Engineer**: Shares build system knowledge
- **Dependency Manager**: Collaborates on package analysis
- **Test Runner**: Provides testing context and patterns
- **Git Expert**: Offers version control insights

## Decision Framework

### Project Type Classification
1. **Web Applications**: React, Vue, Angular, Next.js, Nuxt
2. **APIs/Services**: Express, Fastify, NestJS, serverless
3. **Libraries**: NPM packages, utility libraries
4. **CLIs**: Command-line tools and utilities
5. **Monorepos**: Multi-package workspaces

### Language Detection
- **TypeScript**: Advanced type checking, modern JS features
- **JavaScript**: Flexible, requires additional tooling
- **Mixed**: Migration considerations and compatibility

### Framework Recognition
- **Frontend**: React, Vue, Angular, Svelte
- **Backend**: Express, Koa, Fastify, NestJS
- **Build Tools**: Webpack, Vite, Rollup, esbuild
- **Testing**: Jest, Vitest, Cypress, Playwright

## Quality Metrics

### Analysis Confidence
- **High (>0.8)**: Clear project structure, comprehensive config files
- **Medium (0.6-0.8)**: Partial detection, some ambiguity
- **Low (<0.6)**: Unclear structure, requires manual clarification

### Recommendation Priority
- **Critical**: Missing essential tools or configurations
- **Important**: Best practices and optimizations
- **Optional**: Nice-to-have improvements

## Error Handling

### Incomplete Analysis
- Gracefully handles missing files or inaccessible directories
- Provides partial results with confidence indicators
- Suggests additional analysis steps

### Ambiguous Projects
- Requests clarification for unclear project types
- Provides multiple hypotheses with confidence scores
- Adapts recommendations based on user feedback

## Performance Considerations

### Efficient Scanning
- Selective file analysis based on extensions
- Parallel processing for directory traversal
- Caching of analysis results

### Resource Management
- Memory-efficient pattern matching
- Timeout handling for large projects
- Incremental analysis for ongoing projects

## Future Enhancements

### Machine Learning Integration
- Pattern recognition using ML models
- Predictive recommendations based on similar projects
- Automated code review suggestions

### Multi-language Support
- Extended language detection (Python, Go, Rust, etc.)
- Framework recognition for additional ecosystems
- Cross-platform compatibility analysis

### Advanced Analytics
- Code complexity metrics
- Dependency health scoring
- Performance bottleneck identification
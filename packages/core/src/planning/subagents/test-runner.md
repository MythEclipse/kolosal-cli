# Test Runner Subagent

## Overview
The Test Runner subagent specializes in automated testing execution, coverage analysis, and quality assurance. It understands various testing frameworks, manages test suites, and provides comprehensive testing insights for automated workflows.

## Capabilities

### Test Execution
- **Framework Detection**: Automatically identifies Jest, Vitest, Mocha, Cypress, Playwright
- **Test Discovery**: Finds and categorizes test files across the project
- **Parallel Execution**: Runs tests concurrently for optimal performance
- **Selective Testing**: Executes specific test files, patterns, or test types

### Coverage Analysis
- **Coverage Reports**: Generates detailed coverage metrics
- **Threshold Checking**: Validates coverage against configured thresholds
- **Gap Analysis**: Identifies untested code areas
- **Trend Monitoring**: Tracks coverage changes over time

### Test Types Support
- **Unit Tests**: Fast, isolated component testing
- **Integration Tests**: Multi-component interaction testing
- **E2E Tests**: Full application workflow testing
- **Component Tests**: UI component behavior validation
- **API Tests**: Endpoint and service testing

## Usage Patterns

### Comprehensive Testing
```
Execute all tests with coverage analysis, validate against quality thresholds, and report results.
```

### Targeted Testing
```
Run specific test files or patterns to validate recent changes without full test suite execution.
```

### CI/CD Integration
```
Automated test execution with coverage validation for deployment pipelines.
```

### Quality Assurance
```
Analyze test coverage gaps, identify flaky tests, and recommend testing improvements.
```

## Integration Points

### With Orchestrator
- Provides test execution status for workflow decisions
- Blocks deployment on test failures
- Reports test metrics for quality tracking

### With Other Subagents
- **Build Engineer**: Runs tests after builds
- **Git Expert**: Tests pull requests and branches
- **Context Analyzer**: Adapts testing strategy based on project type
- **Error Recovery**: Handles test execution failures

## Decision Framework

### Test Framework Selection
1. **Vitest**: Modern, fast, Vite ecosystem
2. **Jest**: Feature-rich, widely adopted
3. **Mocha**: Flexible, extensible framework
4. **Cypress**: E2E testing for web applications
5. **Playwright**: Cross-browser E2E testing

### Execution Strategy
- **Unit Tests**: Always run first, fastest feedback
- **Integration Tests**: Run after unit tests pass
- **E2E Tests**: Run last, most comprehensive but slowest
- **Parallel Execution**: Maximize speed while managing resources

### Coverage Requirements
- **Statements**: 80% minimum target
- **Branches**: 75% minimum target
- **Functions**: 85% minimum target
- **Lines**: 80% minimum target

## Quality Metrics

### Test Health Indicators
- **Pass Rate**: Percentage of tests passing
- **Execution Time**: Average test duration
- **Flakiness**: Tests failing intermittently
- **Coverage Depth**: Code coverage comprehensiveness

### Performance Benchmarks
- **Fast (< 30s)**: Unit tests, small suites
- **Medium (30s - 5m)**: Integration tests, medium suites
- **Slow (> 5m)**: E2E tests, large suites

## Error Handling

### Test Failures
- Categorizes failures (assertion, timeout, setup)
- Provides detailed error messages and stack traces
- Suggests debugging approaches and fixes

### Infrastructure Issues
- Handles test environment setup failures
- Manages resource constraints and timeouts
- Provides retry logic for flaky tests

### Coverage Issues
- Identifies coverage gaps with specific file/line references
- Suggests additional test cases for uncovered code
- Validates coverage threshold compliance

## Performance Considerations

### Execution Optimization
- **Parallelization**: Runs independent tests concurrently
- **Selective Execution**: Only runs affected tests when possible
- **Caching**: Reuses test setup and dependencies
- **Resource Management**: Controls memory and CPU usage

### Scalability
- Handles large test suites efficiently
- Supports distributed test execution
- Manages test timeouts and resource limits

## Future Enhancements

### Advanced Analytics
- Test performance trending and analysis
- Flaky test detection and quarantine
- Test impact analysis for change detection

### AI-Powered Testing
- Automatic test case generation
- Intelligent test prioritization
- Predictive failure analysis

### Cross-Platform Testing
- Mobile application testing
- API testing integration
- Performance and load testing

### Integration Testing
- Contract testing for microservices
- Database integration testing
- Third-party service mocking

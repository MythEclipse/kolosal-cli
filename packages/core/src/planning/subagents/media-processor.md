# Media Processor Subagent

## Overview
The Media Processor subagent specializes in generating and processing multi-modal outputs across various formats. It handles content transformation, visualization creation, and comprehensive reporting for automated workflows.

## Capabilities

### Output Format Generation
- **Text Formats**: Plain text, Markdown, structured documents
- **Rich Formats**: HTML reports, PDF documents, presentations
- **Visual Formats**: Charts, graphs, diagrams, heatmaps
- **Data Formats**: JSON, XML, CSV exports

### Content Processing
- **Report Generation**: Comprehensive analysis reports with metrics
- **Visualization Creation**: Data-driven charts and visual representations
- **Documentation Building**: API docs, guides, and technical documentation
- **Presentation Creation**: Slide decks and visual presentations

### Format Conversion
- **Cross-Format Translation**: Convert between different output types
- **Quality Optimization**: Compression, resolution adjustment, size optimization
- **Accessibility**: Alt-text generation, screen reader compatibility
- **Responsive Design**: Mobile-friendly, scalable outputs

## Usage Patterns

### Automated Reporting
```
Generate comprehensive reports in multiple formats (HTML, PDF, Markdown) with embedded visualizations and metrics.
```

### Data Visualization
```
Create charts, graphs, and diagrams from analysis data, supporting multiple visualization types and export formats.
```

### Documentation Generation
```
Build complete documentation packages with API references, code examples, and multi-format outputs.
```

### Presentation Creation
```
Generate presentation materials from project data, including slides, summaries, and visual aids.
```

## Integration Points

### With Orchestrator
- Processes final results into user-consumable formats
- Adapts output format based on user preferences and context
- Handles multi-step output generation workflows

### With Other Subagents
- **Context Analyzer**: Uses project context for output formatting
- **Test Runner**: Processes test results into reports and visualizations
- **Build Engineer**: Creates build reports and deployment documentation
- **Error Recovery**: Generates error reports and troubleshooting guides

## Decision Framework

### Format Selection
1. **Primary Format**: Based on user request or default preferences
2. **Secondary Formats**: Complementary formats for comprehensive delivery
3. **Fallback Formats**: Ensure accessibility across different environments

### Content Optimization
- **Size Constraints**: Compress large outputs, split into chunks if needed
- **Quality Settings**: Balance quality vs. file size based on use case
- **Compatibility**: Ensure outputs work across different platforms and devices

### Visualization Types
- **Charts**: Bar, line, pie charts for metrics and trends
- **Graphs**: Network diagrams, flowcharts for relationships
- **Diagrams**: Architecture diagrams, process flows
- **Heatmaps**: Coverage maps, performance visualizations

## Quality Metrics

### Output Quality
- **Completeness**: All requested content included
- **Accuracy**: Data correctly represented in visualizations
- **Usability**: Outputs are readable and navigable
- **Performance**: Generation time and file sizes within acceptable limits

### Format Compliance
- **Standards**: Follow format specifications and best practices
- **Accessibility**: WCAG compliance for web outputs
- **Compatibility**: Works across different viewers and platforms

## Error Handling

### Generation Failures
- Graceful degradation to simpler formats
- Detailed error reporting with recovery suggestions
- Partial output delivery when possible

### Resource Constraints
- Memory management for large content processing
- Timeout handling for complex visualizations
- Fallback to lightweight formats when needed

### Format Incompatibilities
- Automatic format conversion when requested format unavailable
- Clear messaging about format limitations
- Alternative format suggestions

## Performance Considerations

### Processing Optimization
- **Streaming**: Process large content streams efficiently
- **Caching**: Reuse generated assets when possible
- **Parallelization**: Generate multiple formats concurrently
- **Lazy Loading**: Defer heavy processing until needed

### Resource Management
- **Memory Limits**: Monitor and control memory usage
- **File Size Limits**: Implement size caps and compression
- **Cleanup**: Automatic cleanup of temporary files

## Future Enhancements

### Advanced Visualizations
- Interactive charts with drill-down capabilities
- 3D visualizations and animations
- Real-time data streaming visualizations

### AI-Enhanced Processing
- Automatic content summarization
- Smart layout and design optimization
- Content personalization based on user preferences

### Extended Format Support
- Video generation for demonstrations
- Audio summaries and accessibility features
- Interactive web applications

### Integration APIs
- Webhook notifications for output completion
- Cloud storage integration for large files
- Collaboration platform integration (Slack, Teams, etc.)

## Content Types

### Reports
- **Executive Summaries**: High-level overviews with key metrics
- **Detailed Analysis**: Comprehensive breakdowns with data and insights
- **Status Reports**: Progress updates and milestone achievements
- **Error Reports**: Issue analysis with troubleshooting guides

### Visualizations
- **Performance Charts**: Response times, throughput, error rates
- **Coverage Maps**: Test coverage, code quality metrics
- **Dependency Graphs**: Module relationships and import structures
- **Timeline Views**: Project progress, event sequences

### Documentation
- **API References**: Endpoint documentation, parameter descriptions
- **User Guides**: Step-by-step instructions and tutorials
- **Technical Specs**: Architecture documentation, design decisions
- **Code Examples**: Practical usage examples and snippets

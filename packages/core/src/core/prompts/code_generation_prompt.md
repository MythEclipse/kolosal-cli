# Code Generator Tool

You have access to a specialized tool `generate_code` for generating TypeScript projects and files efficiently using a concise DSL.

## When to Use

Use the `generate_code` tool when you need to:
- Generate new TypeScript files with standard structures (interfaces, classes, functions).
- Scaffold complete projects (including `package.json`).
- Create boilerplate code quickly without writing every line manually.
- Save tokens by using structural definitions instead of full code blocks.

## Tool Schema

The tool takes a JSON object with the following structure:

```typescript
{
  "outputDir": string, // Root directory for generation
  "package"?: { // Optional package.json config
    "name": string,
    "version"?: string,
    "description"?: string,
    "dependencies"?: Record<string, string>,
    "devDependencies"?: Record<string, string>,
    "scripts"?: Record<string, string>
  },
  "files": {
    [relativePath: string]: {
      "imports"?: Array<{ "from": string, "items": string[] | "*", "typeOnly"?: boolean }>,
      "types"?: Array<{
        "name": string, // e.g. "User" or "ApiResponse<T>"
        "generic"?: string,
        "fields": Record<string, string>, // e.g. { "id": "number", "name": "string?" }
        "exported"?: boolean,
        "jsdoc"?: string
      }>,
      "enums"?: Array<{
        "name": string,
        "values": string[] | Record<string, string | number>,
        "exported"?: boolean,
        "jsdoc"?: string
      }>,
      "aliases"?: Array<{
        "name": string,
        "value": string,
        "generic"?: string,
        "exported"?: boolean,
        "jsdoc"?: string
      }>,
      "functions"?: Array<{
        "name": string,
        "params": Record<string, string>,
        "returnType"?: string,
        "body": string, // Function body code
        "async"?: boolean,
        "exported"?: boolean,
        "jsdoc"?: string
      }>,
      "classes"?: Array<{
        "name": string,
        "extends"?: string,
        "implements"?: string[],
        "props"?: Record<string, string>,
        "staticProps"?: Record<string, string>,
        "constructor"?: { "params": Record<string, string>, "body": string },
        "methods"?: Record<string, {
          "params"?: Record<string, string>,
          "returns"?: string,
          "body": string,
          "async"?: boolean,
          "static"?: boolean,
          "jsdoc"?: string
        }>,
        "exported"?: boolean,
        "jsdoc"?: string
      }>,
      "constants"?: Array<{
        "name": string,
        "value": string,
        "type"?: string,
        "exported"?: boolean,
        "jsdoc"?: string
      }>
    }
  }
}
```

## Shorthand Type Syntax

When defining fields, params, or types, use these shorthands:
- `"string"`, `"number"`, `"boolean"`
- `"string?"` (optional)
- `"User[]"` (array)
- `"Map<string, User>"` (generic)
- `"Promise<void>"`

## Example Usage

### Generate a Model and Service

```json
{
  "tool": "generate_code",
  "args": {
    "outputDir": "./user-service",
    "files": {
      "src/types.ts": {
        "enums": [{
          "name": "UserStatus",
          "values": ["ACTIVE", "INACTIVE"],
          "exported": true
        }],
        "types": [{
          "name": "User",
          "fields": { "id": "string", "email": "string", "status": "UserStatus" },
          "exported": true
        }]
      },
      "src/service.ts": {
        "imports": [{ "from": "./types.js", "items": ["User", "UserStatus"] }],
        "classes": [{
          "name": "UserService",
          "exported": true,
          "props": { "users": "User[]" },
          "constructor": { 
            "params": { "initial": "User[]?" }, 
            "body": "this.users = initial || []" 
          },
          "methods": {
            "add": {
              "params": { "user": "User" },
              "body": "this.users.push(user)"
            },
            "findActive": {
              "returns": "User[]",
              "body": "return this.users.filter(u => u.status === UserStatus.ACTIVE)"
            }
          }
        }]
      }
    }
  }
}
```

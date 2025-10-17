# RelPath Snippet Helper

Adds a command you can call from snippets:
- `${command:relpath.insert}` → returns the current file path **relative to the workspace root** (falls back to absolute if no workspace).

## Example snippet

```jsonc
{
  "Insert Relative Path": {
    "prefix": "relpath",
    "body": ["// Path: ${command:relpath.insert}"],
    "description": "Inserts path relative to workspace root"
  }
}

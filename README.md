# RelPath Snippet Helper

![RelPath](images/screenshot.png)

Adds:
- `${command:relpath.insert}` → returns the current file path **relative to the workspace** (fallback to absolute if no workspace).
- Command: **RelPath: Insert header comment with relative path** → inserts/updates a top-of-file comment using the correct comment syntax per language.

## Snippet example

```jsonc
{
  "Insert Relative Path": {
    "prefix": "relpath",
    "body": ["// Path: ${command:relpath.insert}"]
  }
}

# Monthly Board

Monthly Board is an Obsidian plugin that renders a configurable monthly calendar board for journals, tasks, clippings, notes, and photos.

It is designed for vaults that use Dataview and date-based notes, but most paths and fields are configurable through a JSON file.

## Features

- Render a `monthly-board` Markdown code block.
- Read a vault-relative JSON config file.
- Collect daily notes and related pages by date fields.
- Auto-detect local Obsidian images, Markdown images, and remote image URLs.
- Show a right-side detail panel for the selected day.
- Double-click a day cell to open its daily note.
- Store UI state locally in Obsidian `localStorage`.
- Support custom handwriting font and custom background presets.

## Requirements

- Obsidian `1.5.0` or later.
- Dataview plugin enabled.

## Installation for testing

Copy these files into your vault:

```text
.obsidian/plugins/monthly-board/
  manifest.json
  main.js
  monthly-board.js
  styles.css
```

Then restart Obsidian and enable `Monthly Board` in Community plugins.

## BRAT testing

This folder is structured like an Obsidian plugin repository root:

```text
manifest.json
main.js
monthly-board.js
styles.css
versions.json
README.md
example-config.json
```

To test with BRAT, put these files in a standalone GitHub repository and add that repository through BRAT.

## Usage

Create a JSON config file in your vault. You can start by copying:

```text
example-config.json
```

For example, copy it to:

```text
_tools/monthly-board/monthly-board.config.json
```

Then put this code block in any note:

````markdown
```monthly-board
config: _tools/monthly-board/monthly-board.config.json
```
````

The `config` path must be a relative `.json` file inside the current vault.

## Minimal config example

```json
{
  "journal": {
    "query": "\"Journal\"",
    "dailyFilePattern": "^\\d{4}-\\d{2}-\\d{2}$"
  },
  "dateFields": ["date", "created_at", "modified_at", "due"],
  "sources": [
    { "query": "\"Journal\"", "label": "Journal" },
    { "query": "\"Projects\"", "label": "Projects" }
  ]
}
```

## Image detection

Monthly Board can detect:

- Obsidian wiki images: `![[image.jpg]]`
- Markdown images: `![alt](image.jpg)`
- Remote images: `https://example.com/image.jpg`
- Frontmatter fields commonly named `image`, `cover`, `banner`, or `images`

## Security notes

- The plugin only reads a relative `.json` config file inside the current vault.
- It does not execute JavaScript config files.
- It does not read absolute paths or files outside the vault.
- It does not access tokens or external service credentials.
- It does not write to Notion or any remote service.

## Current status

This is an MVP release package suitable for local testing or BRAT testing. Before submitting to the official Obsidian community plugin directory, the settings UI and documentation should be expanded further.

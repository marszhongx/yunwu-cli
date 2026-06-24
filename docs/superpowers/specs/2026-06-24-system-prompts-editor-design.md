# System Prompts Editor Design

## Overview

Yunwu CLI will support editing `systemPrompts` from inside the terminal UI. Users will enter a dedicated editor with `/system`, manage a list of prompts, and persist changes to `.yunwu/config.json`. The saved prompts apply globally to later sends. Existing chats and messages are not migrated or rewritten.

## Goals

- Let users view, add, edit, delete, reset, and save multiple system prompts without leaving the TUI.
- Persist edited prompts to `.yunwu/config.json` so they apply across app restarts.
- Preserve the existing default prompt behavior when no custom prompts are configured.
- Keep implementation boundaries clear: storage in `fileStorage`, prompt usage in `chatRuntime`, editor UI in `components`.

## Non-goals

- Per-chat prompt persistence.
- Character-card prompt editing.
- A full multi-line terminal editor.
- Rewriting existing chat histories after prompts change.

## Data model and persistence

`CliConfig` will gain an optional field:

```ts
systemPrompts?: string[];
```

The config file may contain:

```json
{
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-...",
  "model": "example-model",
  "maxTokens": 1024,
  "systemPrompts": [
    "第一条系统提示",
    "第二条系统提示"
  ]
}
```

`readCliConfig()` will normalize `systemPrompts` as follows:

- If it is a string array with at least one non-blank item, keep the non-blank strings.
- Preserve meaningful whitespace and newlines inside non-blank prompt strings.
- If it is missing, malformed, or empty after filtering, ignore it without making the entire config invalid.
- Required fields remain `baseUrl`, `apiKey`, and `model`; optional `maxTokens` keeps the existing positive-number rounding behavior.

A new `writeCliConfig(rootDir, config)` storage function will write the parsed config shape back to `.yunwu/config.json` with stable pretty JSON. It will include `systemPrompts` only when the list has at least one non-blank item. Saving an empty prompt list removes `systemPrompts`, causing default prompts to apply.

`config.example.json` and README will document the optional field and mention that the TUI editor uses `\n` to enter real line breaks.

## Runtime behavior

`sendChatMessage()` will pass `config.systemPrompts` to `buildMessages()`. `buildMessages()` already supports custom prompt arrays and falls back to `DEFAULT_SYSTEM_PROMPTS` when needed.

After a successful save in the editor, `App.tsx` will update the in-memory `config`. The next submitted user message will use the newly saved prompts immediately. Existing chat metadata and message JSONL files remain unchanged.

If `config` is unavailable, `/system` will not enter the editor. The app will show an error telling the user to configure `.yunwu/config.json` first.

## TUI design

`App.tsx` will add a `system-edit` mode. The `/system` command enters this mode when config is loaded.

A new `SystemPromptEditor` component will own the editor UI state for list selection and text editing. `App.tsx` will pass the initial prompt list, save callback, and exit callback.

### List mode

The editor displays:

- A title describing the system prompt editor.
- Numbered prompt entries.
- The selected prompt highlighted.
- A compact preview of each prompt, with real newlines shown as `\n`.
- Help text for available keys.
- Any status or error message.

Keys:

- `↑` / `↓`: select prompt.
- `e`: edit selected prompt.
- `a`: append a new prompt.
- `d`: delete selected prompt.
- `r`: reset the in-memory list to `DEFAULT_SYSTEM_PROMPTS`.
- `s`: save to `.yunwu/config.json`.
- `Escape`: leave editor without automatically saving unsaved changes.

The list may become empty. Empty means custom prompts are disabled after save and defaults will be used.

### Text edit mode

Pressing `e` or `a` switches the editor into text edit mode:

- The editor uses a single-line `TextInput`.
- Existing prompts are shown with real newlines escaped as `\n`.
- On `Enter`, input is converted by replacing `\n` sequences with real line breaks.
- Blank input is not added. Editing an existing prompt to blank removes it.
- `Escape` cancels the current edit and returns to list mode.

## Error handling

- Invalid or absent `systemPrompts` in config is ignored; default prompts are used.
- Save failures keep the editor open and display the error.
- Saving an empty list removes `systemPrompts` from the written config.
- `/system` with missing config shows a chat-mode error instead of opening the editor.

## Testing plan

Update or add tests for:

- `fileStorage.test.ts`
  - `readCliConfig()` reads valid `systemPrompts`.
  - `readCliConfig()` ignores malformed or all-blank `systemPrompts`.
  - `writeCliConfig()` writes prompts and removes them when the list is empty.
- `chatRuntime.test.ts`
  - `sendChatMessage()` includes `config.systemPrompts` in provider messages.
- Component or app tests
  - `/system` enters the system prompt editor when config exists.
  - Editing and adding prompts converts `\n` to real newlines.
  - Saving calls the config writer and updates app state.
- Existing `messages.test.ts`
  - Keep custom prompt behavior covered; add fallback coverage only if current tests do not already cover it.

## Scope boundaries

This design is focused enough for one implementation plan. It touches the config type, storage service, chat runtime prompt building, the main app mode switch, one new editor component, docs, and tests. It does not include per-chat storage, external editors, or character-card prompt imports.

# Config System Prompts Append Design

## Overview

Yunwu CLI will support `systemPrompts` in `.yunwu/config.json` as additional system prompts. Built-in default prompts remain immutable and always apply first. Config prompts are appended after the built-in prompts before character, lorebook, examples, and conversation history.

## Goals

- Let users add global system prompt guidance through `.yunwu/config.json`.
- Keep the built-in narrator and response-format prompts active and non-replaceable.
- Avoid adding a TUI editor or any runtime config-writing flow.
- Keep implementation small and focused.

## Non-goals

- Editing prompts from the TUI.
- Replacing or disabling built-in default prompts.
- Per-chat prompt persistence.
- Character-card prompt editing.
- Writing `.yunwu/config.json` from the app.

## Data model and config parsing

`CliConfig` keeps an optional field:

```ts
systemPrompts?: string[];
```

`readCliConfig()` reads `systemPrompts` from `.yunwu/config.json`:

- If it is a string array with at least one non-blank string, keep the non-blank strings.
- Preserve meaningful whitespace and newlines inside non-blank prompt strings.
- If it is missing, malformed, or empty after filtering, ignore it without invalidating the config.
- Required fields remain `baseUrl`, `apiKey`, and `model`.

There will be no `writeCliConfig()` helper because the app no longer writes prompt configuration.

## Prompt assembly

`buildMessages()` will treat `systemPrompts` as extra prompts:

1. Add all `DEFAULT_SYSTEM_PROMPTS` first.
2. Append any non-empty custom prompts passed through `systemPrompts`.
3. Append character description, personality, scenario, enabled lorebook entries, message examples, and history as today.

This means config prompts cannot override the built-in response-format prompt by replacing it. They can only add additional guidance after the built-ins.

`sendChatMessage()` continues to pass `config.systemPrompts` to `buildMessages()`.

## Removed TUI scope

The `/system` command and `SystemPromptEditor` are no longer part of the feature. The implementation should remove:

- `src/components/SystemPromptEditor.tsx`
- `src/components/SystemPromptEditor.test.tsx`
- `system-edit` mode and `/system` command handling from `src/App.tsx`
- `/system` tests and `writeCliConfig` mocking from `src/App.test.tsx`
- `/system` from `ChatScreen` help text

## Documentation

`config.example.json` and README should document `systemPrompts` as optional additional prompts. Documentation must not say prompts can be edited in the TUI.

## Testing plan

- `fileStorage.test.ts`
  - Keep tests that read valid `systemPrompts` and ignore invalid/all-blank entries.
  - Remove tests for `writeCliConfig()` because config writing is out of scope.
- `messages.test.ts`
  - Verify default prompts always appear first.
  - Verify custom config prompts are appended after default prompts.
  - Verify empty custom prompts fall back to only default prompts.
- `chatRuntime.test.ts`
  - Verify provider messages start with default prompts and include config prompts after them.
- `App.test.tsx`
  - Remove `/system` editor tests.
  - Existing app behavior should continue to pass.
- Full verification should run `npm run check` and `npm run build`.

## Scope boundaries

This revised feature is a config-only prompt extension. It touches config parsing, prompt assembly, runtime tests, docs, and removal of previously added TUI editor code. It intentionally does not include any UI or app-side config mutation.

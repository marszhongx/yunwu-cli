# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Yunwu CLI is a terminal-based AI roleplay chat app built with Ink (React for CLIs). It runs as a Node CLI, connects directly to OpenAI-compatible Chat Completions providers through `@tanstack/ai` / `@tanstack/ai-openai`, and stores user data on disk under `.yunwu/` in the current working directory.

## Commands

- `npm install` - install dependencies.
- `npm run dev` - run the CLI directly with `tsx src/cli.tsx` for development.
- `npm run build` - bundle the production CLI to `dist/cli.js` with tsup.
- `npm run start` - run the built CLI from `dist/cli.js`.
- `npm run lint` - run type-aware `oxlint` over `src`.
- `npm run format` - check formatting with `oxfmt --check src`.
- `npm run test` - run the Vitest suite once.
- `npx vitest run src/path/to/file.test.ts` - run a single test file.
- `npx vitest run -t "test name"` - run tests matching a name pattern.

## Runtime data and configuration

- The CLI reads `.yunwu/config.json` from the process working directory. Required fields are `baseUrl`, `apiKey`, and `model`; optional `maxTokens` is rounded to a positive integer.
- Character cards are JSON files in `.yunwu/characters/` using the internal `CharacterCard` shape documented in `README.md`.
- Chat metadata is written to `.yunwu/chats/<chat-id>.json` and messages are appended as JSONL to `.yunwu/messages/<chat-id>.jsonl`.
- Chat IDs are generated as `chat-YYYYMMDD-HHmmss-xxxxxxxx`; filenames are validated through `safeChatFileName()` before reads/writes.

## Architecture

- `src/cli.tsx` is the executable entrypoint. It renders `<App rootDir={process.cwd()} />` with Ink.
- `src/App.tsx` owns the interactive TUI state: current mode (`chat`, `character-select`, `chat-select`), config/character/chat loading, slash command handling, optimistic message rendering, choice navigation, and streaming updates from the runtime.
- `src/components/` contains Ink presentation components: `ChatScreen`, `MessageItem`, `CharacterSelect`, and `ChatSelect`.
- `src/services/fileStorage.ts` is the filesystem boundary. It creates `.yunwu/` directories, reads config/characters/chat metadata/messages, normalizes persisted JSON, appends JSONL messages, and guards chat filenames.
- `src/services/chatRuntime.ts` contains chat lifecycle operations: creating chats, resuming chats, appending user/assistant messages, updating chat metadata, and building provider messages before calling the AI client.
- `src/services/aiClient.ts` wraps `@tanstack/ai` streaming Chat Completions. It splits system prompts from conversation messages, passes `max_tokens` when configured, extracts text deltas from multiple possible chunk shapes, and converts provider error chunks into thrown errors.
- `src/lib/messages.ts` builds prompt messages from default system prompts, character fields, lorebook entries, and history. Older assistant turns are compressed to `<summary>` when available while the two most recent assistant turns keep full visible content.
- `src/lib/xml.ts` and `src/lib/messages.ts` parse provider replies that may contain `<content>`, `<summary>`, and `<choices>` tags. UI rendering uses parsed content and suggested choices.
- `src/lib/lorebooks.ts` normalizes and matches lorebook keys. `src/lib/charaCardV2.ts`, `src/lib/pngMetadata.ts`, and `src/lib/export.ts` handle character card import/export helpers.
- Shared domain types live in `src/types/index.ts`; default prompts and response tag names live in `src/constants/index.ts`.

## Testing notes

- Tests live beside source files as `*.test.ts` / `*.test.tsx` under `src/`.
- Vitest is configured in `vite.config.ts` with Node environment, globals, `passWithNoTests: true`, and `src/**/*.test.{ts,tsx}` includes.
- UI tests use `ink-testing-library`; storage and runtime tests use temporary directories and injected provider/clock dependencies where appropriate.

## Development notes

- Use the `@/` alias for imports from `src`.
- Do not use re-exports or barrel files. Import types, constants, functions, and components directly from the module where they are defined.
- Keep the app as a local CLI with filesystem persistence; do not introduce a backend requirement for normal operation.
- Provider secrets come from user-created `.yunwu/config.json`; do not move them into committed config or code.
- When changing chat send/resume behavior, account for both in-memory optimistic UI state in `App.tsx` and persisted JSON/JSONL state in `chatRuntime.ts` / `fileStorage.ts`.
- When changing provider response handling, update parsing/rendering behavior in `src/lib/messages.ts` and relevant component tests if tag semantics change.

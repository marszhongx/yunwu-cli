# AGENTS.md

## Commands

- `npm install` installs dependencies from the committed `package-lock.json`; keep npm as the package manager unless the lockfile changes.
- `npm run dev` runs the CLI directly with `tsx src/cli.tsx` for development.
- `npm run build` bundles the production CLI to `dist/cli.js` with tsup.
- `npm run start` runs the built CLI from `dist/cli.js`.
- `npm run lint` runs type-aware `oxlint --type-aware --type-check src`.
- `npm run format` checks formatting with `oxfmt --check src`.
- `npm run test` runs the Vitest suite once.
- Focused tests: `npx vitest run src/path/to/file.test.ts` or `npx vitest run -t "test name"`.

## App Shape

- Yunwu CLI is a terminal-based AI roleplay chat app built with Ink (React for CLIs).
- `src/cli.tsx` is the executable entrypoint and renders `<App rootDir={process.cwd()} />`.
- `src/App.tsx` owns top-level interactive state: chat mode, character selection, chat selection, slash commands, config loading, optimistic message rendering, and streaming updates.
- Ink UI components live in `src/components/`: `ChatScreen`, `MessageItem`, `CharacterSelect`, and `ChatSelect`.
- Use the `@/` alias for `src` imports. Do not add barrel/re-export files; import from the defining module.

## State And Persistence

- The CLI stores user data on disk under `.yunwu/` in the current working directory.
- Config is read from `.yunwu/config.json`; required fields are `baseUrl`, `apiKey`, and `model`, with optional `maxTokens`.
- Character cards are JSON files in `.yunwu/characters/` using the internal `CharacterCard` shape documented in `README.md`.
- Chat metadata is stored in `.yunwu/chats/<chat-id>.json`; messages are appended as JSONL in `.yunwu/messages/<chat-id>.jsonl`.
- `src/services/fileStorage.ts` is the filesystem boundary. Do not bypass it for runtime data reads/writes.
- `src/services/chatRuntime.ts` owns chat lifecycle operations: create, resume, send message, persist messages, and update chat metadata.

## AI And Prompt Flow

- `src/services/aiClient.ts` wraps `@tanstack/ai` with the OpenAI-compatible adapter and streams Chat Completions responses.
- Any provider that implements the OpenAI Chat Completions API can be used through `baseUrl`, including OpenRouter, LiteLLM, vLLM, and local servers.
- Prompt construction lives in `src/lib/messages.ts`; lorebook matching lives in `src/lib/lorebooks.ts`.
- Provider replies may contain `<content>`, `<summary>`, and `<choices>` tags; parsing helpers live in `src/lib/xml.ts` and `src/lib/messages.ts`.
- Provider API keys come from user-created `.yunwu/config.json`; never commit real keys or move secrets into code.

## Tests And CLI Checks

- Tests live beside source files as `*.test.ts` / `*.test.tsx` under `src/`.
- Vitest runs in a Node environment configured by `vite.config.ts`.
- UI tests use `ink-testing-library`; storage and runtime tests use temporary directories and injected provider/clock dependencies.
- For storage or CLI behavior changes, run the relevant focused Vitest tests and then `npm run test` before claiming completion.

## Development Notes

- Keep the app as a local CLI with filesystem persistence; do not introduce a backend requirement for normal operation.
- When changing chat send/resume behavior, account for both in-memory optimistic UI state in `App.tsx` and persisted JSON/JSONL state in `chatRuntime.ts` / `fileStorage.ts`.
- When changing provider response handling, update parsing/rendering behavior and relevant tests if tag semantics change.

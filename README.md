# Yunwu CLI

Terminal-based AI roleplay chat app powered by Ink (React for CLIs). Connects to any OpenAI-compatible API for character-driven conversations.

## Quick start

```bash
npm install
npm run dev
```

The dev command runs `tsx src/cli.tsx` directly. For a production build:

```bash
npm run build
npm run start
```

## Configuration

Create `.yunwu/config.json` in your working directory:

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "model": "gpt-4o",
  "maxTokens": 4096
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `baseUrl` | Yes | OpenAI-compatible API base URL (trailing slash stripped automatically) |
| `apiKey` | Yes | API key for the provider |
| `model` | Yes | Model identifier (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `maxTokens` | No | Maximum response tokens (positive integer) |

Any provider that implements the OpenAI Chat Completions API works, including OpenRouter, LiteLLM, vLLM, and local servers.

## Characters

Place standard Character Card JSON files in `.yunwu/characters/`. Each file must be one of the supported standard card formats:

- `chara_card_v2`
- `chara_card_v3`

Example v2 card:

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Alice",
    "description": "A friendly AI assistant.",
    "personality": "Cheerful and helpful",
    "scenario": "A casual conversation",
    "first_mes": "Hi there! How can I help you today?",
    "mes_example": "",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": [],
    "opening_user_choices": [],
    "character_book": {
      "name": "Alice Lorebook",
      "entries": []
    },
    "creator_notes": "",
    "tags": [],
    "creator": "",
    "character_version": "1.0"
  }
}
```

Yunwu uses the character file name without `.json` as the stable character id stored in chat metadata. For example, `.yunwu/characters/alice.json` becomes character id `alice`. Renaming a character file can prevent older chats from resuming until the file name or chat metadata is restored.

### Lorebook entries

Character book entries are read from `data.character_book.entries` and are injected when their standard matching rules apply:

```json
{
  "character_book": {
    "entries": [
      {
        "keys": ["magic", "spell"],
        "content": "In this world, magic is powered by crystallized moonlight.",
        "enabled": true,
        "constant": false,
        "selective": false,
        "secondary_keys": []
      }
    ]
  }
}
```

## Chats and messages

Chats are stored automatically under `.yunwu/`:

- **Chat metadata**: `.yunwu/chats/<chat-id>.json` -- character info, title, timestamps
- **Messages**: `.yunwu/messages/<chat-id>.jsonl` -- one JSON object per line

Chat IDs follow the format `chat-YYYYMMDD-HHmmss-xxxxxxxx` (e.g. `chat-20260623-143022-a1b2c3d4`).

Each message line in the `.jsonl` file:

```json
{"id":"msg-...","role":"user","content":"Hello!","createdAt":"2026-06-23T14:30:22.000Z"}
{"id":"msg-...","role":"assistant","content":"Hi! How can I help?","createdAt":"2026-06-23T14:30:25.000Z"}
```

## Commands

| Command | Description |
|---------|-------------|
| `/new` | Create a new chat -- select a character from `.yunwu/characters/` |
| `/resume` | Resume an existing chat -- pick from saved chats sorted by last activity |
| `/help` | Show available commands |
| `/exit` | Quit the app |
| `Escape` | Return to chat mode from character/chat selection |

Type any text message and press Enter to send it to the AI provider. The app constructs the full prompt from system instructions, character data, lorebook entries, and conversation history.

## AI provider

The TUI uses `@tanstack/ai` with the OpenAI-compatible adapter (`@tanstack/ai-openai`). It connects directly from the CLI process to whatever `baseUrl` you configure -- no backend server needed.

The default system prompt instructs the AI to respond in structured XML tags: `<content>` for the visible reply, `<summary>` for memory compression of older messages, and `<choices>` for suggested user actions.

You can add global prompt guidance by setting `systemPrompts` in `.yunwu/config.json`. These prompts are appended after the built-in system prompts; they do not replace or disable the built-in narrator and response-format instructions.

## Development

```bash
npm install          # install dependencies
npm run dev          # run with tsx (fast iteration)
npm run build        # build to dist/cli.js via tsup
npm run start        # run the built CLI
npm run lint         # type-aware oxlint
npm run format       # check formatting with oxfmt
npm run test         # run vitest
```

## Project structure

```
src/
  cli.tsx              Entry point -- renders <App> via Ink
  App.tsx              Top-level state: modes, commands, config loading
  components/          Ink UI components (ChatScreen, CharacterSelect, ChatSelect)
  services/
    fileStorage.ts     Read/write .yunwu/ directory (config, characters, chats, messages)
    aiClient.ts        TanStack AI OpenAI-compatible client setup
    chatRuntime.ts     Chat lifecycle: create, resume, send message
  types/               TypeScript types (CliConfig, CharacterCard, ChatMessage, etc.)
  lib/                 Prompt building helpers
  constants/           Default system prompts
```

## License

ISC

# Standard Character Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Yunwu-specific character files with direct standard `chara_card_v2` / `chara_card_v3` support while preserving original card shapes and interpreting them at runtime.

**Architecture:** Introduce a focused `src/lib/characterCards.ts` interpreter for standard card validation, display helpers, prompt parts, opening choices, and lorebook matching. Update storage/runtime/UI to pass file-derived character ids separately from card data, then update docs and tests to reflect the breaking format change.

**Tech Stack:** TypeScript, Node fs promises, Ink React CLI components, Vitest, existing `@/` import alias, no new dependencies.

## Global Constraints

- `.yunwu/characters/*.json` accepts only standard `spec: "chara_card_v2"` or `spec: "chara_card_v3"` records with a usable `data.name`.
- Preserve original v2/v3 card shape in memory; do not convert to old internal format and do not overwrite user files.
- Do not support old Yunwu internal character JSON.
- Do not support v1/no-`spec` character cards.
- Character runtime id is the character file name without `.json`.
- Global/default system prompts remain before character-specific prompt parts.
- Character-specific prompt order is `system_prompt`, `description`, `personality`, `scenario`, matched/constant lorebook entries, `mes_example`, `post_history_instructions`, then chat history.
- Lorebook matching must support `enabled`, `constant`, `keys`, `selective`, `secondary_keys`, `case_sensitive`, `priority`, and `insertion_order`.
- Use the `@/` alias for imports from `src`.
- Do not add a backend or external import service.

---

## File Structure

- Create `src/lib/characterCards.ts`: owns standard card types, validation, safe text/array helpers, display/opening helpers, prompt-part building, and character book matching.
- Create `src/lib/characterCards.test.ts`: unit tests for v2/v3 validation, helper behavior, prompt parts, and lorebook matching.
- Modify `src/types/index.ts`: replace the old internal `CharacterCard`/`LorebookEntry` runtime shape with standard card and file-backed selected character types.
- Modify `src/services/fileStorage.ts`: make `readCharacters()` accept v2/v3 only, preserve card data, and attach file-derived ids.
- Modify `src/services/fileStorage.test.ts`: update character tests for v2/v3 acceptance and old-format/v1 rejection.
- Modify `src/lib/messages.ts`: make prompt building consume precomputed character prompt parts instead of `Partial<CharacterCard>` internal fields.
- Modify `src/lib/messages.test.ts` if present or create targeted tests in `characterCards.test.ts`; do not duplicate broad coverage.
- Modify `src/services/chatRuntime.ts`: create chats with file-derived character ids, use helper functions for names/opening messages, and compute matched lorebook prompt parts using current messages plus the submitted user message.
- Modify `src/services/chatRuntime.test.ts`: update fixtures and expectations for v2/v3 cards and lorebook matching.
- Modify `src/App.tsx`: track selected `ListedCharacter` or selected character id separately enough to pass file-derived ids into runtime and match resumed chats by `ListedCharacter.id`.
- Modify `src/components/CharacterSelect.tsx`: display helper-derived character names.
- Modify `src/components/ChatScreen.tsx`: display helper-derived character names.
- Modify any tests importing `CharacterCard` from old internal assumptions.
- Modify `README.md`: document standard v2/v3 character files and file-name-derived ids.

---

### Task 1: Add standard card interpreter

**Files:**
- Create: `src/lib/characterCards.ts`
- Create: `src/lib/characterCards.test.ts`
- Modify: `src/types/index.ts:18-43`

**Interfaces:**
- Produces: `StandardCharacterCard`, `CharaCardV2`, `CharaCardV3`, `CharacterBookEntry`, `CharacterPromptParts`, `isStandardCharacterCard(value): value is StandardCharacterCard`, `normalizeStandardCharacterCard(value): StandardCharacterCard | null`, `getCharacterName(character): string`, `getCharacterFirstMessage(character): string`, `getOpeningUserChoices(character): string[]`, `buildCharacterPromptParts(character, context): string[]`.
- Consumes: No new app interfaces. Uses only plain unknown input and current chat text context.

- [ ] **Step 1: Replace character-related types with standard card types**

In `src/types/index.ts`, replace the old `LorebookEntry` and `CharacterCard` definitions with these exports, keeping the surrounding `CliConfig`, `ChatMessage`, `ChatMetadata`, and `LoadResult` types unchanged:

```ts
export type CharacterCardSpec = "chara_card_v2" | "chara_card_v3";

export type CharacterBookEntry = {
  keys?: unknown;
  key?: unknown;
  content?: unknown;
  enabled?: unknown;
  insertion_order?: unknown;
  case_sensitive?: unknown;
  name?: unknown;
  priority?: unknown;
  id?: unknown;
  selective?: unknown;
  secondary_keys?: unknown;
  constant?: unknown;
  position?: unknown;
  extensions?: unknown;
};

export type CharacterBook = {
  name?: unknown;
  entries?: unknown;
};

export type CharaCardData = {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  scenario?: unknown;
  first_mes?: unknown;
  mes_example?: unknown;
  creator_notes?: unknown;
  system_prompt?: unknown;
  post_history_instructions?: unknown;
  alternate_greetings?: unknown;
  group_only_greetings?: unknown;
  opening_user_choices?: unknown;
  tags?: unknown;
  creator?: unknown;
  character_version?: unknown;
  avatar?: unknown;
  extensions?: unknown;
  character_book?: unknown;
};

export type CharaCardV2 = {
  spec: "chara_card_v2";
  spec_version?: unknown;
  data: CharaCardData;
};

export type CharaCardV3 = {
  spec: "chara_card_v3";
  spec_version?: unknown;
  data: CharaCardData;
};

export type StandardCharacterCard = CharaCardV2 | CharaCardV3;
```

- [ ] **Step 2: Write failing interpreter tests**

Create `src/lib/characterCards.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import {
  buildCharacterPromptParts,
  getCharacterFirstMessage,
  getCharacterName,
  getOpeningUserChoices,
  isStandardCharacterCard,
  normalizeStandardCharacterCard,
} from "@/lib/characterCards";
import type { StandardCharacterCard } from "@/types";

describe("standard character cards", () => {
  test("recognizes v2 and v3 cards with data.name", () => {
    expect(isStandardCharacterCard(v2Card())).toBe(true);
    expect(isStandardCharacterCard(v3Card())).toBe(true);
    expect(isStandardCharacterCard({ spec: "chara_card_v2", data: { name: "   " } })).toBe(false);
    expect(isStandardCharacterCard({ name: "legacy" })).toBe(false);
  });

  test("normalizes only supported cards and preserves card shape", () => {
    const card = v2Card();

    expect(normalizeStandardCharacterCard(card)).toBe(card);
    expect(normalizeStandardCharacterCard({ spec: "chara_card_v1", data: { name: "Old" } })).toBeNull();
    expect(normalizeStandardCharacterCard({ name: "Legacy" })).toBeNull();
  });

  test("reads names and first messages from data", () => {
    expect(getCharacterName(v2Card())).toBe("Misty Guide");
    expect(getCharacterFirstMessage(v2Card())).toBe("Welcome to the fog.");
    expect(getCharacterName(v3Card())).toBe("V3 Guide");
    expect(getCharacterFirstMessage(v3Card())).toBe("V3 welcome.");
  });

  test("reads opening choices by card version", () => {
    expect(getOpeningUserChoices(v2Card())).toEqual(["Enter the station"]);
    expect(getOpeningUserChoices(v3Card())).toEqual(["V3 choice A", "V3 choice B"]);
  });

  test("builds prompt parts in standard order", () => {
    expect(buildCharacterPromptParts(v2Card(), { messages: [{ role: "user", content: "station" }] })).toEqual([
      "Keep the narration eerie.",
      "A guide from the fogbound city.",
      "Careful and curious.",
      "The user arrives at an abandoned station.",
      "The station appears under a full moon.",
      "This rule is always present.",
      "User: Hello\nGuide: The mist answers.",
      "Remember the station layout.",
    ]);
  });

  test("matches lorebook entries using selective secondary keys and case sensitivity", () => {
    const card = v2Card({
      character_book: {
        entries: [
          {
            keys: ["station"],
            secondary_keys: ["moon"],
            selective: true,
            content: "Station plus moon.",
            enabled: true,
            insertion_order: 2,
            priority: 10,
          },
          {
            keys: ["Station"],
            content: "Case-sensitive station.",
            case_sensitive: true,
            enabled: true,
            insertion_order: 1,
            priority: 20,
          },
          {
            keys: ["station"],
            content: "Disabled station.",
            enabled: false,
          },
        ],
      },
    });

    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "station moon" }] })).toContain(
      "Station plus moon.",
    );
    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "station moon" }] })).not.toContain(
      "Case-sensitive station.",
    );
    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "Station moon" }] })).toContain(
      "Case-sensitive station.",
    );
    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "station" }] })).not.toContain(
      "Station plus moon.",
    );
  });

  test("sorts matched lorebook entries by priority descending then insertion_order ascending", () => {
    const card = v2Card({
      character_book: {
        entries: [
          { keys: ["fog"], content: "Low priority.", priority: 1, insertion_order: 1 },
          { keys: ["fog"], content: "High later.", priority: 5, insertion_order: 2 },
          { keys: ["fog"], content: "High earlier.", priority: 5, insertion_order: 1 },
        ],
      },
    });

    const parts = buildCharacterPromptParts(card, { messages: [{ role: "user", content: "fog" }] });
    expect(parts).toEqual([
      "Keep the narration eerie.",
      "A guide from the fogbound city.",
      "Careful and curious.",
      "The user arrives at an abandoned station.",
      "High earlier.",
      "High later.",
      "Low priority.",
      "User: Hello\nGuide: The mist answers.",
      "Remember the station layout.",
    ]);
  });
});

function v2Card(data: Record<string, unknown> = {}): StandardCharacterCard {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Misty Guide",
      description: "A guide from the fogbound city.",
      personality: "Careful and curious.",
      scenario: "The user arrives at an abandoned station.",
      first_mes: "Welcome to the fog.",
      mes_example: "User: Hello\nGuide: The mist answers.",
      system_prompt: "Keep the narration eerie.",
      post_history_instructions: "Remember the station layout.",
      opening_user_choices: ["Enter the station"],
      character_book: {
        entries: [
          { keys: ["station"], content: "The station appears under a full moon.", enabled: true },
          { keys: [], content: "This rule is always present.", constant: true, enabled: true },
        ],
      },
      ...data,
    },
  };
}

function v3Card(): StandardCharacterCard {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "V3 Guide",
      first_mes: "V3 welcome.",
      group_only_greetings: ["V3 choice A", "V3 choice B"],
    },
  };
}
```

- [ ] **Step 3: Run interpreter tests to verify they fail**

Run:

```bash
npx vitest run src/lib/characterCards.test.ts
```

Expected: FAIL because `src/lib/characterCards.ts` does not exist or exports are missing.

- [ ] **Step 4: Implement the interpreter**

Create `src/lib/characterCards.ts`:

```ts
import type { ChatMessage, StandardCharacterCard } from "@/types";

type PromptContext = {
  messages?: Pick<ChatMessage, "role" | "content">[];
};

type NormalizedBookEntry = {
  content: string;
  enabled: boolean;
  keys: string[];
  secondaryKeys: string[];
  selective: boolean;
  constant: boolean;
  caseSensitive: boolean;
  priority: number;
  insertionOrder: number;
};

export function isStandardCharacterCard(value: unknown): value is StandardCharacterCard {
  return normalizeStandardCharacterCard(value) !== null;
}

export function normalizeStandardCharacterCard(value: unknown): StandardCharacterCard | null {
  if (!isRecord(value)) return null;
  if (value.spec !== "chara_card_v2" && value.spec !== "chara_card_v3") return null;
  if (!isRecord(value.data)) return null;
  if (!text(value.data.name)) return null;
  return value as StandardCharacterCard;
}

export function getCharacterName(character: StandardCharacterCard): string {
  return text(character.data.name);
}

export function getCharacterFirstMessage(character: StandardCharacterCard): string {
  return text(character.data.first_mes);
}

export function getOpeningUserChoices(character: StandardCharacterCard): string[] {
  if (character.spec === "chara_card_v3") {
    return textArray(character.data.group_only_greetings);
  }
  return textArray(character.data.opening_user_choices);
}

export function buildCharacterPromptParts(
  character: StandardCharacterCard,
  context: PromptContext = {},
): string[] {
  const data = character.data;
  const parts = [
    text(data.system_prompt),
    text(data.description),
    text(data.personality),
    text(data.scenario),
    ...matchCharacterBookEntries(character, context),
    text(data.mes_example),
    text(data.post_history_instructions),
  ];
  return parts.filter((part) => part.trim() !== "");
}

export function matchCharacterBookEntries(
  character: StandardCharacterCard,
  context: PromptContext = {},
): string[] {
  const haystack = contextText(context.messages ?? []);
  return normalizedCharacterBookEntries(character)
    .filter((entry) => shouldInjectEntry(entry, haystack))
    .sort(compareEntries)
    .map((entry) => entry.content);
}

function normalizedCharacterBookEntries(character: StandardCharacterCard): NormalizedBookEntry[] {
  const book = record(character.data.character_book);
  const entries = Array.isArray(book.entries) ? book.entries : [];

  return entries.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const content = text(entry.content);
    if (!content) return [];
    return [
      {
        content,
        enabled: entry.enabled !== false,
        keys: normalizeKeys(entry.keys ?? entry.key),
        secondaryKeys: normalizeKeys(entry.secondary_keys),
        selective: entry.selective === true,
        constant: entry.constant === true,
        caseSensitive: entry.case_sensitive === true,
        priority: numberValue(entry.priority) ?? 0,
        insertionOrder: numberValue(entry.insertion_order) ?? index,
      },
    ];
  });
}

function shouldInjectEntry(entry: NormalizedBookEntry, haystack: string): boolean {
  if (!entry.enabled) return false;
  if (entry.constant) return true;
  if (entry.keys.length === 0) return false;

  const primaryMatched = hasAnyKey(haystack, entry.keys, entry.caseSensitive);
  if (!primaryMatched) return false;
  if (!entry.selective) return true;
  if (entry.secondaryKeys.length === 0) return true;
  return hasAnyKey(haystack, entry.secondaryKeys, entry.caseSensitive);
}

function compareEntries(left: NormalizedBookEntry, right: NormalizedBookEntry): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return left.insertionOrder - right.insertionOrder;
}

function hasAnyKey(haystack: string, keys: string[], caseSensitive: boolean): boolean {
  const source = caseSensitive ? haystack : haystack.toLocaleLowerCase();
  return keys.some((key) => source.includes(caseSensitive ? key : key.toLocaleLowerCase()));
}

function contextText(messages: Pick<ChatMessage, "role" | "content">[]): string {
  return messages.map((message) => message.content).join("\n");
}

export function normalizeKeys(keys: unknown): string[] {
  if (Array.isArray(keys)) {
    return keys.map((key) => String(key).trim()).filter(Boolean);
  }
  if (typeof keys === "string") {
    return keys
      .split(/[,，]/u)
      .map((key) => key.trim())
      .filter(Boolean);
  }
  return [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 5: Run interpreter tests to verify they pass**

Run:

```bash
npx vitest run src/lib/characterCards.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit interpreter task**

Run:

```bash
git add src/types/index.ts src/lib/characterCards.ts src/lib/characterCards.test.ts
git commit -m "feat: add standard character card helpers"
```

---

### Task 2: Update character file storage

**Files:**
- Modify: `src/services/fileStorage.ts:1-365`
- Modify: `src/services/fileStorage.test.ts:14-244`

**Interfaces:**
- Consumes: `normalizeStandardCharacterCard(value): StandardCharacterCard | null` from Task 1.
- Produces: `ListedCharacter = { id: string; fileName: string; character: StandardCharacterCard }` and `readCharacters(rootDir)` that accepts v2/v3 only.

- [ ] **Step 1: Write failing storage tests**

In `src/services/fileStorage.test.ts`, replace the existing `readCharacters requires both id and name`, `readCharacters reads character JSON...`, and `readCharacters preserves freeform character whitespace` tests with:

```ts
  test("readCharacters accepts standard v2 and v3 cards and derives ids from filenames", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.charactersDir, "misty-guide.json"),
      JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "Misty Guide" } }),
    );
    await writeFile(
      join(paths.charactersDir, "v3-guide.json"),
      JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "V3 Guide" } }),
    );

    const result = await readCharacters(rootDir);

    expect(result.warnings).toEqual([]);
    expect(result.characters).toEqual([
      {
        id: "misty-guide",
        fileName: "misty-guide.json",
        character: { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Misty Guide" } },
      },
      {
        id: "v3-guide",
        fileName: "v3-guide.json",
        character: { spec: "chara_card_v3", spec_version: "3.0", data: { name: "V3 Guide" } },
      },
    ]);
  });

  test("readCharacters skips old internal, v1, nameless, and bad JSON files", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.charactersDir, "internal.json"),
      JSON.stringify({ id: "char-1", name: "Internal" }),
    );
    await writeFile(join(paths.charactersDir, "v1.json"), JSON.stringify({ name: "V1" }));
    await writeFile(
      join(paths.charactersDir, "nameless-v2.json"),
      JSON.stringify({ spec: "chara_card_v2", data: { name: "   " } }),
    );
    await writeFile(join(paths.charactersDir, "broken.json"), "{bad json");

    const result = await readCharacters(rootDir);

    expect(result.characters).toEqual([]);
    expect(result.warnings).toHaveLength(4);
    expect(result.warnings).toContain("Skipped internal.json: unsupported character card format");
    expect(result.warnings).toContain("Skipped v1.json: unsupported character card format");
    expect(result.warnings).toContain("Skipped nameless-v2.json: unsupported character card format");
    expect(result.warnings.find((warning) => warning.startsWith("Skipped broken.json:"))).toBeDefined();
  });

  test("readCharacters preserves standard card fields without rewriting to internal shape", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.charactersDir, "full.json"),
      JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: "Full Card",
          system_prompt: "  prompt padding stays inside original card  ",
          character_book: {
            entries: [{ keys: ["greeting"], content: "  lore content  " }],
          },
          extensions: { untouched: true },
        },
      }),
    );

    const result = await readCharacters(rootDir);

    expect(result.characters[0]?.character).toEqual({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Full Card",
        system_prompt: "  prompt padding stays inside original card  ",
        character_book: {
          entries: [{ keys: ["greeting"], content: "  lore content  " }],
        },
        extensions: { untouched: true },
      },
    });
  });
```

- [ ] **Step 2: Run storage tests to verify they fail**

Run:

```bash
npx vitest run src/services/fileStorage.test.ts
```

Expected: FAIL because `ListedCharacter` has no `id` and storage still accepts old internal cards.

- [ ] **Step 3: Update storage implementation**

In `src/services/fileStorage.ts`:

1. Change imports:

```ts
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { normalizeStandardCharacterCard } from "@/lib/characterCards";
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";
```

2. Change `ListedCharacter`:

```ts
export type ListedCharacter = {
  id: string;
  fileName: string;
  character: StandardCharacterCard;
};
```

3. Replace the body of `readCharacters()` with:

```ts
export async function readCharacters(
  rootDir: string,
): Promise<{ characters: ListedCharacter[]; warnings: string[] }> {
  const paths = await ensureDataDirs(rootDir);
  const warnings: string[] = [];
  const characters: ListedCharacter[] = [];
  const fileNames = (await readdir(paths.charactersDir)).filter((fileName) =>
    fileName.endsWith(".json"),
  );

  for (const fileName of fileNames.sort()) {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(join(paths.charactersDir, fileName), "utf8"),
      );
      const character = normalizeStandardCharacterCard(parsed);
      if (character === null) {
        warnings.push(`Skipped ${fileName}: unsupported character card format`);
        continue;
      }
      characters.push({ id: characterIdFromFileName(fileName), fileName, character });
    } catch (error) {
      warnings.push(`Skipped ${fileName}: ${errorMessage(error)}`);
    }
  }

  return { characters, warnings };
}

function characterIdFromFileName(fileName: string): string {
  return fileName.replace(/\.json$/u, "");
}
```

4. Delete the old `normalizeCharacterCard()` and `lorebookEntriesValue()` functions from `fileStorage.ts` because standard card interpretation now lives in `src/lib/characterCards.ts`.

- [ ] **Step 4: Run storage tests to verify they pass**

Run:

```bash
npx vitest run src/services/fileStorage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit storage task**

Run:

```bash
git add src/services/fileStorage.ts src/services/fileStorage.test.ts
git commit -m "feat: load standard character card files"
```

---

### Task 3: Update message construction and chat runtime

**Files:**
- Modify: `src/lib/messages.ts:1-51`
- Modify: `src/services/chatRuntime.ts:4-143`
- Modify: `src/services/chatRuntime.test.ts:20-298`

**Interfaces:**
- Consumes: `StandardCharacterCard`, `buildCharacterPromptParts()`, `getCharacterFirstMessage()`, `getCharacterName()` from Tasks 1-2.
- Produces: `createNewChat({ characterId, character })`, `sendChatMessage()` builds prompt from standard card fields and current context.

- [ ] **Step 1: Update failing runtime tests**

In `src/services/chatRuntime.test.ts`:

1. Replace the import line for types with:

```ts
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";
```

2. Replace the old `character` fixture with:

```ts
const character: StandardCharacterCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Misty Guide",
    description: "A guide from the fogbound city.",
    first_mes: "Welcome to the fog.",
    personality: "Careful and curious.",
    scenario: "The user arrives at an abandoned station.",
    mes_example: "User: Hello\nGuide: The mist answers.",
    system_prompt: "Keep the narration eerie.",
    post_history_instructions: "Remember the station layout.",
    character_book: {
      entries: [
        { keys: ["station"], content: "The station appears under a full moon.", enabled: true },
        { keys: ["sealed"], content: "Disabled entry", enabled: false },
      ],
    },
  },
};
```

3. Add `characterId: "misty-guide"` to every `createNewChat()` call:

```ts
const state = await createNewChat({
  rootDir,
  characterId: "misty-guide",
  character,
  now: () => new Date("2026-06-23T08:09:10.000Z"),
});
```

4. In the first test, change expected metadata to:

```ts
expect(state.chat).toEqual({
  id: expect.stringMatching(/^chat-20260623-080910-[a-z0-9]+$/u),
  characterId: "misty-guide",
  characterName: "Misty Guide",
  title: "Misty Guide - 2026-06-23 08:09",
  createdAt: "2026-06-23T08:09:10.000Z",
  updatedAt: "2026-06-23T08:09:10.000Z",
});
```

5. In `sendChatMessage appends user message...`, change the expected provider messages to include `system_prompt` and `post_history_instructions`:

```ts
expect(provider).toHaveBeenCalledWith({
  config,
  messages: [
    expect.objectContaining({ role: "system" }),
    expect.objectContaining({ role: "system" }),
    { role: "system", content: "Keep the narration eerie." },
    { role: "system", content: "A guide from the fogbound city." },
    { role: "system", content: "Careful and curious." },
    { role: "system", content: "The user arrives at an abandoned station." },
    { role: "system", content: "The station appears under a full moon." },
    { role: "system", content: "User: Hello\nGuide: The mist answers." },
    { role: "system", content: "Remember the station layout." },
    { role: "assistant", content: "Welcome to the fog." },
    { role: "user", content: "I enter the station." },
  ],
  onText: onAssistantText,
});
```

6. In the provider-failure test, replace `characterId: character.id` and `characterName: character.name` with:

```ts
characterId: "misty-guide",
characterName: "Misty Guide",
```

- [ ] **Step 2: Run runtime tests to verify they fail**

Run:

```bash
npx vitest run src/services/chatRuntime.test.ts
```

Expected: FAIL because `createNewChat()` does not accept `characterId` and runtime still reads old fields.

- [ ] **Step 3: Update message builder interface**

In `src/lib/messages.ts`:

1. Remove `CharacterCard` from the imports.
2. Change `BuildMessagesOptions` to:

```ts
type BuildMessagesOptions = {
  messages?: unknown;
  characterPromptParts?: string[];
  systemPrompts?: string[];
};
```

3. Change `buildMessages()` signature and body through the history append to:

```ts
export function buildMessages({
  messages = [],
  characterPromptParts = [],
  systemPrompts = [],
}: BuildMessagesOptions = {}): PromptMessage[] {
  const prompts = [
    ...DEFAULT_SYSTEM_PROMPTS,
    ...systemPrompts.filter((content) => content.trim() !== ""),
  ];
  const result: PromptMessage[] = prompts.map((content) => ({ role: "system", content }));

  for (const part of characterPromptParts) {
    if (part.trim() !== "") {
      result.push({ role: "system", content: part });
    }
  }

  result.push(...buildHistoryMessages(messages).map(({ role, content }) => ({ role, content })));
  return result;
}
```

- [ ] **Step 4: Update chat runtime implementation**

In `src/services/chatRuntime.ts`:

1. Add helper imports and type import:

```ts
import {
  buildCharacterPromptParts,
  getCharacterFirstMessage,
  getCharacterName,
} from "@/lib/characterCards";
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";
```

2. Change `CreateNewChatInput`:

```ts
type CreateNewChatInput = {
  rootDir: string;
  characterId: string;
  character: StandardCharacterCard;
  now?: Clock;
};
```

3. Change `SendChatMessageInput.character`:

```ts
character: StandardCharacterCard;
```

4. Change `createNewChat()` signature and metadata/opening logic:

```ts
export async function createNewChat({
  rootDir,
  characterId,
  character,
  now = () => new Date(),
}: CreateNewChatInput): Promise<RuntimeState> {
  const createdAt = now().toISOString();
  const id = `chat-${timestampId(createdAt)}-${uuidSegment()}`;
  const characterName = getCharacterName(character);
  const chat: ChatMetadata = {
    id,
    characterId,
    characterName,
    title: `${characterName} - ${titleTimestamp(createdAt)}`,
    createdAt,
    updatedAt: createdAt,
  };
  await writeChatMetadata(rootDir, chat);
  await createEmptyMessagesFile(rootDir, id);

  const messages: ChatMessage[] = [];
  const opening = getCharacterFirstMessage(character).trim();
  if (opening !== "") {
    const openingMessage: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: opening,
      createdAt,
    };
    await appendChatMessage(rootDir, id, openingMessage);
    messages.push(openingMessage);
  }

  return { chat, messages, warnings: [] };
}
```

5. Change the `buildMessages()` call inside `sendChatMessage()`:

```ts
messages: buildMessages({
  messages: withUser,
  characterPromptParts: buildCharacterPromptParts(character, { messages: withUser }),
  systemPrompts: config.systemPrompts,
}),
```

- [ ] **Step 5: Run runtime and message tests**

Run:

```bash
npx vitest run src/services/chatRuntime.test.ts src/lib/messages.test.ts src/lib/characterCards.test.ts
```

Expected: PASS. If `src/lib/messages.test.ts` does not exist, run:

```bash
npx vitest run src/services/chatRuntime.test.ts src/lib/characterCards.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit runtime task**

Run:

```bash
git add src/lib/messages.ts src/services/chatRuntime.ts src/services/chatRuntime.test.ts
git commit -m "feat: build prompts from standard character cards"
```

---

### Task 4: Update App and Ink components

**Files:**
- Modify: `src/App.tsx:5-355`
- Modify: `src/components/CharacterSelect.tsx:1-34`
- Modify: `src/components/ChatScreen.tsx:1-145`
- Modify: any affected `*.test.tsx` files under `src/` that assert old character labels.

**Interfaces:**
- Consumes: `ListedCharacter.id`, `StandardCharacterCard`, `getCharacterName()`.
- Produces: UI and selection flow that never reads old `character.name`, `character.id`, or `character.first_mes` top-level fields.

- [ ] **Step 1: Search for old character field reads**

Run:

```bash
grep -RInE 'character\.(id|name|first_mes|entries|description|personality|scenario|mes_example)|CharacterCard' src --exclude='*.d.ts'
```

Expected before implementation: hits in `src/App.tsx`, `src/components/CharacterSelect.tsx`, `src/components/ChatScreen.tsx`, possibly tests. These hits are the places this task must remove or update, except compatibility code in obsolete export tests handled later.

- [ ] **Step 2: Update `CharacterSelect`**

In `src/components/CharacterSelect.tsx`, add the helper import:

```ts
import { getCharacterName } from "@/lib/characterCards";
```

Replace the `items` mapping with:

```ts
const items: SelectItem[] = characters.map((item) => ({
  label: `${getCharacterName(item.character)} (${item.fileName})`,
  value: item,
}));
```

- [ ] **Step 3: Update `ChatScreen` props and display**

In `src/components/ChatScreen.tsx`:

1. Add helper import:

```ts
import { getCharacterName } from "@/lib/characterCards";
```

2. Replace the type import:

```ts
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";
```

3. Change prop type:

```ts
character: StandardCharacterCard | null;
```

4. Replace display reads:

```tsx
{character ? <Text color="magenta">Character: {getCharacterName(character)}</Text> : null}
```

and:

```tsx
assistantName={character ? getCharacterName(character) : "assistant"}
```

- [ ] **Step 4: Update `App` selected character state and runtime calls**

In `src/App.tsx`:

1. Replace old type import:

```ts
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";
```

2. Change state:

```ts
const [character, setCharacter] = useState<StandardCharacterCard | null>(null);
```

3. In `selectCharacter()`, pass file-derived id:

```ts
const nextState = await createNewChat({
  rootDir,
  characterId: item.id,
  character: item.character,
});
```

4. In `selectChat()`, match by `ListedCharacter.id`:

```ts
const matchingCharacter = characters.find(
  (candidate) => candidate.id === item.chat.characterId,
)?.character;
```

- [ ] **Step 5: Run UI/App tests or targeted typecheck**

Run:

```bash
npx vitest run src/App.test.tsx src/components/CharacterSelect.test.tsx src/components/ChatScreen.test.tsx
```

Expected: PASS if these files exist. If any file does not exist, Vitest reports no matching tests for that file; then run:

```bash
npm run lint
```

Expected: PASS with no TypeScript/oxlint errors.

- [ ] **Step 6: Re-run old field search**

Run:

```bash
grep -RInE 'character\.(id|name|first_mes|entries|description|personality|scenario|mes_example)|CharacterCard' src --exclude='*.d.ts'
```

Expected: no production-code hits for old top-level character fields. Remaining hits, if any, should be in tests or in `src/lib/charaCardV2.ts` scheduled for Task 5 cleanup.

- [ ] **Step 7: Commit UI task**

Run:

```bash
git add src/App.tsx src/components/CharacterSelect.tsx src/components/ChatScreen.tsx src/**/*.test.tsx
git commit -m "feat: use file-backed standard cards in UI"
```

If the shell does not expand `src/**/*.test.tsx`, add the specific changed test files instead.

---

### Task 5: Remove or repurpose old conversion utilities

**Files:**
- Modify or delete: `src/lib/charaCardV2.ts`
- Modify or delete: `src/lib/charaCardV2.test.ts`
- Modify: any imports in `src/lib/pngMetadata.ts`, `src/lib/export.ts`, or tests that depend on old `CharacterCard` conversion.

**Interfaces:**
- Consumes: Standard card types from Task 1.
- Produces: No production path that depends on converting standard cards to old internal `CharacterCard` shape.

- [ ] **Step 1: Locate conversion utility consumers**

Run:

```bash
grep -RIn 'fromCharaCardV2\|toCharaCardV2\|CharacterCard' src --exclude='*.d.ts'
```

Expected: hits in `src/lib/charaCardV2.ts`, `src/lib/charaCardV2.test.ts`, and possibly import/export helper tests. Use this list to update only active code paths.

- [ ] **Step 2: Decide cleanup shape based on consumers**

If `toCharaCardV2()` is only used by tests, delete `src/lib/charaCardV2.ts` and `src/lib/charaCardV2.test.ts`. If export helpers still need a v2 JSON builder, replace the old module with a narrow helper that accepts `StandardCharacterCard` and returns it unchanged for JSON export, because standard cards are already stored in export-ready shape.

Use this replacement if a module still imports from `src/lib/charaCardV2.ts`:

```ts
import type { StandardCharacterCard } from "@/types";

export function toStandardCharacterCard(character: StandardCharacterCard): StandardCharacterCard {
  return character;
}
```

- [ ] **Step 3: Update or remove tests**

If the module is deleted, delete `src/lib/charaCardV2.test.ts`. Coverage for v2/v3 parsing and helper behavior now lives in `src/lib/characterCards.test.ts`.

If the module is replaced with `toStandardCharacterCard()`, replace `src/lib/charaCardV2.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { toStandardCharacterCard } from "@/lib/charaCardV2";
import type { StandardCharacterCard } from "@/types";

describe("standard character card passthrough", () => {
  test("returns the original standard card without conversion", () => {
    const card: StandardCharacterCard = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { name: "Misty Guide", extensions: { untouched: true } },
    };

    expect(toStandardCharacterCard(card)).toBe(card);
  });
});
```

- [ ] **Step 4: Run conversion cleanup tests and full grep**

Run:

```bash
npx vitest run src/lib/characterCards.test.ts src/lib/charaCardV2.test.ts
```

If `src/lib/charaCardV2.test.ts` was deleted, run:

```bash
npx vitest run src/lib/characterCards.test.ts
```

Then run:

```bash
grep -RIn 'fromCharaCardV2\|toCharaCardV2\|type CharacterCard\|CharacterCard =' src --exclude='*.d.ts'
```

Expected: no hits for old conversion functions or old internal `CharacterCard` type.

- [ ] **Step 5: Commit cleanup task**

Run one of:

```bash
git add -A src/lib/charaCardV2.ts src/lib/charaCardV2.test.ts src/lib/characterCards.test.ts
git commit -m "refactor: remove internal character conversion"
```

or, if more consumers changed:

```bash
git add -A src
git commit -m "refactor: remove internal character conversion"
```

---

### Task 6: Update documentation and run full verification

**Files:**
- Modify: `README.md:41-80`
- Modify: any snapshots or examples that still show old internal character JSON.

**Interfaces:**
- Consumes: Final behavior from Tasks 1-5.
- Produces: README matching the new v2/v3-only standard card requirement.

- [ ] **Step 1: Update README Characters section**

Replace `README.md` lines 41-65 with:

```md
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
```

Then keep and adjust the lorebook subsection so it references `data.character_book.entries`:

```md
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
```

- [ ] **Step 2: Search docs/examples for old internal format**

Run:

```bash
grep -RInE '"id": "alice"|Character files must use this internal|opening_user_choices|"entries": \[' README.md docs src --exclude-dir=node_modules
```

Expected: no README text saying old internal shape is required. Hits for `opening_user_choices` in standard v2 examples and tests are OK.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run format
npm run lint
npm run test
npm run build
```

Expected:

- `npm run format`: PASS, no formatting diffs required.
- `npm run lint`: PASS, no oxlint/type-aware errors.
- `npm run test`: PASS, all Vitest tests pass.
- `npm run build`: PASS, `dist/cli.js` builds.

If `npm run format` fails because files need formatting, run `npm run format -- --write src README.md docs/superpowers/plans/2026-06-25-standard-character-cards.md` only if that script supports `--write`; otherwise run the repository's configured formatter command from `package.json`, then repeat all four verification commands.

- [ ] **Step 4: Commit docs and verification task**

Run:

```bash
git add README.md docs/superpowers/plans/2026-06-25-standard-character-cards.md
git commit -m "docs: document standard character cards"
```

If verification required formatting changes in source files, include those files in the same commit only if they are formatting-only changes produced by this task.

---

## Self-Review

- Spec coverage: Tasks cover v2/v3-only loading, no old internal or v1 compatibility, original card preservation, file-derived ids, helper-based UI/runtime access, prompt field ordering, lorebook matching fields, runtime metadata/resume implications, tests, and README updates.
- Placeholder scan: The plan does not use TBD/TODO/fill-in placeholders. Branching in Task 5 is explicit because consumer discovery determines whether the old conversion file can be deleted or must remain as a passthrough shim.
- Type consistency: `StandardCharacterCard`, `ListedCharacter.id`, `getCharacterName()`, `getCharacterFirstMessage()`, and `buildCharacterPromptParts()` are introduced before later tasks consume them. Runtime consistently receives `characterId` separately from the card data.

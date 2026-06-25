# Standard Character Card v2/v3 support design

## Summary

Yunwu CLI will treat `.yunwu/characters/*.json` files as standard Character Card documents instead of Yunwu-specific internal `CharacterCard` JSON. The app will support `chara_card_v2` and `chara_card_v3` files directly, preserve their original structure in memory, and interpret their fields at runtime when building chat metadata, opening messages, prompt messages, and lorebook injections.

This is a breaking change: the current Yunwu internal character JSON shape and v1/no-`spec` character cards will no longer be accepted as character files.

## Goals

- Accept standard `chara_card_v2` JSON files directly in `.yunwu/characters/`.
- Accept standard `chara_card_v3` JSON files directly in `.yunwu/characters/`.
- Preserve original v2/v3 card shape; do not convert to the old internal character format or overwrite user files.
- Use the card version and fields to build prompts and lorebook entries.
- Remove documentation that tells users to author Yunwu-specific internal character JSON.

## Non-goals

- No compatibility for the old Yunwu internal character file format.
- No compatibility for v1/no-`spec` character cards.
- No automatic migration or rewriting of existing character files.
- No backend or external import service.

## Character file format

`readCharacters()` will scan `.yunwu/characters/*.json` and accept only records that match one of these shapes:

- `spec: "chara_card_v2"` with a valid `data` object.
- `spec: "chara_card_v3"` with a valid `data` object.

Invalid, legacy, or unsupported files will be skipped with warnings. The loaded character list item will contain file-level metadata plus the original card:

- `fileName`: original JSON file name.
- `id`: file name without `.json`; this is Yunwu's stable runtime identifier for chat metadata.
- `character`: the original v2/v3 card object.

The app will not require or read a top-level card `id` field. `data.name` is required for display and chat metadata; files without a usable `data.name` will be skipped.

## Runtime interpretation helpers

A version-aware helper module, for example `src/lib/characterCards.ts`, will centralize access to card fields. It will expose helpers such as:

- `isCharaCardV2(value)`
- `isCharaCardV3(value)`
- `getCharacterName(character)`
- `getCharacterFirstMessage(character)`
- `getOpeningUserChoices(character)`
- `buildCharacterPromptParts(character)`
- `getCharacterBookEntries(character)`

UI and runtime code will use these helpers instead of reading top-level `character.id`, `character.name`, or `character.first_mes` fields.

## UI and chat metadata

Character selection will display `character.data.name`. Starting a chat will use:

- `characterId`: file-derived id.
- `characterName`: `character.data.name`.
- title: `character.data.name` plus the existing timestamp format.
- opening assistant message: `character.data.first_mes` when non-blank.

Resuming a chat will match `chat.characterId` against the file-derived character id from `ListedCharacter`. Because chat metadata binds to file names, renaming a character file can make older chats unable to resume until the file name or metadata is restored.

For opening user choices:

- v2 reads `data.opening_user_choices`.
- v3 reads `data.group_only_greetings`, matching the currently implemented v3 conversion behavior.

## Prompt construction

Prompt construction will interpret v2/v3 fields directly from `character.data`. The character-specific prompt order will be:

1. `data.system_prompt`
2. `data.description`
3. `data.personality`
4. `data.scenario`
5. matched and constant character book entries
6. `data.mes_example`
7. `data.post_history_instructions`
8. chat history

Global/default system prompts still remain before character-specific prompt parts. Blank string fields are omitted.

## Character book and lorebook matching

Lorebook matching will read from `data.character_book.entries`. It will support the standard fields that affect injection behavior:

- `enabled === false`: skip the entry.
- `constant === true`: always inject the entry.
- `keys`: primary matching keys.
- `selective === true` with `secondary_keys`: inject only when at least one primary key and at least one secondary key match.
- `case_sensitive`: choose case-sensitive or case-insensitive matching.
- `priority` and `insertion_order`: sort matched entries deterministically.
- `position`: preserve the field for interpretation, but initially inject matched entries as system messages in the fixed prompt position listed above.

The matcher will receive recent chat context, including the current user message, and decide which entries to inject. This replaces the current behavior that injects all enabled `character.entries` contents unconditionally.

## Error handling

- Unsupported character files are skipped with warnings naming the file.
- Malformed JSON keeps the existing warning behavior.
- v2/v3 files missing `data` or `data.name` are skipped with warnings.
- Runtime code should not throw because an optional v2/v3 field is missing; optional text fields become omitted prompt parts, and optional arrays become empty arrays.

## Tests

Add or update tests for:

1. `readCharacters()` accepting v2 JSON.
2. `readCharacters()` accepting v3 JSON.
3. `readCharacters()` skipping old Yunwu internal JSON.
4. `readCharacters()` skipping v1/no-`spec` JSON.
5. File-derived character ids.
6. Helpers for v2/v3 name, first message, and opening choices.
7. Prompt construction with `system_prompt`, description/personality/scenario, `mes_example`, and `post_history_instructions`.
8. Lorebook matching for `constant`, `enabled`, `selective`, `secondary_keys`, `case_sensitive`, and deterministic `priority`/`insertion_order` sorting.
9. Runtime chat creation using file-derived id and `data.name`.
10. Resume matching using file-derived ids instead of card top-level ids.

## Documentation updates

README's Characters section will be updated to say that `.yunwu/characters/` contains standard `chara_card_v2` or `chara_card_v3` JSON files. It will remove the old internal-format example and document that chat resume depends on the character file name-derived id.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import {
  appendChatMessage,
  ensureDataDirs,
  readCharacters,
  readChatMessages,
  readChatMetadataList,
  readCliConfig,
  writeChatMetadata,
  writeCliConfig,
} from "@/services/fileStorage";
import type { ChatMessage, ChatMetadata } from "@/types";

const tempDirs: string[] = [];

async function makeRootDir() {
  const rootDir = await mkdtemp(join(tmpdir(), "yunwu-cli-file-storage-"));
  tempDirs.push(rootDir);
  return rootDir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("fileStorage", () => {
  test("ensureDataDirs creates data, characters, chats, and messages directories and returns paths", async () => {
    const rootDir = await makeRootDir();

    const paths = await ensureDataDirs(rootDir);

    expect(paths).toEqual({
      dataDir: join(rootDir, ".yunwu"),
      configPath: join(rootDir, ".yunwu", "config.json"),
      charactersDir: join(rootDir, ".yunwu", "characters"),
      chatsDir: join(rootDir, ".yunwu", "chats"),
      messagesDir: join(rootDir, ".yunwu", "messages"),
    });
    await expect(
      writeFile(join(paths.charactersDir, "created.txt"), "ok"),
    ).resolves.toBeUndefined();
    await expect(writeFile(join(paths.chatsDir, "created.txt"), "ok")).resolves.toBeUndefined();
    await expect(writeFile(join(paths.messagesDir, "created.txt"), "ok")).resolves.toBeUndefined();
  });

  test("readCliConfig returns a missing-config error when config file is absent", async () => {
    const rootDir = await makeRootDir();

    const result = await readCliConfig(rootDir);

    expect(result).toEqual({
      config: null,
      errors: ["Missing config: .yunwu/config.json"],
    });
  });

  test("readCliConfig parses valid baseUrl, apiKey, model, and rounded maxTokens", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      paths.configPath,
      JSON.stringify({
        baseUrl: " https://api.example.com/v1/// ",
        apiKey: "secret-key",
        model: "example-model",
        maxTokens: 1024.7,
      }),
    );

    const result = await readCliConfig(rootDir);

    expect(result).toEqual({
      config: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "secret-key",
        model: "example-model",
        maxTokens: 1025,
      },
      errors: [],
    });
  });

  test("readCliConfig parses valid system prompts and drops blank entries", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      paths.configPath,
      JSON.stringify({
        baseUrl: "https://api.example.com/v1",
        apiKey: "secret-key",
        model: "example-model",
        systemPrompts: ["  first prompt  ", "   ", "second\nline"],
      }),
    );

    const result = await readCliConfig(rootDir);

    expect(result).toEqual({
      config: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "secret-key",
        model: "example-model",
        systemPrompts: ["  first prompt  ", "second\nline"],
      },
      errors: [],
    });
  });

  test("readCliConfig ignores malformed and all-blank system prompts", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      paths.configPath,
      JSON.stringify({
        baseUrl: "https://api.example.com/v1",
        apiKey: "secret-key",
        model: "example-model",
        systemPrompts: ["", "   ", 42, null],
      }),
    );

    const result = await readCliConfig(rootDir);

    expect(result).toEqual({
      config: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "secret-key",
        model: "example-model",
      },
      errors: [],
    });
  });

  test("writeCliConfig writes stable config JSON with system prompts", async () => {
    const rootDir = await makeRootDir();

    await writeCliConfig(rootDir, {
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "example-model",
      maxTokens: 2048,
      systemPrompts: ["first", "second\nline"],
    });

    const raw = await readFile(join(rootDir, ".yunwu", "config.json"), "utf8");
    expect(raw).toBe(`{
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "secret-key",
  "model": "example-model",
  "maxTokens": 2048,
  "systemPrompts": [
    "first",
    "second\\nline"
  ]
}
`);
  });

  test("writeCliConfig removes system prompts when only blank prompts remain", async () => {
    const rootDir = await makeRootDir();

    await writeCliConfig(rootDir, {
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "example-model",
      systemPrompts: ["", "   "],
    });

    const parsed = JSON.parse(await readFile(join(rootDir, ".yunwu", "config.json"), "utf8"));
    expect(parsed).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret-key",
      model: "example-model",
    });
  });

  test("readCliConfig returns an invalid JSON error when config cannot be parsed", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(paths.configPath, "{bad json");

    const result = await readCliConfig(rootDir);

    expect(result.config).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Invalid config JSON:/);
  });

  test("readCliConfig returns an invalid-shape error when required config fields are missing", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      paths.configPath,
      JSON.stringify({ baseUrl: "https://api.example.com/v1", apiKey: "secret-key" }),
    );

    const result = await readCliConfig(rootDir);

    expect(result).toEqual({
      config: null,
      errors: ["Invalid config: baseUrl, apiKey, and model are required"],
    });
  });

  test("readCharacters requires both id and name", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.charactersDir, "missing-id.json"),
      JSON.stringify({ name: "No ID" }),
    );
    await writeFile(
      join(paths.charactersDir, "missing-name.json"),
      JSON.stringify({ id: "char-no-name" }),
    );

    const result = await readCharacters(rootDir);

    expect(result.characters).toEqual([]);
    expect(result.warnings).toEqual([
      "Skipped missing-id.json: invalid character card",
      "Skipped missing-name.json: invalid character card",
    ]);
  });

  test("readCharacters reads character JSON, normalizes minimal cards, and skips bad JSON with a warning", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.charactersDir, "alice.json"),
      JSON.stringify({ id: "char-1", name: "Alice" }),
    );
    await writeFile(join(paths.charactersDir, "broken.json"), "{bad json");

    const result = await readCharacters(rootDir);

    expect(result.characters).toEqual([
      {
        fileName: "alice.json",
        character: {
          id: "char-1",
          name: "Alice",
          description: "",
          first_mes: "",
          personality: "",
          scenario: "",
          mes_example: "",
          alternate_greetings: [],
          opening_user_choices: [],
          entries: [],
          creator_notes: "",
          tags: [],
          creator: "",
          character_version: "",
        },
      },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^Skipped broken\.json:/);
  });

  test("readCharacters preserves freeform character whitespace", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.charactersDir, "alice.json"),
      JSON.stringify({
        id: "char-1",
        name: "Alice",
        description: "  description with intentional padding  ",
        first_mes: "\n  hello with surrounding whitespace  \n",
        entries: [{ keys: ["greeting"], content: "  lore content  " }],
      }),
    );

    const result = await readCharacters(rootDir);

    expect(result.characters[0]?.character.description).toBe(
      "  description with intentional padding  ",
    );
    expect(result.characters[0]?.character.first_mes).toBe(
      "\n  hello with surrounding whitespace  \n",
    );
    expect(result.characters[0]?.character.entries[0]?.content).toBe("  lore content  ");
  });

  test("readChatMetadataList validates required metadata fields", async () => {
    const rootDir = await makeRootDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.chatsDir, "missing-character-id.json"),
      JSON.stringify({
        id: "missing-character-id",
        characterName: "Alice",
        title: "Missing character ID",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    );
    await writeFile(
      join(paths.chatsDir, "missing-updated-at.json"),
      JSON.stringify({
        id: "missing-updated-at",
        characterId: "char-1",
        characterName: "Alice",
        title: "Missing updated at",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const result = await readChatMetadataList(rootDir);

    expect(result.chats).toEqual([]);
    expect(result.warnings).toEqual([
      "Skipped missing-character-id.json: invalid chat metadata",
      "Skipped missing-updated-at.json: invalid chat metadata",
    ]);
  });

  test("writeChatMetadata and readChatMetadataList write metadata, sort by updatedAt desc, and skip mismatched filenames", async () => {
    const rootDir = await makeRootDir();
    const older: ChatMetadata = {
      id: "older",
      characterId: "char-1",
      characterName: "Alice",
      title: "Older chat",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const newer: ChatMetadata = {
      id: "newer",
      characterId: "char-1",
      characterName: "Alice",
      title: "Newer chat",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };
    await writeChatMetadata(rootDir, older);
    await writeChatMetadata(rootDir, newer);
    const paths = await ensureDataDirs(rootDir);
    await writeFile(
      join(paths.chatsDir, "wrong-file.json"),
      JSON.stringify({ ...older, id: "different-id", title: "Should skip" }),
    );

    const result = await readChatMetadataList(rootDir);

    expect(result.chats).toEqual([
      { fileName: "newer.json", chat: newer },
      { fileName: "older.json", chat: older },
    ]);
    expect(result.warnings).toEqual(["Skipped wrong-file.json: chat id does not match filename"]);
  });

  test("writeChatMetadata rejects chat ids that cannot be safe filenames", async () => {
    const rootDir = await makeRootDir();
    const unsafeIds = ["", "../escape", "nested/chat", "..", "/absolute"];

    for (const unsafeId of unsafeIds) {
      const chat: ChatMetadata = {
        id: unsafeId,
        characterId: "char-1",
        characterName: "Alice",
        title: "Unsafe chat",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      };
      await expect(writeChatMetadata(rootDir, chat)).rejects.toThrow(
        `Invalid chat id for file path: ${unsafeId}`,
      );
    }
  });

  test("appendChatMessage and readChatMessages append JSONL, preserve order, skip bad lines, and warn for missing files", async () => {
    const rootDir = await makeRootDir();
    const first: ChatMessage = {
      id: "message-1",
      role: "user",
      content: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const second: ChatMessage = {
      id: "message-2",
      role: "assistant",
      content: "Hi",
      createdAt: "2026-01-01T00:00:01.000Z",
    };

    const missing = await readChatMessages(rootDir, "missing-chat");
    expect(missing).toEqual({
      messages: [],
      warnings: ["Missing messages file: missing-chat.jsonl"],
    });

    await appendChatMessage(rootDir, "chat-1", first);
    const paths = await ensureDataDirs(rootDir);
    await writeFile(join(paths.messagesDir, "chat-1.jsonl"), "not json\n", { flag: "a" });
    await appendChatMessage(rootDir, "chat-1", second);

    const result = await readChatMessages(rootDir, "chat-1");

    expect(result.messages).toEqual([first, second]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("line 2");
  });

  test("appendChatMessage and readChatMessages reject chat ids that cannot be safe filenames", async () => {
    const rootDir = await makeRootDir();
    const message: ChatMessage = {
      id: "message-1",
      role: "user",
      content: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const unsafeIds = ["", "../escape", "nested/chat", "..", "/absolute"];

    for (const unsafeId of unsafeIds) {
      await expect(appendChatMessage(rootDir, unsafeId, message)).rejects.toThrow(
        `Invalid chat id for file path: ${unsafeId}`,
      );
      await expect(readChatMessages(rootDir, unsafeId)).rejects.toThrow(
        `Invalid chat id for file path: ${unsafeId}`,
      );
    }
  });

  test("readChatMessages preserves message content whitespace", async () => {
    const rootDir = await makeRootDir();
    const message: ChatMessage = {
      id: "message-1",
      role: "user",
      content: "  hello with surrounding whitespace  ",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    await appendChatMessage(rootDir, "chat-1", message);

    const result = await readChatMessages(rootDir, "chat-1");

    expect(result.messages).toEqual([message]);
  });
});

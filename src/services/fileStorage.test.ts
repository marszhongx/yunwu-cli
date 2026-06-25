import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    expect(result.warnings).toContain(
      "Skipped nameless-v2.json: unsupported character card format",
    );
    expect(
      result.warnings.find((warning) => warning.startsWith("Skipped broken.json:")),
    ).toBeDefined();
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

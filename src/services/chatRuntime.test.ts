import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createNewChat, resumeChat, sendChatMessage } from "@/services/chatRuntime";
import {
  appendChatMessage,
  dataPaths,
  ensureDataDirs,
  readChatMessages,
  writeChatMetadata,
} from "@/services/fileStorage";
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "yunwu-chat-runtime-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

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

const config: CliConfig = {
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  model: "test-model",
};

describe("chat runtime", () => {
  it("createNewChat creates chat metadata and writes character opening message to JSONL", async () => {
    const rootDir = await makeTempDir();

    const state = await createNewChat({
      rootDir,
      characterId: "misty-guide",
      character,
      now: () => new Date("2026-06-23T08:09:10.000Z"),
    });

    expect(state.warnings).toEqual([]);
    expect(state.chat).toEqual({
      id: expect.stringMatching(/^chat-20260623-080910-[a-z0-9]+$/u),
      characterId: "misty-guide",
      characterName: "Misty Guide",
      title: "Misty Guide - 2026-06-23 08:09",
      createdAt: "2026-06-23T08:09:10.000Z",
      updatedAt: "2026-06-23T08:09:10.000Z",
    });
    expect(state.messages).toEqual([
      expect.objectContaining({
        role: "assistant",
        content: "Welcome to the fog.",
        createdAt: "2026-06-23T08:09:10.000Z",
      }),
    ]);
    expect(state.messages[0]?.id).toEqual(expect.any(String));

    const paths = dataPaths(rootDir);
    await expect(
      readFile(join(paths.chatsDir, `${state.chat.id}.json`), "utf8"),
    ).resolves.toContain('"title": "Misty Guide - 2026-06-23 08:09"');
    await expect(readChatMessages(rootDir, state.chat.id)).resolves.toEqual({
      messages: state.messages,
      warnings: [],
    });
  });

  it("createNewChat creates unique chat ids and files when called with the same timestamp", async () => {
    const rootDir = await makeTempDir();
    const now = () => new Date("2026-06-23T08:09:10.000Z");

    const first = await createNewChat({ rootDir, characterId: "misty-guide", character, now });
    const second = await createNewChat({ rootDir, characterId: "misty-guide", character, now });

    expect(first.chat.id).toMatch(/^chat-20260623-080910-[a-z0-9]+$/u);
    expect(second.chat.id).toMatch(/^chat-20260623-080910-[a-z0-9]+$/u);
    expect(second.chat.id).not.toBe(first.chat.id);

    const paths = dataPaths(rootDir);
    await expect(readdir(paths.chatsDir)).resolves.toEqual(
      expect.arrayContaining([`${first.chat.id}.json`, `${second.chat.id}.json`]),
    );
    await expect(readdir(paths.messagesDir)).resolves.toEqual(
      expect.arrayContaining([`${first.chat.id}.jsonl`, `${second.chat.id}.jsonl`]),
    );
  });

  it("resumeChat loads metadata and JSONL messages", async () => {
    const rootDir = await makeTempDir();
    const created = await createNewChat({
      rootDir,
      characterId: "misty-guide",
      character,
      now: () => new Date("2026-06-23T08:09:10.000Z"),
    });

    const resumed = await resumeChat({ rootDir, chatId: created.chat.id });

    expect(resumed).toEqual(created);
  });

  it("resumeChat rejects chat ids that cannot be safe filenames", async () => {
    const rootDir = await makeTempDir();
    const paths = await ensureDataDirs(rootDir);
    await writeFile(paths.configPath, "not chat metadata json");

    await expect(resumeChat({ rootDir, chatId: "../config" })).rejects.toThrow(
      "Invalid chat id for file path: ../config",
    );
  });

  it("sendChatMessage appends user message, calls requester with built messages, appends assistant response, and updates metadata", async () => {
    const rootDir = await makeTempDir();
    const created = await createNewChat({
      rootDir,
      characterId: "misty-guide",
      character,
      now: () => new Date("2026-06-23T08:09:10.000Z"),
    });
    const provider = vi.fn(async ({ onText }) => {
      onText?.("Assistant ");
      onText?.("response");
      return { text: "Assistant response" };
    });
    const onAssistantText = vi.fn();

    const state = await sendChatMessage({
      rootDir,
      config,
      character,
      chat: created.chat,
      messages: created.messages,
      content: "I enter the station.",
      now: () => new Date("2026-06-23T08:10:11.000Z"),
      requestProvider: provider,
      onAssistantText,
    });

    expect(provider).toHaveBeenCalledOnce();
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
    expect(onAssistantText).toHaveBeenNthCalledWith(1, "Assistant ");
    expect(onAssistantText).toHaveBeenNthCalledWith(2, "response");
    expect(state.chat).toEqual({ ...created.chat, updatedAt: "2026-06-23T08:10:11.000Z" });
    expect(state.messages).toEqual([
      ...created.messages,
      expect.objectContaining({
        role: "user",
        content: "I enter the station.",
        createdAt: "2026-06-23T08:10:11.000Z",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "Assistant response",
        createdAt: "2026-06-23T08:10:11.000Z",
      }),
    ]);

    await expect(readChatMessages(rootDir, created.chat.id)).resolves.toEqual({
      messages: state.messages,
      warnings: [],
    });
    const metadata = JSON.parse(
      await readFile(join(dataPaths(rootDir).chatsDir, `${created.chat.id}.json`), "utf8"),
    );
    expect(metadata.updatedAt).toBe("2026-06-23T08:10:11.000Z");
  });

  it("sendChatMessage preserves the user message on disk when provider fails", async () => {
    const rootDir = await makeTempDir();
    const chat: ChatMetadata = {
      id: "chat-existing",
      characterId: "misty-guide",
      characterName: "Misty Guide",
      title: "Existing chat",
      createdAt: "2026-06-23T08:00:00.000Z",
      updatedAt: "2026-06-23T08:00:00.000Z",
    };
    const existingMessages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "Welcome to the fog.",
        createdAt: "2026-06-23T08:00:00.000Z",
      },
    ];
    await writeChatMetadata(rootDir, chat);
    for (const message of existingMessages) {
      await appendChatMessage(rootDir, chat.id, message);
    }
    const provider = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      sendChatMessage({
        rootDir,
        config,
        character,
        chat,
        messages: existingMessages,
        content: "Can you hear me?",
        now: () => new Date("2026-06-23T08:10:11.000Z"),
        requestProvider: provider,
      }),
    ).rejects.toThrow("network down");

    await expect(readChatMessages(rootDir, chat.id)).resolves.toEqual({
      messages: [
        ...existingMessages,
        expect.objectContaining({
          role: "user",
          content: "Can you hear me?",
          createdAt: "2026-06-23T08:10:11.000Z",
        }),
      ],
      warnings: [],
    });
    const metadata = JSON.parse(
      await readFile(join(dataPaths(rootDir).chatsDir, `${chat.id}.json`), "utf8"),
    );
    expect(metadata.updatedAt).toBe("2026-06-23T08:10:11.000Z");
  });
});

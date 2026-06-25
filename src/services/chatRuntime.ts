import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildCharacterPromptParts,
  getCharacterFirstMessage,
  getCharacterName,
} from "@/lib/characterCards";
import { uuid } from "@/lib/ids";
import { buildMessages } from "@/lib/messages";
import { requestAssistantText, type ProviderMessage } from "@/services/aiClient";
import {
  appendChatMessage,
  dataPaths,
  ensureDataDirs,
  readChatMessages,
  safeChatFileName,
  writeChatMetadata,
} from "@/services/fileStorage";
import type { ChatMessage, ChatMetadata, CliConfig, StandardCharacterCard } from "@/types";

export type RuntimeState = {
  chat: ChatMetadata;
  messages: ChatMessage[];
  warnings: string[];
};

export type ProviderRequester = (input: {
  config: CliConfig;
  messages: ProviderMessage[];
  onText?: (chunk: string) => void;
}) => Promise<{ text: string }>;

type Clock = () => Date;

type CreateNewChatInput = {
  rootDir: string;
  characterId: string;
  character: StandardCharacterCard;
  now?: Clock;
};

type ResumeChatInput = {
  rootDir: string;
  chatId: string;
};

type SendChatMessageInput = {
  rootDir: string;
  config: CliConfig;
  character: StandardCharacterCard;
  chat: ChatMetadata;
  messages: ChatMessage[];
  content: string;
  now?: Clock;
  requestProvider?: ProviderRequester;
  onAssistantText?: (chunk: string) => void;
};

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

export async function resumeChat({ rootDir, chatId }: ResumeChatInput): Promise<RuntimeState> {
  const chatPath = join(dataPaths(rootDir).chatsDir, safeChatFileName(chatId, "json"));
  const chat = JSON.parse(await readFile(chatPath, "utf8")) as ChatMetadata;
  const { messages, warnings } = await readChatMessages(rootDir, chatId);
  return { chat, messages, warnings };
}

export async function sendChatMessage({
  rootDir,
  config,
  character,
  chat,
  messages,
  content,
  now = () => new Date(),
  requestProvider = requestAssistantText,
  onAssistantText,
}: SendChatMessageInput): Promise<RuntimeState> {
  const createdAt = now().toISOString();
  const userMessage: ChatMessage = {
    id: uuid(),
    role: "user",
    content,
    createdAt,
  };
  await appendChatMessage(rootDir, chat.id, userMessage);
  const chatWithUserUpdate: ChatMetadata = { ...chat, updatedAt: userMessage.createdAt };
  await writeChatMetadata(rootDir, chatWithUserUpdate);

  const withUser = [...messages, userMessage];
  const response = await requestProvider({
    config,
    messages: buildMessages({
      messages: withUser,
      characterPromptParts: buildCharacterPromptParts(character, { messages: withUser }),
      systemPrompts: config.systemPrompts,
    }),
    onText: onAssistantText,
  });

  const assistantMessage: ChatMessage = {
    id: uuid(),
    role: "assistant",
    content: response.text,
    createdAt,
  };
  await appendChatMessage(rootDir, chat.id, assistantMessage);

  const updatedChat: ChatMetadata = {
    ...chatWithUserUpdate,
    updatedAt: assistantMessage.createdAt,
  };
  await writeChatMetadata(rootDir, updatedChat);

  return { chat: updatedChat, messages: [...withUser, assistantMessage], warnings: [] };
}

async function createEmptyMessagesFile(rootDir: string, chatId: string): Promise<void> {
  const paths = await ensureDataDirs(rootDir);
  await writeFile(join(paths.messagesDir, safeChatFileName(chatId, "jsonl")), "");
}

function timestampId(isoString: string): string {
  return isoString.slice(0, 19).replace(/[-:]/gu, "").replace("T", "-");
}

function titleTimestamp(isoString: string): string {
  return isoString.slice(0, 16).replace("T", " ");
}

function uuidSegment(): string {
  return uuid()
    .replace(/[^a-z0-9]/giu, "")
    .slice(0, 8)
    .toLowerCase();
}

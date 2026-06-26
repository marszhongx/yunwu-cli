import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { normalizeStandardCard } from "@/lib/characterCards";
import type { ChatMessage, ChatMetadata, CliConfig, StandardCard } from "@/types";

export type ListedCharacter = {
  id: string;
  fileName: string;
  character: StandardCard;
};

export type ListedChat = {
  fileName: string;
  chat: ChatMetadata;
};

type DataPaths = {
  dataDir: string;
  configPath: string;
  charactersDir: string;
  chatsDir: string;
  messagesDir: string;
};

export function dataPaths(rootDir: string): DataPaths {
  const dataDir = join(rootDir, ".yunwu");
  return {
    dataDir,
    configPath: join(dataDir, "config.json"),
    charactersDir: join(dataDir, "characters"),
    chatsDir: join(dataDir, "chats"),
    messagesDir: join(dataDir, "messages"),
  };
}

export async function ensureDataDirs(rootDir: string): Promise<DataPaths> {
  const paths = dataPaths(rootDir);
  await mkdir(paths.charactersDir, { recursive: true });
  await mkdir(paths.chatsDir, { recursive: true });
  await mkdir(paths.messagesDir, { recursive: true });
  return paths;
}

export async function readCliConfig(
  rootDir: string,
): Promise<{ config: CliConfig | null; errors: string[] }> {
  const paths = dataPaths(rootDir);
  let raw: string;
  try {
    raw = await readFile(paths.configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { config: null, errors: ["Missing config: .yunwu/config.json"] };
    }
    return { config: null, errors: [`Failed to read config: ${errorMessage(error)}`] };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const config = normalizeCliConfig(parsed);
    if (config === null) {
      return { config: null, errors: ["Invalid config: baseUrl, apiKey, and model are required"] };
    }
    return { config, errors: [] };
  } catch (error) {
    return { config: null, errors: [`Invalid config JSON: ${errorMessage(error)}`] };
  }
}

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
      const character = normalizeStandardCard(parsed);
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

export async function readChatMetadataList(
  rootDir: string,
): Promise<{ chats: ListedChat[]; warnings: string[] }> {
  const paths = await ensureDataDirs(rootDir);
  const warnings: string[] = [];
  const chats: ListedChat[] = [];
  const fileNames = (await readdir(paths.chatsDir)).filter((fileName) =>
    fileName.endsWith(".json"),
  );

  for (const fileName of fileNames.sort()) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(paths.chatsDir, fileName), "utf8"));
      const chat = normalizeChatMetadata(parsed);
      if (chat === null) {
        warnings.push(`Skipped ${fileName}: invalid chat metadata`);
        continue;
      }
      if (`${chat.id}.json` !== fileName) {
        warnings.push(`Skipped ${fileName}: chat id does not match filename`);
        continue;
      }
      chats.push({ fileName, chat });
    } catch (error) {
      warnings.push(`Skipped ${fileName}: ${errorMessage(error)}`);
    }
  }

  chats.sort((left, right) => right.chat.updatedAt.localeCompare(left.chat.updatedAt));
  return { chats, warnings };
}

export async function writeChatMetadata(rootDir: string, chat: ChatMetadata): Promise<void> {
  const paths = await ensureDataDirs(rootDir);
  const fileName = safeChatFileName(chat.id, "json");
  await writeFile(
    join(paths.chatsDir, fileName),
    `${JSON.stringify(chat, null, 2)}
`,
  );
}

export async function readChatMessages(
  rootDir: string,
  chatId: string,
): Promise<{ messages: ChatMessage[]; warnings: string[] }> {
  const paths = await ensureDataDirs(rootDir);
  const fileName = safeChatFileName(chatId, "jsonl");
  let raw: string;
  try {
    raw = await readFile(join(paths.messagesDir, fileName), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { messages: [], warnings: [`Missing messages file: ${fileName}`] };
    }
    return { messages: [], warnings: [`Failed to read ${fileName}: ${errorMessage(error)}`] };
  }

  const messages: ChatMessage[] = [];
  const warnings: string[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") {
      return;
    }
    const lineNumber = index + 1;
    try {
      const message = normalizeChatMessage(JSON.parse(line));
      if (message === null) {
        warnings.push(`Skipped ${fileName} line ${lineNumber}: invalid chat message`);
        return;
      }
      messages.push(message);
    } catch (error) {
      warnings.push(`Skipped ${fileName} line ${lineNumber}: ${errorMessage(error)}`);
    }
  });

  return { messages, warnings };
}

export async function appendChatMessage(
  rootDir: string,
  chatId: string,
  message: ChatMessage,
): Promise<void> {
  const paths = await ensureDataDirs(rootDir);
  const fileName = safeChatFileName(chatId, "jsonl");
  await appendFile(
    join(paths.messagesDir, fileName),
    `${JSON.stringify(message)}
`,
  );
}

function normalizeCliConfig(value: unknown): CliConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  const baseUrl = stringValue(value.baseUrl)?.replace(/\/+$/u, "");
  const apiKey = stringValue(value.apiKey);
  const model = stringValue(value.model);
  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  const config: CliConfig = { baseUrl, apiKey, model };
  if (
    typeof value.maxTokens === "number" &&
    Number.isFinite(value.maxTokens) &&
    value.maxTokens > 0
  ) {
    config.maxTokens = Math.round(value.maxTokens);
  }
  return config;
}

function normalizeChatMetadata(value: unknown): ChatMetadata | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  const characterId = stringValue(value.characterId);
  const characterName = stringValue(value.characterName);
  const title = stringValue(value.title);
  const createdAt = stringValue(value.createdAt);
  const updatedAt = stringValue(value.updatedAt);
  if (!id || !characterId || !characterName || !title || !createdAt || !updatedAt) {
    return null;
  }
  return { id, characterId, characterName, title, createdAt, updatedAt };
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  const content = exactStringValue(value.content);
  const createdAt = stringValue(value.createdAt);
  if (!id || !isMessageRole(value.role) || content === undefined || !createdAt) {
    return null;
  }
  return { id, role: value.role, content, createdAt };
}

export function safeChatFileName(chatId: string, ext: "json" | "jsonl"): string {
  if (
    chatId === "" ||
    chatId === ".." ||
    chatId.includes("/") ||
    chatId.includes("\\") ||
    chatId.includes("..") ||
    isAbsolute(chatId)
  ) {
    throw new Error(`Invalid chat id for file path: ${chatId}`);
  }
  return `${chatId}.${ext}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function exactStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isMessageRole(value: unknown): value is ChatMessage["role"] {
  return value === "user" || value === "assistant";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

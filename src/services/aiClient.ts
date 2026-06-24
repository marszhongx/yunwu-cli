import { chat } from "@tanstack/ai";
import { createOpenaiChatCompletions } from "@tanstack/ai-openai";

import type { CliConfig } from "@/types";

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AssistantTextInput = {
  config: CliConfig;
  messages: ProviderMessage[];
  onText?: (chunk: string) => void;
};

type OpenaiChatCompletionsFactory = (
  model: string,
  apiKey: string,
  config: { baseURL: string },
) => unknown;

type ChatOptions = {
  adapter: unknown;
  systemPrompts: string[];
  messages: ProviderMessage[];
  modelOptions?: { max_tokens: number };
};

type ChatFunction = (options: ChatOptions) => AsyncIterable<unknown>;

export async function requestAssistantText({
  config,
  messages,
  onText,
}: AssistantTextInput): Promise<{ text: string }> {
  const adapter = (createOpenaiChatCompletions as OpenaiChatCompletionsFactory)(
    config.model,
    config.apiKey,
    {
      baseURL: config.baseUrl,
    },
  );
  const systemPrompts = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const conversationMessages = messages.filter((message) => message.role !== "system");
  const stream = (chat as ChatFunction)({
    adapter,
    systemPrompts,
    messages: conversationMessages,
    ...(config.maxTokens ? { modelOptions: { max_tokens: config.maxTokens } } : {}),
  });

  let text = "";

  for await (const chunk of stream) {
    throwIfErrorChunk(chunk);
    const chunkText = getChunkText(chunk);
    text += chunkText;
    if (chunkText !== "") {
      onText?.(chunkText);
    }
  }

  if (text === "") {
    throw new Error("Provider returned an empty response");
  }

  return { text };
}

function getChunkText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (typeof chunk !== "object" || chunk === null) {
    return "";
  }

  const chunkFields = chunk as Record<string, unknown>;

  if ("type" in chunkFields) {
    if (chunkFields.type === "TEXT_MESSAGE_CONTENT") {
      return typeof chunkFields.delta === "string" ? chunkFields.delta : "";
    }

    if (chunkFields.type === "text-delta") {
      return typeof chunkFields.textDelta === "string" ? chunkFields.textDelta : "";
    }

    return "";
  }

  for (const field of ["textDelta", "text", "content", "delta"] as const) {
    const value = chunk[field as keyof typeof chunk];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function throwIfErrorChunk(chunk: unknown): void {
  if (typeof chunk !== "object" || chunk === null) {
    return;
  }

  const chunkFields = chunk as Record<string, unknown>;

  if (chunkFields.type !== "RUN_ERROR" && chunkFields.type !== "error") {
    return;
  }

  const providerError = readProviderError(chunkFields.error);
  const error = new Error(providerError.message);

  if (providerError.code) {
    (error as Error & { code?: string }).code = providerError.code;
  }

  throw error;
}

function readProviderError(error: unknown): { message: string; code?: string } {
  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error !== "object" || error === null) {
    return { message: "Provider stream failed" };
  }

  const errorFields = error as Record<string, unknown>;
  const message =
    typeof errorFields.message === "string" ? errorFields.message : "Provider stream failed";
  const code = typeof errorFields.code === "string" ? errorFields.code : undefined;

  return { message, code };
}

import { beforeEach, expect, it, vi } from "vitest";
import type { CliConfig } from "@/types";

const chatMock = vi.fn();
const createOpenaiChatCompletionsMock = vi.fn();

vi.mock("@tanstack/ai", () => ({ chat: chatMock }));
vi.mock("@tanstack/ai-openai", () => ({
  createOpenaiChatCompletions: createOpenaiChatCompletionsMock,
}));

async function* textStream(text: string): AsyncIterable<unknown> {
  if (text === "") {
    return;
  }

  yield { type: "text-delta", textDelta: text };
}

const config: CliConfig = {
  baseUrl: "https://api.example.test/v1",
  apiKey: "test-api-key",
  model: "test-model",
  maxTokens: 512,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  createOpenaiChatCompletionsMock.mockReturnValue("adapter");
});

it("creates an OpenAI Chat Completions adapter and sends split system and conversation messages to chat", async () => {
  chatMock.mockReturnValue(textStream("Hello from the assistant"));
  const { requestAssistantText } = await import("@/services/aiClient");

  const result = await requestAssistantText({
    config,
    messages: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "system", content: "Keep answers short." },
    ],
  });

  expect(createOpenaiChatCompletionsMock).toHaveBeenCalledWith("test-model", "test-api-key", {
    baseURL: "https://api.example.test/v1",
  });
  expect(chatMock).toHaveBeenCalledWith({
    adapter: "adapter",
    systemPrompts: ["You are helpful.", "Keep answers short."],
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
    modelOptions: { max_tokens: 512 },
  });
  expect(result).toEqual({ text: "Hello from the assistant" });
});

it("calls onText for each supported stream chunk", async () => {
  async function* chunks(): AsyncIterable<unknown> {
    yield { type: "text-delta", textDelta: "雾" };
    yield { type: "text-delta", textDelta: "来了" };
  }

  chatMock.mockReturnValue(chunks());
  const { requestAssistantText } = await import("@/services/aiClient");
  const onText = vi.fn();

  const result = await requestAssistantText({
    config,
    messages: [{ role: "user", content: "前进" }],
    onText,
  });

  expect(onText).toHaveBeenNthCalledWith(1, "雾");
  expect(onText).toHaveBeenNthCalledWith(2, "来了");
  expect(result).toEqual({ text: "雾来了" });
});

it("collects supported stream chunk text fields into a final text result", async () => {
  async function* chunks(): AsyncIterable<unknown> {
    yield "Hello";
    yield { textDelta: " " };
    yield { text: "from" };
    yield { content: " TanStack" };
    yield { delta: " AI" };
  }

  chatMock.mockReturnValue(chunks());
  const { requestAssistantText } = await import("@/services/aiClient");

  const result = await requestAssistantText({
    config: { ...config, maxTokens: undefined },
    messages: [{ role: "user", content: "Say hello" }],
  });

  expect(chatMock).toHaveBeenCalledWith({
    adapter: "adapter",
    systemPrompts: [],
    messages: [{ role: "user", content: "Say hello" }],
  });
  expect(result).toEqual({ text: "Hello from TanStack AI" });
});

it("collects only delta text from TanStack text message content chunks", async () => {
  async function* chunks(): AsyncIterable<unknown> {
    yield { type: "TEXT_MESSAGE_CONTENT", delta: "Hel", content: "Hel" };
    yield { type: "TEXT_MESSAGE_CONTENT", delta: "lo", content: "Hello" };
    yield { type: "TEXT_MESSAGE_CONTENT", delta: "!", content: "Hello!" };
  }

  chatMock.mockReturnValue(chunks());
  const { requestAssistantText } = await import("@/services/aiClient");

  const result = await requestAssistantText({
    config,
    messages: [{ role: "user", content: "Say hello" }],
  });

  expect(result).toEqual({ text: "Hello!" });
});

it("throws provider stream errors with message and code", async () => {
  async function* chunks(): AsyncIterable<unknown> {
    yield { type: "text-delta", textDelta: "partial" };
    yield {
      type: "RUN_ERROR",
      error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" },
    };
  }

  chatMock.mockReturnValue(chunks());
  const { requestAssistantText } = await import("@/services/aiClient");

  await expect(
    requestAssistantText({
      config,
      messages: [{ role: "user", content: "Hello" }],
    }),
  ).rejects.toMatchObject({
    message: "Rate limit exceeded",
    code: "rate_limit_exceeded",
  });
});

it("throws lowercase provider error chunks with message and code", async () => {
  async function* chunks(): AsyncIterable<unknown> {
    yield {
      type: "error",
      error: { message: "Bad request", code: "invalid_request_error" },
    };
  }

  chatMock.mockReturnValue(chunks());
  const { requestAssistantText } = await import("@/services/aiClient");

  await expect(
    requestAssistantText({
      config,
      messages: [{ role: "user", content: "Hello" }],
    }),
  ).rejects.toMatchObject({
    message: "Bad request",
    code: "invalid_request_error",
  });
});

it("throws when the provider stream has no text", async () => {
  chatMock.mockReturnValue(textStream(""));
  const { requestAssistantText } = await import("@/services/aiClient");

  await expect(
    requestAssistantText({
      config,
      messages: [{ role: "user", content: "Hello" }],
    }),
  ).rejects.toThrow("Provider returned an empty response");
});

import { render } from "ink-testing-library";
import { beforeEach, expect, test, vi } from "vitest";

import App from "@/App";
import { readCharacters, readChatMetadataList, readCliConfig } from "@/services/fileStorage";
import { createNewChat, resumeChat, sendChatMessage } from "@/services/chatRuntime";
import type { CharacterCard, ChatMessage, ChatMetadata, CliConfig } from "@/types";

vi.mock("@/services/fileStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fileStorage")>();
  return {
    ...actual,
    readCharacters: vi.fn(),
    readChatMetadataList: vi.fn(),
    readCliConfig: vi.fn(),
  };
});

vi.mock("@/services/chatRuntime", () => ({
  createNewChat: vi.fn(),
  resumeChat: vi.fn(),
  sendChatMessage: vi.fn(),
}));

const readCharactersMock = vi.mocked(readCharacters);
const readChatMetadataListMock = vi.mocked(readChatMetadataList);
const readCliConfigMock = vi.mocked(readCliConfig);
const createNewChatMock = vi.mocked(createNewChat);
const resumeChatMock = vi.mocked(resumeChat);
const sendChatMessageMock = vi.mocked(sendChatMessage);

beforeEach(() => {
  vi.clearAllMocks();
  readCliConfigMock.mockResolvedValue({ config: config(), errors: [] });
  readCharactersMock.mockResolvedValue({ characters: [], warnings: [] });
  readChatMetadataListMock.mockResolvedValue({ chats: [], warnings: [] });
  createNewChatMock.mockResolvedValue(runtimeState());
  resumeChatMock.mockResolvedValue(runtimeState());
  sendChatMessageMock.mockResolvedValue(
    runtimeState({
      messages: [message("user-1", "user", "hello"), message("assistant-1", "assistant", "hi")],
    }),
  );
});

test("missing config instructions render", () => {
  const { lastFrame } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={null}
      initialConfigErrors={["Missing config: .yunwu/config.json"]}
      initialCharacters={[]}
      initialChats={[]}
    />,
  );

  expect(lastFrame()).toContain("Missing config: .yunwu/config.json");
  expect(lastFrame()).toContain("Create .yunwu/config.json");
});

test("empty state shows /new and /resume", () => {
  const { lastFrame } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[]}
      initialChats={[]}
    />,
  );

  expect(lastFrame()).toContain("No active chat");
  expect(lastFrame()).toContain("/new");
  expect(lastFrame()).toContain("/resume");
});

test("submitting /new opens character selector", async () => {
  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[]}
    />,
  );

  stdin.write("/new");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /new"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("Select a character"));
  expect(lastFrame()).toContain("云雀");
});

test("submitting /resume opens chat selector", async () => {
  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[listedChat()]}
    />,
  );

  stdin.write("/resume");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /resume"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("Select a chat"));
  expect(lastFrame()).toContain("山间旅途");
});

test("submitting while generating ignores overlapping sends", async () => {
  let resolveSend: (value: Awaited<ReturnType<typeof sendChatMessage>>) => void = () => {};
  sendChatMessageMock.mockReturnValue(
    new Promise((resolve) => {
      resolveSend = resolve;
    }),
  );

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[]}
    />,
  );

  stdin.write("/new");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /new"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a character"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Character: 云雀"));

  stdin.write("hello");
  await vi.waitFor(() => expect(lastFrame()).toContain("> hello"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Generating ⠋ 0s"));

  expect(lastFrame()).toContain("You:\nhello");

  stdin.write("second message");
  await vi.waitFor(() => expect(lastFrame()).toContain("> second message"));
  stdin.write("\r");

  expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
  resolveSend(
    runtimeState({
      messages: [message("user-1", "user", "hello"), message("assistant-1", "assistant", "hi")],
    }),
  );
  await vi.waitFor(() => expect(lastFrame()).toContain("云雀:\nhi"));
});

test("streams assistant text into the visible draft message before the send finishes", async () => {
  sendChatMessageMock.mockImplementation(({ onAssistantText }) => {
    onAssistantText?.("<content>雾");
    return new Promise(() => {});
  });

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[]}
    />,
  );

  stdin.write("/new");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /new"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a character"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Character: 云雀"));

  stdin.write("前进");
  await vi.waitFor(() => expect(lastFrame()).toContain("> 前进"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("You:\n前进"));
  await vi.waitFor(() => expect(lastFrame()).toContain("云雀:\n雾"));
});

test("failed sends reload the active chat so the persisted user message remains visible", async () => {
  const initialState = runtimeState({
    messages: [message("assistant-opening", "assistant", "你好。")],
  });
  createNewChatMock.mockResolvedValue(initialState);
  sendChatMessageMock.mockRejectedValue(new Error("provider unavailable"));
  resumeChatMock.mockResolvedValue(
    runtimeState({
      messages: [
        message("assistant-opening", "assistant", "你好。"),
        message("user-1", "user", "hello"),
      ],
    }),
  );

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[]}
    />,
  );

  stdin.write("/new");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /new"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a character"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Character: 云雀"));

  stdin.write("hello");
  await vi.waitFor(() => expect(lastFrame()).toContain("> hello"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("Error: provider unavailable"));
  expect(lastFrame()).toContain("You:\nhello");
  expect(resumeChatMock).toHaveBeenCalledWith({ rootDir: "/tmp/yunwu-test", chatId: "chat-1" });
});

test("/resume refreshes characters before resolving selected chat", async () => {
  readCharactersMock.mockResolvedValue({ characters: [listedCharacter()], warnings: [] });
  readChatMetadataListMock.mockResolvedValue({ chats: [listedChat()], warnings: [] });
  resumeChatMock.mockResolvedValue(
    runtimeState({ messages: [message("assistant-1", "assistant", "welcome")] }),
  );

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[]}
    />,
  );

  stdin.write("/resume");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /resume"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a chat"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("Character: 云雀"));
  expect(lastFrame()).toContain("云雀:\nwelcome");
  expect(readCharactersMock).toHaveBeenCalledTimes(1);
  expect(resumeChatMock).toHaveBeenCalledWith({ rootDir: "/tmp/yunwu-test", chatId: "chat-1" });
});

test("empty Enter after messages change to no choices does not submit stale choices", async () => {
  let resolveSend: (value: Awaited<ReturnType<typeof sendChatMessage>>) => void = () => {};
  createNewChatMock.mockResolvedValue(runtimeState({ messages: [choiceMessage()] }));
  sendChatMessageMock.mockReturnValue(
    new Promise((resolve) => {
      resolveSend = resolve;
    }),
  );

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[]}
    />,
  );

  await startChatWithChoices(lastFrame, stdin);

  stdin.write("继续");
  await vi.waitFor(() => expect(lastFrame()).toContain("> 继续"));
  stdin.write("\r");
  await vi.waitFor(() => expect(sendChatMessageMock).toHaveBeenCalledTimes(1));

  resolveSend(
    runtimeState({
      messages: [message("assistant-no-choice", "assistant", "没有选项。")],
    }),
  );
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("没有选项。"));
  expect(lastFrame()).not.toContain("A: 走左边");
  expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
});

test("empty Enter after resuming a no-choice chat does not submit stale choices", async () => {
  createNewChatMock.mockResolvedValue(runtimeState({ messages: [choiceMessage()] }));
  readCharactersMock.mockResolvedValue({ characters: [listedCharacter()], warnings: [] });
  readChatMetadataListMock.mockResolvedValue({ chats: [listedChat()], warnings: [] });
  resumeChatMock.mockResolvedValue(
    runtimeState({ messages: [message("assistant-no-choice", "assistant", "没有选项。")] }),
  );

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
    />,
  );

  await startChatWithChoices(lastFrame, stdin);

  stdin.write("/resume");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /resume"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a chat"));
  stdin.write("\r");
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("没有选项。"));
  expect(lastFrame()).not.toContain("A: 走左边");
  expect(sendChatMessageMock).not.toHaveBeenCalled();
});

test("startup load failure shows an actionable error", async () => {
  readCliConfigMock.mockRejectedValue(new Error("disk unavailable"));

  const { lastFrame } = render(<App rootDir="/tmp/yunwu-test" />);

  await vi.waitFor(() =>
    expect(lastFrame()).toContain("Error: Failed to load initial data: disk unavailable"),
  );
});

test("/help shows command help without duplicating warning text", async () => {
  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[]}
      initialChats={[]}
    />,
  );

  stdin.write("/help");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /help"));
  stdin.write("\r");
  await vi.waitFor(() => expect(commandHelpCount(lastFrame())).toBe(1));

  stdin.write("/help");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /help"));
  stdin.write("\r");

  await vi.waitFor(() => expect(commandHelpCount(lastFrame())).toBe(1));
});

test("assistant XML choices render without raw tags and can be selected with arrow keys", async () => {
  sendChatMessageMock.mockReturnValue(new Promise(() => {}));
  createNewChatMock.mockResolvedValue(
    runtimeState({
      messages: [
        message(
          "assistant-xml",
          "assistant",
          `<content>正文内容</content><summary>剧情摘要</summary><choices>A: 选择一\nB: 选择二</choices>`,
        ),
      ],
    }),
  );

  const { lastFrame, stdin } = render(
    <App
      rootDir="/tmp/yunwu-test"
      initialConfig={config()}
      initialConfigErrors={[]}
      initialCharacters={[listedCharacter()]}
      initialChats={[]}
    />,
  );

  stdin.write("/new");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /new"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a character"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("正文内容"));
  expect(lastFrame()).toContain("※ 剧情摘要");
  expect(lastFrame()).toContain("> A: 选择一");
  expect(lastFrame()).toContain("  B: 选择二");
  expect(lastFrame()).not.toContain("<content>");

  stdin.write("[B");
  await vi.waitFor(() => expect(lastFrame()).toContain("> B: 选择二"));
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("You:\nB: 选择二"));
  expect(lastFrame()).not.toContain("> B: 选择二");
  expect(lastFrame()).not.toContain("  A: 选择一");
  expect(sendChatMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ content: "B: 选择二" }),
  );
});

function config(): CliConfig {
  return {
    baseUrl: "https://example.test/v1",
    apiKey: "test-key",
    model: "test-model",
  };
}

function listedCharacter(overrides: Partial<CharacterCard> = {}) {
  return {
    fileName: "char-1.json",
    character: character(overrides),
  };
}

function listedChat(overrides: Partial<ChatMetadata> = {}) {
  return {
    fileName: "chat-1.json",
    chat: {
      id: "chat-1",
      characterId: "char-1",
      characterName: "云雀",
      title: "山间旅途",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

function character(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: "char-1",
    name: "云雀",
    description: "山间角色",
    first_mes: "你好。",
    personality: "温和",
    scenario: "山间",
    mes_example: "",
    alternate_greetings: [],
    opening_user_choices: [],
    entries: [],
    creator_notes: "",
    tags: [],
    creator: "",
    character_version: "",
    ...overrides,
  };
}

function runtimeState(
  overrides: { chat?: ChatMetadata; messages?: ChatMessage[]; warnings?: string[] } = {},
) {
  return {
    chat: overrides.chat ?? listedChat().chat,
    messages: overrides.messages ?? [message("assistant-opening", "assistant", "你好。")],
    warnings: overrides.warnings ?? [],
  };
}

function choiceMessage(): ChatMessage {
  return message(
    "assistant-choice",
    "assistant",
    `<content>选择一条路。</content><choices>A: 走左边
B: 走右边</choices>`,
  );
}

async function startChatWithChoices(
  lastFrame: () => string | undefined,
  stdin: { write: (text: string) => void },
) {
  stdin.write("/new");
  await vi.waitFor(() => expect(lastFrame()).toContain("> /new"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("Select a character"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("> A: 走左边"));
}

function message(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id,
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function commandHelpCount(frame: string | undefined): number {
  return (
    frame?.match(
      /Warning: Commands: \/new creates a chat, \/resume opens saved chats, \/exit quits\./gu,
    )?.length ?? 0
  );
}

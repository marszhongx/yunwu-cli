import { act } from "react";
import { render } from "ink-testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { ChatScreen } from "@/components/ChatScreen";
import type { ChatMessage, ChatMetadata, CliConfig, StandardCard } from "@/types";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

afterEach(() => {
  vi.useRealTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("renders blank lines between adjacent chat messages", () => {
  const { lastFrame } = render(
    <ChatScreen
      config={config()}
      configErrors={[]}
      warnings={[]}
      error=""
      chat={chat()}
      character={character()}
      messages={[
        message("assistant-opening", "assistant", "你好。"),
        message("user-reply", "user", "前进"),
        message("assistant-followup", "assistant", "你向前迈步。"),
      ]}
      generating={false}
      input=""
      onInputChange={vi.fn()}
      inputEnabled
      activeChoiceIndex={0}
    />,
  );

  expect(lastFrame()).toContain("云雀:\n你好。\n\nYou:\n前进\n\n云雀:\n你向前迈步。");
});

test("shows an animated generating timer while waiting for the assistant", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const { lastFrame } = render(
    <ChatScreen
      config={config()}
      configErrors={[]}
      warnings={[]}
      error=""
      chat={chat()}
      character={character()}
      messages={[]}
      generating
      input=""
      onInputChange={vi.fn()}
      inputEnabled
      activeChoiceIndex={0}
    />,
  );

  expect(lastFrame()).toContain("Generating ⠋ 0s");

  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(lastFrame()).toContain("Generating ⠸ 3s");
});

test("does not render stale choices after a user message", () => {
  const { lastFrame } = render(
    <ChatScreen
      config={config()}
      configErrors={[]}
      warnings={[]}
      error=""
      chat={chat()}
      character={character()}
      messages={[
        message(
          "assistant-with-choices",
          "assistant",
          `<content>旧的选择。</content><choices>A: 走左边\nB: 走右边</choices>`,
        ),
        message("user-choice", "user", "B: 走右边"),
      ]}
      generating={false}
      input=""
      onInputChange={vi.fn()}
      inputEnabled
      activeChoiceIndex={0}
    />,
  );

  expect(lastFrame()).toContain("旧的选择。");
  expect(lastFrame()).toContain("You:\nB: 走右边");
  expect(lastFrame()).not.toContain("> A: 走左边");
  expect(lastFrame()).not.toContain("  B: 走右边");
});

test("does not render stale choices when the latest assistant message has no choices", () => {
  const { lastFrame } = render(
    <ChatScreen
      config={config()}
      configErrors={[]}
      warnings={[]}
      error=""
      chat={chat()}
      character={character()}
      messages={[
        message(
          "assistant-with-choices",
          "assistant",
          `<content>旧的选择。</content><choices>A: 走左边\nB: 走右边</choices>`,
        ),
        message("assistant-no-choices", "assistant", `<content>新的回复没有选项。</content>`),
      ]}
      generating={false}
      input=""
      onInputChange={vi.fn()}
      inputEnabled
      activeChoiceIndex={0}
    />,
  );

  expect(lastFrame()).toContain("旧的选择。");
  expect(lastFrame()).toContain("新的回复没有选项。");
  expect(lastFrame()).not.toContain("> A: 走左边");
  expect(lastFrame()).not.toContain("A: 走左边");
  expect(lastFrame()).not.toContain("B: 走右边");
});

function config(): CliConfig {
  return {
    baseUrl: "https://example.test/v1",
    apiKey: "test-key",
    model: "test-model",
  };
}

function chat(): ChatMetadata {
  return {
    id: "chat-1",
    characterId: "char-1",
    characterName: "云雀",
    title: "山间旅途",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function character(): StandardCard {
  return {
    spec: "chara_card_v2",
    data: {
      name: "云雀",
      description: "山间角色",
      first_mes: "你好。",
      personality: "温和",
      scenario: "山间",
      mes_example: "",
      alternate_greetings: [],
      opening_user_choices: [],
      character_book: { entries: [] },
      creator_notes: "",
      tags: [],
      creator: "",
      character_version: "",
    },
  };
}

function message(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id,
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

import { render } from "ink-testing-library";
import { expect, test } from "vitest";

import { MessageItem } from "@/components/MessageItem";
import type { ChatMessage } from "@/types";

const xmlContent = `<content>
你迷迷糊糊地从地上坐起，Alice温柔地注视着你。
</content>
<summary>
你醒来后遇见Alice。
</summary>
<choices>
A: 尝试回忆自己是如何来到这里的
B: 询问Alice关于失落之塔的更多细节
</choices>`;

test("assistant XML renders structured body without raw tags", () => {
  const { lastFrame } = render(
    <MessageItem
      assistantName="Alice"
      message={message("assistant", xmlContent)}
      isLatestChoiceMessage
      activeChoiceIndex={0}
    />,
  );

  expect(lastFrame()).toContain("Alice:");
  expect(lastFrame()).toContain("你迷迷糊糊地从地上坐起");
  expect(lastFrame()).toContain("※ 你醒来后遇见Alice。");
  expect(lastFrame()).toContain("> A: 尝试回忆自己是如何来到这里的");
  expect(lastFrame()).toContain("  B: 询问Alice关于失落之塔的更多细节");
  expect(lastFrame()).not.toContain("<content>");
  expect(lastFrame()).not.toContain("<summary>");
  expect(lastFrame()).not.toContain("<choices>");
});

test("assistant XML metadata and choices render without raw fallback when content is empty", () => {
  const { lastFrame } = render(
    <MessageItem
      assistantName="Alice"
      message={message(
        "assistant",
        `<summary>只记录摘要。</summary><choices>A: 翻开书
B: 关上书</choices>`,
      )}
      isLatestChoiceMessage
      activeChoiceIndex={1}
    />,
  );

  expect(lastFrame()).toContain("Alice:");
  expect(lastFrame()).toContain("※ 只记录摘要。");
  expect(lastFrame()).toContain("  A: 翻开书");
  expect(lastFrame()).toContain("> B: 关上书");
  expect(lastFrame()).not.toContain("<summary>");
  expect(lastFrame()).not.toContain("<choices>");
});

test("assistant non-XML content falls back to raw text", () => {
  const { lastFrame } = render(
    <MessageItem assistantName="Alice" message={message("assistant", "plain response")} />,
  );

  expect(lastFrame()).toContain("Alice:");
  expect(lastFrame()).toContain("plain response");
});

test("user messages render with the speaker label on its own line", () => {
  const { lastFrame } = render(
    <MessageItem assistantName="Alice" message={message("user", "hello")} />,
  );

  expect(lastFrame()).toContain("You:\nhello");
});

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: `${role}-1`, role, content, createdAt: "2026-06-24T00:00:00.000Z" };
}

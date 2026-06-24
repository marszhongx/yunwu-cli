import React from "react";
import { Box, Text } from "ink";

import { parseMessage } from "@/lib/messages";
import type { ChatMessage } from "@/types";

export type MessageItemProps = {
  message: ChatMessage;
  assistantName: string;
  isLatestChoiceMessage?: boolean;
  activeChoiceIndex?: number;
};

export function MessageItem({
  message,
  assistantName,
  isLatestChoiceMessage = false,
  activeChoiceIndex = 0,
}: MessageItemProps) {
  if (message.role === "user") {
    return (
      <Box flexDirection="column">
        <Text color="green">You:</Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  const parsed = parseMessage(message.content);
  const hasStructuredTags =
    parsed.body.trim() !== "" || parsed.summary !== null || parsed.choices.length > 0;
  const body = parsed.body.trim() || (hasStructuredTags ? "" : message.content);
  const choices = isLatestChoiceMessage ? parsed.choices : [];

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text color="blue">{assistantName}:</Text>
        {body ? <Text>{body}</Text> : null}
      </Box>

      {parsed.summary ? (
        <Box flexDirection="column">
          <Text dimColor>※ {parsed.summary}</Text>
        </Box>
      ) : null}

      {choices.length > 0 ? (
        <Box flexDirection="column">
          {choices.map((choice, index) => {
            const selected = index === activeChoiceIndex;
            return (
              <Text
                key={`${index}-${choice}`}
                color={selected ? "cyan" : undefined}
                dimColor={!selected}
              >
                {selected ? "> " : "  "}
                {choice}
              </Text>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}

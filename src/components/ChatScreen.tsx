import React, { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

import { MessageItem } from "@/components/MessageItem";
import { parseMessage } from "@/lib/messages";
import type { ChatMessage, ChatMetadata, CharacterCard, CliConfig } from "@/types";

type ChatScreenProps = {
  config: CliConfig | null;
  configErrors: string[];
  warnings: string[];
  error: string;
  chat: ChatMetadata | null;
  character: CharacterCard | null;
  messages: ChatMessage[];
  generating: boolean;
  input: string;
  onInputChange: (value: string) => void;
  inputEnabled: boolean;
  activeChoiceIndex: number;
};

export function ChatScreen({
  config,
  configErrors,
  warnings,
  error,
  chat,
  character,
  messages,
  generating,
  input,
  onInputChange,
  inputEnabled,
  activeChoiceIndex,
}: ChatScreenProps) {
  const title = chat?.title ?? "No active chat";
  const visibleMessages = useMemo(() => messages.slice(-8), [messages]);
  const latestChoiceId = latestChoiceMessageId(visibleMessages);
  const generatingStatus = useGeneratingStatus(generating);

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold>Yunwu CLI</Text>
        <Text>
          {title}{" "}
          {config ? (
            <Text color="cyan">[{config.model}]</Text>
          ) : (
            <Text color="yellow">[no config]</Text>
          )}
        </Text>
        {character ? <Text color="magenta">Character: {character.name}</Text> : null}
      </Box>

      {configErrors.length > 0 ? (
        <Box flexDirection="column">
          {configErrors.map((message) => (
            <Text key={message} color="red">
              {message}
            </Text>
          ))}
          <Text color="yellow">Create .yunwu/config.json with baseUrl, apiKey, and model.</Text>
        </Box>
      ) : null}

      {warnings.length > 0 ? (
        <Box flexDirection="column">
          {warnings.map((message) => (
            <Text key={message} color="yellow">
              Warning: {message}
            </Text>
          ))}
        </Box>
      ) : null}

      {error ? <Text color="red">Error: {error}</Text> : null}

      <Box flexDirection="column" gap={1}>
        {visibleMessages.length === 0 ? (
          <Text dimColor>Start with /new to create a chat or /resume to continue one.</Text>
        ) : (
          visibleMessages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              assistantName={character?.name ?? "assistant"}
              isLatestChoiceMessage={message.id === latestChoiceId}
              activeChoiceIndex={activeChoiceIndex}
            />
          ))
        )}
      </Box>

      {generating ? <Text color="cyan">{generatingStatus}</Text> : null}

      <Box>
        <Text color="green">&gt; </Text>
        <TextInput value={input} onChange={onInputChange} focus={inputEnabled} />
      </Box>

      <Text dimColor>Commands: /new, /resume, /help, /exit</Text>
    </Box>
  );
}

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function useGeneratingStatus(generating: boolean): string {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!generating) {
      setStartedAt(null);
      setFrameIndex(0);
      return;
    }

    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    setFrameIndex(0);

    const timer = setInterval(() => {
      setNow(Date.now());
      setFrameIndex((current) => (current + 1) % spinnerFrames.length);
    }, 1000);

    return () => clearInterval(timer);
  }, [generating]);

  const elapsedSeconds = startedAt === null ? 0 : Math.floor((now - startedAt) / 1000);
  return `Generating ${spinnerFrames[frameIndex]} ${elapsedSeconds}s`;
}

function latestChoiceMessageId(messages: ChatMessage[]): string | null {
  const message = messages.at(-1);
  if (message?.role !== "assistant") return null;

  return parseMessage(message.content).choices.length > 0 ? message.id : null;
}

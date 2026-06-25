import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";

import { CharacterSelect } from "@/components/CharacterSelect";
import { ChatScreen } from "@/components/ChatScreen";
import { ChatSelect } from "@/components/ChatSelect";
import { SystemPromptEditor } from "@/components/SystemPromptEditor";
import { DEFAULT_SYSTEM_PROMPTS } from "@/constants";
import { uuid } from "@/lib/ids";
import { parseMessage } from "@/lib/messages";
import {
  readCharacters,
  readChatMetadataList,
  readCliConfig,
  writeCliConfig,
  type ListedCharacter,
  type ListedChat,
} from "@/services/fileStorage";
import type { ChatMessage, ChatMetadata, CharacterCard, CliConfig } from "@/types";

type Mode = "chat" | "character-select" | "chat-select" | "system-edit";

export type AppProps = {
  rootDir: string;
  initialConfig?: CliConfig | null;
  initialConfigErrors?: string[];
  initialCharacters?: ListedCharacter[];
  initialChats?: ListedChat[];
};

export default function App({
  rootDir,
  initialConfig,
  initialConfigErrors,
  initialCharacters,
  initialChats,
}: AppProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("chat");
  const [config, setConfig] = useState<CliConfig | null>(initialConfig ?? null);
  const [configErrors, setConfigErrors] = useState<string[]>(initialConfigErrors ?? []);
  const [characters, setCharacters] = useState<ListedCharacter[]>(initialCharacters ?? []);
  const [chats, setChats] = useState<ListedChat[]>(initialChats ?? []);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<ChatMetadata | null>(null);
  const [character, setCharacter] = useState<CharacterCard | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const activeChoices = useMemo(() => latestChoices(messages), [messages]);
  const [activeChoiceIndex, setActiveChoiceIndex] = useState(0);
  const sendingRef = useRef(false);
  const inputEnabled =
    process.stdin.isTTY === true ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true";

  const hasInjectedInitialState =
    initialConfig !== undefined ||
    initialConfigErrors !== undefined ||
    initialCharacters !== undefined ||
    initialChats !== undefined;

  useEffect(() => {
    setActiveChoiceIndex(0);
  }, [activeChoices, chat?.id, mode]);

  const refreshCharacters = useCallback(async () => {
    const result = await readCharacters(rootDir);
    setCharacters(result.characters);
    setWarnings((current) => [...current, ...result.warnings]);
    return result.characters;
  }, [rootDir]);

  const refreshChats = useCallback(async () => {
    const result = await readChatMetadataList(rootDir);
    setChats(result.chats);
    setWarnings((current) => [...current, ...result.warnings]);
    return result.chats;
  }, [rootDir]);

  useEffect(() => {
    if (hasInjectedInitialState) {
      return;
    }

    let cancelled = false;
    async function loadInitialState() {
      try {
        const [configResult, charactersResult, chatsResult] = await Promise.all([
          readCliConfig(rootDir),
          readCharacters(rootDir),
          readChatMetadataList(rootDir),
        ]);
        if (cancelled) {
          return;
        }
        setConfig(configResult.config);
        setConfigErrors(configResult.errors);
        setCharacters(charactersResult.characters);
        setChats(chatsResult.chats);
        setWarnings([...charactersResult.warnings, ...chatsResult.warnings]);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(`Failed to load initial data: ${errorMessage(loadError)}`);
      }
    }

    void loadInitialState();
    return () => {
      cancelled = true;
    };
  }, [hasInjectedInitialState, rootDir]);

  useInput(
    (_input, key) => {
      if (key.escape && mode !== "chat") {
        setMode("chat");
        setError("");
        return;
      }

      if (mode !== "chat") {
        return;
      }

      if (input.trim() === "" && activeChoices.length > 0) {
        if (key.upArrow) {
          setActiveChoiceIndex((current) =>
            current === 0 ? activeChoices.length - 1 : current - 1,
          );
          return;
        }

        if (key.downArrow) {
          setActiveChoiceIndex((current) => (current + 1) % activeChoices.length);
          return;
        }

        if (key.return) {
          void handleSubmit(activeChoices[activeChoiceIndex] ?? "");
          return;
        }
      }

      if (key.return) {
        void handleSubmit(input);
      }
    },
    { isActive: inputEnabled },
  );

  async function handleSubmit(value: string) {
    const text = value.trim();

    if (sendingRef.current) {
      return;
    }

    setInput("");
    setError("");

    if (text === "") {
      return;
    }

    if (text.startsWith("/")) {
      await handleCommand(text);
      return;
    }

    if (!config) {
      setError("Configure .yunwu/config.json before sending messages.");
      return;
    }
    if (!chat || !character) {
      setError("Start with /new or /resume before sending messages.");
      return;
    }

    const createdAt = new Date().toISOString();
    const submittedMessage: ChatMessage = {
      id: uuid(),
      role: "user",
      content: text,
      createdAt,
    };
    const assistantDraft: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: "",
      createdAt,
    };
    const previousMessages = messages;
    const optimisticMessages = [...messages, submittedMessage, assistantDraft];

    setMessages(optimisticMessages);
    sendingRef.current = true;
    setGenerating(true);
    try {
      const { sendChatMessage } = await import("@/services/chatRuntime");
      let streamedText = "";
      const nextState = await sendChatMessage({
        rootDir,
        config,
        character,
        chat,
        messages: previousMessages,
        content: text,
        onAssistantText: (chunk) => {
          streamedText += chunk;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantDraft.id ? { ...message, content: streamedText } : message,
            ),
          );
        },
      });
      setChat(nextState.chat);
      setMessages(nextState.messages);
      setWarnings((current) => [...current, ...nextState.warnings]);
    } catch (sendError) {
      if (chat) {
        try {
          const { resumeChat } = await import("@/services/chatRuntime");
          const nextState = await resumeChat({ rootDir, chatId: chat.id });
          setChat(nextState.chat);
          setMessages(nextState.messages);
          setWarnings((current) => [...current, ...nextState.warnings]);
        } catch (reloadError) {
          setWarnings((current) => [
            ...current,
            `Failed to reload chat after send error: ${errorMessage(reloadError)}`,
          ]);
        }
      }
      setError(errorMessage(sendError));
    } finally {
      sendingRef.current = false;
      setGenerating(false);
    }
  }

  async function handleCommand(command: string) {
    if (command === "/new") {
      try {
        if (initialCharacters === undefined) {
          await refreshCharacters();
        }
        setMode("character-select");
      } catch (loadError) {
        setError(errorMessage(loadError));
      }
      return;
    }

    if (command === "/resume") {
      try {
        await refreshCharacters();
        if (initialChats === undefined) {
          await refreshChats();
        }
        setMode("chat-select");
      } catch (loadError) {
        setError(errorMessage(loadError));
      }
      return;
    }

    if (command === "/system") {
      if (!config) {
        setError("Configure .yunwu/config.json before editing system prompts.");
        return;
      }
      setError("");
      setMode("system-edit");
      return;
    }

    if (command === "/help") {
      const helpMessage = "Commands: /new creates a chat, /resume opens saved chats, /exit quits.";
      setError("");
      setWarnings((current) =>
        current.includes(helpMessage) ? current : [...current, helpMessage],
      );
      return;
    }

    if (command === "/exit") {
      exit();
      return;
    }

    setError(`Unknown command: ${command}`);
  }

  async function selectCharacter(item: ListedCharacter) {
    setError("");
    try {
      const { createNewChat } = await import("@/services/chatRuntime");
      const nextState = await createNewChat({ rootDir, character: item.character });
      setChat(nextState.chat);
      setCharacter(item.character);
      setMessages(nextState.messages);
      setWarnings((current) => [...current, ...nextState.warnings]);
      setMode("chat");
      if (initialChats === undefined) {
        void refreshChats();
      }
    } catch (selectError) {
      setError(errorMessage(selectError));
      setMode("chat");
    }
  }

  async function selectChat(item: ListedChat) {
    setError("");
    const matchingCharacter = characters.find(
      (candidate) => candidate.character.id === item.chat.characterId,
    )?.character;
    if (!matchingCharacter) {
      setError(`Missing character for chat: ${item.chat.characterName}`);
      setMode("chat");
      return;
    }

    try {
      const { resumeChat } = await import("@/services/chatRuntime");
      const nextState = await resumeChat({ rootDir, chatId: item.chat.id });
      setChat(nextState.chat);
      setCharacter(matchingCharacter);
      setMessages(nextState.messages);
      setWarnings((current) => [...current, ...nextState.warnings]);
      setMode("chat");
    } catch (selectError) {
      setError(errorMessage(selectError));
      setMode("chat");
    }
  }

  async function saveSystemPrompts(prompts: string[]) {
    if (!config) {
      throw new Error("Configure .yunwu/config.json before editing system prompts.");
    }
    const cleanPrompts = prompts.filter((prompt) => prompt.trim() !== "");
    const nextConfig: CliConfig = { ...config };
    if (cleanPrompts.length > 0) {
      nextConfig.systemPrompts = cleanPrompts;
    } else {
      delete nextConfig.systemPrompts;
    }
    await writeCliConfig(rootDir, nextConfig);
    setConfig(nextConfig);
  }

  return (
    <Box flexDirection="column">
      {mode === "character-select" ? (
        <CharacterSelect characters={characters} onSelect={(item) => void selectCharacter(item)} />
      ) : null}
      {mode === "chat-select" ? (
        <ChatSelect chats={chats} onSelect={(item) => void selectChat(item)} />
      ) : null}
      {mode === "system-edit" && config ? (
        <SystemPromptEditor
          initialPrompts={config.systemPrompts ?? DEFAULT_SYSTEM_PROMPTS}
          defaultPrompts={DEFAULT_SYSTEM_PROMPTS}
          onSave={saveSystemPrompts}
          onExit={() => setMode("chat")}
        />
      ) : null}
      {mode === "chat" ? (
        <ChatScreen
          config={config}
          configErrors={configErrors}
          warnings={warnings}
          error={error}
          chat={chat}
          character={character}
          messages={messages}
          generating={generating}
          input={input}
          onInputChange={setInput}
          inputEnabled={inputEnabled}
          activeChoiceIndex={activeChoiceIndex}
        />
      ) : null}
      {mode === "character-select" || mode === "chat-select" ? (
        <Text dimColor>Use arrow keys and Enter to choose.</Text>
      ) : null}
    </Box>
  );
}

function latestChoices(messages: ChatMessage[]): string[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    return parseMessage(message.content).choices;
  }
  return [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

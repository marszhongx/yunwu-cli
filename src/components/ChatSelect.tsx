import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { ListedChat } from "@/services/fileStorage";

type ChatSelectProps = {
  chats: ListedChat[];
  onSelect: (chat: ListedChat) => void;
};

type SelectItem = {
  label: string;
  value: ListedChat;
};

export function ChatSelect({ chats, onSelect }: ChatSelectProps) {
  const items: SelectItem[] = chats.map((item) => ({
    label: `${item.chat.title} — ${item.chat.characterName}`,
    value: item,
  }));

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Select a chat</Text>
      {items.length === 0 ? (
        <Text color="yellow">No saved chats found in .yunwu/chats.</Text>
      ) : (
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      )}
      <Text dimColor>Esc returns to chat.</Text>
    </Box>
  );
}

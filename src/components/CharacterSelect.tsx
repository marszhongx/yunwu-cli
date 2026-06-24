import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import type { ListedCharacter } from "@/services/fileStorage";

type CharacterSelectProps = {
  characters: ListedCharacter[];
  onSelect: (character: ListedCharacter) => void;
};

type SelectItem = {
  label: string;
  value: ListedCharacter;
};

export function CharacterSelect({ characters, onSelect }: CharacterSelectProps) {
  const items: SelectItem[] = characters.map((item) => ({
    label: `${item.character.name} (${item.fileName})`,
    value: item,
  }));

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Select a character</Text>
      {items.length === 0 ? (
        <Text color="yellow">No valid characters found in .yunwu/characters.</Text>
      ) : (
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      )}
      <Text dimColor>Esc returns to chat.</Text>
    </Box>
  );
}

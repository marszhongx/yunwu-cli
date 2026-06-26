import { render } from "ink-testing-library";
import { expect, test, vi } from "vitest";

import { CharacterSelect } from "@/components/CharacterSelect";
import type { ListedCharacter } from "@/services/fileStorage";
import type { StandardCharacterCard } from "@/types";

test("renders standard character card names from card data", () => {
  const { lastFrame } = render(
    <CharacterSelect characters={[listedCharacter()]} onSelect={vi.fn()} />,
  );

  expect(lastFrame()).toContain("云雀 (char-1.json)");
  expect(lastFrame()).not.toContain("undefined (char-1.json)");
});

function listedCharacter(): ListedCharacter {
  return {
    id: "char-1",
    fileName: "char-1.json",
    character: character(),
  };
}

function character(): StandardCharacterCard {
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

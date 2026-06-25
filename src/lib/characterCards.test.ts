import { describe, expect, test } from "vitest";
import {
  buildCharacterPromptParts,
  getCharacterFirstMessage,
  getCharacterName,
  getOpeningUserChoices,
  isStandardCharacterCard,
  normalizeStandardCharacterCard,
} from "@/lib/characterCards";
import type { StandardCharacterCard } from "@/types";

describe("standard character cards", () => {
  test("recognizes v2 and v3 cards with data.name", () => {
    expect(isStandardCharacterCard(v2Card())).toBe(true);
    expect(isStandardCharacterCard(v3Card())).toBe(true);
    expect(isStandardCharacterCard({ spec: "chara_card_v2", data: { name: "   " } })).toBe(false);
    expect(isStandardCharacterCard({ name: "legacy" })).toBe(false);
  });

  test("normalizes only supported cards and preserves card shape", () => {
    const card = v2Card();

    expect(normalizeStandardCharacterCard(card)).toBe(card);
    expect(normalizeStandardCharacterCard({ spec: "chara_card_v1", data: { name: "Old" } })).toBeNull();
    expect(normalizeStandardCharacterCard({ name: "Legacy" })).toBeNull();
  });

  test("reads names and first messages from data", () => {
    expect(getCharacterName(v2Card())).toBe("Misty Guide");
    expect(getCharacterFirstMessage(v2Card())).toBe("Welcome to the fog.");
    expect(getCharacterName(v3Card())).toBe("V3 Guide");
    expect(getCharacterFirstMessage(v3Card())).toBe("V3 welcome.");
  });

  test("reads opening choices by card version", () => {
    expect(getOpeningUserChoices(v2Card())).toEqual(["Enter the station"]);
    expect(getOpeningUserChoices(v3Card())).toEqual(["V3 choice A", "V3 choice B"]);
  });

  test("builds prompt parts in standard order", () => {
    expect(buildCharacterPromptParts(v2Card(), { messages: [{ role: "user", content: "station" }] })).toEqual([
      "Keep the narration eerie.",
      "A guide from the fogbound city.",
      "Careful and curious.",
      "The user arrives at an abandoned station.",
      "The station appears under a full moon.",
      "This rule is always present.",
      "User: Hello\nGuide: The mist answers.",
      "Remember the station layout.",
    ]);
  });

  test("matches lorebook entries using selective secondary keys and case sensitivity", () => {
    const card = v2Card({
      character_book: {
        entries: [
          {
            keys: ["station"],
            secondary_keys: ["moon"],
            selective: true,
            content: "Station plus moon.",
            enabled: true,
            insertion_order: 2,
            priority: 10,
          },
          {
            keys: ["Station"],
            content: "Case-sensitive station.",
            case_sensitive: true,
            enabled: true,
            insertion_order: 1,
            priority: 20,
          },
          {
            keys: ["station"],
            content: "Disabled station.",
            enabled: false,
          },
        ],
      },
    });

    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "station moon" }] })).toContain(
      "Station plus moon.",
    );
    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "station moon" }] })).not.toContain(
      "Case-sensitive station.",
    );
    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "Station moon" }] })).toContain(
      "Case-sensitive station.",
    );
    expect(buildCharacterPromptParts(card, { messages: [{ role: "user", content: "station" }] })).not.toContain(
      "Station plus moon.",
    );
  });

  test("sorts matched lorebook entries by priority descending then insertion_order ascending", () => {
    const card = v2Card({
      character_book: {
        entries: [
          { keys: ["fog"], content: "Low priority.", priority: 1, insertion_order: 1 },
          { keys: ["fog"], content: "High later.", priority: 5, insertion_order: 2 },
          { keys: ["fog"], content: "High earlier.", priority: 5, insertion_order: 1 },
        ],
      },
    });

    const parts = buildCharacterPromptParts(card, { messages: [{ role: "user", content: "fog" }] });
    expect(parts).toEqual([
      "Keep the narration eerie.",
      "A guide from the fogbound city.",
      "Careful and curious.",
      "The user arrives at an abandoned station.",
      "High earlier.",
      "High later.",
      "Low priority.",
      "User: Hello\nGuide: The mist answers.",
      "Remember the station layout.",
    ]);
  });
});

function v2Card(data: Record<string, unknown> = {}): StandardCharacterCard {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Misty Guide",
      description: "A guide from the fogbound city.",
      personality: "Careful and curious.",
      scenario: "The user arrives at an abandoned station.",
      first_mes: "Welcome to the fog.",
      mes_example: "User: Hello\nGuide: The mist answers.",
      system_prompt: "Keep the narration eerie.",
      post_history_instructions: "Remember the station layout.",
      opening_user_choices: ["Enter the station"],
      character_book: {
        entries: [
          { keys: ["station"], content: "The station appears under a full moon.", enabled: true },
          { keys: [], content: "This rule is always present.", constant: true, enabled: true },
        ],
      },
      ...data,
    },
  };
}

function v3Card(): StandardCharacterCard {
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "V3 Guide",
      first_mes: "V3 welcome.",
      group_only_greetings: ["V3 choice A", "V3 choice B"],
    },
  };
}

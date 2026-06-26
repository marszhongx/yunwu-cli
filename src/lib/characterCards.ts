import type { CharacterPromptParts, ChatMessage, StandardCard } from "@/types";

type PromptContext = {
  messages?: Pick<ChatMessage, "role" | "content">[];
};

type NormalizedBookEntry = {
  content: string;
  enabled: boolean;
  keys: string[];
  secondaryKeys: string[];
  selective: boolean;
  constant: boolean;
  caseSensitive: boolean;
  priority: number;
  insertionOrder: number;
};

export function isStandardCard(value: unknown): value is StandardCard {
  return normalizeStandardCard(value) !== null;
}

export function normalizeStandardCard(value: unknown): StandardCard | null {
  if (!isRecord(value)) return null;
  if (value.spec !== "chara_card_v2" && value.spec !== "chara_card_v3") return null;
  if (!isRecord(value.data)) return null;
  if (!text(value.data.name)) return null;
  return value as StandardCard;
}

export function getCharacterName(character: StandardCard): string {
  return text(character.data.name);
}

export function getCharacterFirstMessage(character: StandardCard): string {
  return text(character.data.first_mes);
}

export function getOpeningUserChoices(character: StandardCard): string[] {
  if (character.spec === "chara_card_v3") {
    return textArray(character.data.group_only_greetings);
  }
  return textArray(character.data.opening_user_choices);
}

export function buildCharacterPromptParts(
  character: StandardCard,
  context: PromptContext = {},
): CharacterPromptParts {
  const data = character.data;
  const parts = [
    text(data.system_prompt),
    text(data.description),
    text(data.personality),
    text(data.scenario),
    ...matchCharacterBookEntries(character, context),
    text(data.mes_example),
    text(data.post_history_instructions),
  ];
  return parts.filter((part) => part.trim() !== "");
}

export function matchCharacterBookEntries(
  character: StandardCard,
  context: PromptContext = {},
): string[] {
  const haystack = contextText(context.messages ?? []);
  return normalizedCharacterBookEntries(character)
    .filter((entry) => shouldInjectEntry(entry, haystack))
    .sort(compareEntries)
    .map((entry) => entry.content);
}

function normalizedCharacterBookEntries(character: StandardCard): NormalizedBookEntry[] {
  const book = record(character.data.character_book);
  const entries = Array.isArray(book.entries) ? book.entries : [];

  return entries.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const content = text(entry.content);
    if (!content) return [];
    return [
      {
        content,
        enabled: entry.enabled !== false,
        keys: normalizeKeys(entry.keys ?? entry.key),
        secondaryKeys: normalizeKeys(entry.secondary_keys),
        selective: entry.selective === true,
        constant: entry.constant === true,
        caseSensitive: entry.case_sensitive === true,
        priority: numberValue(entry.priority) ?? 0,
        insertionOrder: numberValue(entry.insertion_order) ?? index,
      },
    ];
  });
}

function shouldInjectEntry(entry: NormalizedBookEntry, haystack: string): boolean {
  if (!entry.enabled) return false;
  if (entry.constant) return true;
  if (entry.keys.length === 0) return false;

  const primaryMatched = hasAnyKey(haystack, entry.keys, entry.caseSensitive);
  if (!primaryMatched) return false;
  if (!entry.selective) return true;
  if (entry.secondaryKeys.length === 0) return true;
  return hasAnyKey(haystack, entry.secondaryKeys, entry.caseSensitive);
}

function compareEntries(left: NormalizedBookEntry, right: NormalizedBookEntry): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return left.insertionOrder - right.insertionOrder;
}

function hasAnyKey(haystack: string, keys: string[], caseSensitive: boolean): boolean {
  const source = caseSensitive ? haystack : haystack.toLocaleLowerCase();
  return keys.some((key) => source.includes(caseSensitive ? key : key.toLocaleLowerCase()));
}

function contextText(messages: Pick<ChatMessage, "role" | "content">[]): string {
  return messages.map((message) => message.content).join("\n");
}

export function normalizeKeys(keys: unknown): string[] {
  if (Array.isArray(keys)) {
    return keys.map((key) => String(key).trim()).filter(Boolean);
  }
  if (typeof keys === "string") {
    return keys
      .split(/[,，]/u)
      .map((key) => key.trim())
      .filter(Boolean);
  }
  return [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

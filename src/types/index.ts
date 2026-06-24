export type CliConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  systemPrompts?: string[];
};

export type CliMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: CliMessageRole;
  content: string;
  createdAt: string;
};

export type LorebookEntry = {
  keys: string[];
  content: string;
  enabled: boolean;
};

export type CharacterCard = {
  id: string;
  name: string;
  description: string;
  first_mes: string;
  personality: string;
  scenario: string;
  mes_example: string;
  alternate_greetings: string[];
  opening_user_choices: string[];
  entries: LorebookEntry[];
  creator_notes: string;
  tags: string[];
  creator: string;
  character_version: string;
  avatar?: string;
  extensions?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type ChatMetadata = {
  id: string;
  characterId: string;
  characterName: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type LoadResult<T> = {
  value: T;
  warnings: string[];
};

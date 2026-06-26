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

export type CharacterBookEntry = {
  keys?: unknown;
  key?: unknown;
  content?: unknown;
  enabled?: unknown;
  insertion_order?: unknown;
  case_sensitive?: unknown;
  name?: unknown;
  priority?: unknown;
  id?: unknown;
  selective?: unknown;
  secondary_keys?: unknown;
  constant?: unknown;
  position?: unknown;
  extensions?: unknown;
};

export type CharacterBook = {
  name?: unknown;
  entries?: unknown;
};

export type CharaCardData = {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  scenario?: unknown;
  first_mes?: unknown;
  mes_example?: unknown;
  creator_notes?: unknown;
  system_prompt?: unknown;
  post_history_instructions?: unknown;
  alternate_greetings?: unknown;
  group_only_greetings?: unknown;
  opening_user_choices?: unknown;
  tags?: unknown;
  creator?: unknown;
  character_version?: unknown;
  avatar?: unknown;
  extensions?: unknown;
  character_book?: unknown;
};

export type CharaCardV2 = {
  spec: "chara_card_v2";
  spec_version?: unknown;
  data: CharaCardData;
};

export type CharaCardV3 = {
  spec: "chara_card_v3";
  spec_version?: unknown;
  data: CharaCardData;
};

export type StandardCard = CharaCardV2 | CharaCardV3;

export type CharacterPromptParts = string[];

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

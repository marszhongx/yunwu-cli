import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";

type SystemPromptEditorProps = {
  initialPrompts: string[];
  defaultPrompts: string[];
  onSave: (prompts: string[]) => Promise<void>;
  onExit: () => void;
};

type EditState = { mode: "list" } | { mode: "edit"; index: number | null };

export function SystemPromptEditor({
  initialPrompts,
  defaultPrompts,
  onSave,
  onExit,
}: SystemPromptEditorProps) {
  const [prompts, setPromptsState] = useState(() => cleanPrompts(initialPrompts));
  const promptsRef = useRef(cleanPrompts(initialPrompts));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editState, setEditStateState] = useState<EditState>({ mode: "list" });
  const editStateRef = useRef<EditState>({ mode: "list" });
  const [editValue, setEditValueState] = useState("");
  const editValueRef = useRef("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function setPrompts(prompts: string[]) {
    promptsRef.current = prompts;
    setPromptsState(prompts);
  }

  function setEditState(editState: EditState) {
    editStateRef.current = editState;
    setEditStateState(editState);
  }

  function setEditValue(value: string) {
    editValueRef.current = value;
    setEditValueState(value);
  }

  useInput(
    (_input, key) => {
      if (editStateRef.current.mode !== "list" || saving) {
        return;
      }
      if (key.escape) {
        onExit();
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((current) =>
          promptsRef.current.length === 0 ? 0 : Math.max(0, current - 1),
        );
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((current) =>
          promptsRef.current.length === 0
            ? 0
            : Math.min(promptsRef.current.length - 1, current + 1),
        );
        return;
      }
      if (_input === "a") {
        setStatus("");
        setError("");
        setEditValue("");
        setEditState({ mode: "edit", index: null });
        return;
      }
      if (_input === "e" && promptsRef.current[selectedIndex] !== undefined) {
        setStatus("");
        setError("");
        setEditValue(escapePrompt(promptsRef.current[selectedIndex]));
        setEditState({ mode: "edit", index: selectedIndex });
        return;
      }
      if (_input === "d" && promptsRef.current[selectedIndex] !== undefined) {
        setStatus("Deleted prompt. Press s to save changes.");
        setError("");
        setPrompts(promptsRef.current.filter((_, index) => index !== selectedIndex));
        setSelectedIndex((current) =>
          Math.max(0, Math.min(current, promptsRef.current.length - 1)),
        );
        return;
      }
      if (_input === "r") {
        setPrompts(cleanPrompts(defaultPrompts));
        setSelectedIndex(0);
        setStatus("Reset to default prompts. Press s to save changes.");
        setError("");
        return;
      }
      if (_input === "s") {
        void save();
      }
    },
    { isActive: !saving },
  );

  useInput(
    (input, key) => {
      if (editState.mode !== "edit") {
        return;
      }
      if (key.escape) {
        setEditState({ mode: "list" });
        setStatus("Edit cancelled.");
        setError("");
        return;
      }
      if (key.return) {
        submitEdit(editValueRef.current);
        return;
      }
      if (key.ctrl && input === "a") {
        setEditValue("");
        return;
      }
      if (key.backspace || key.delete) {
        setEditValue(editValueRef.current.slice(0, -1));
        return;
      }
      if (!key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && !key.tab) {
        setEditValue(`${editValueRef.current}${input}`);
      }
    },
    { isActive: true },
  );

  async function save() {
    setSaving(true);
    setStatus("");
    setError("");
    try {
      await onSave(cleanPrompts(promptsRef.current));
      setStatus("Saved system prompts.");
    } catch (saveError) {
      setError(`Failed to save system prompts: ${errorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  function submitEdit(value: string) {
    const prompt = unescapePrompt(value);
    const currentEditState = editStateRef.current;
    if (currentEditState.mode !== "edit") {
      return;
    }

    let nextPrompts = promptsRef.current;
    if (prompt.trim() === "") {
      if (currentEditState.index !== null) {
        nextPrompts = promptsRef.current.filter((_, index) => index !== currentEditState.index);
      }
    } else if (currentEditState.index === null) {
      nextPrompts = [...promptsRef.current, prompt];
      setSelectedIndex(promptsRef.current.length);
    } else {
      nextPrompts = promptsRef.current.map((item, index) =>
        index === currentEditState.index ? prompt : item,
      );
    }

    setPrompts(nextPrompts);
    setEditState({ mode: "list" });
    setStatus("Prompt updated. Press s to save changes.");
    setError("");
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>System Prompts</Text>
      {editState.mode === "edit" ? (
        <Box flexDirection="column">
          <Text>{editState.index === null ? "Add system prompt" : "Edit system prompt"}</Text>
          <Box>
            <Text color="green">prompt&gt; </Text>
            <Text>{editValue}</Text>
          </Box>
          <Text dimColor>Use \n for line breaks. Enter saves this edit. Esc cancels.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {prompts.length === 0 ? (
            <Text color="yellow">No custom system prompts. Saving will use defaults.</Text>
          ) : (
            prompts.map((prompt, index) => (
              <Text key={`${index}-${prompt}`} color={index === selectedIndex ? "cyan" : undefined}>
                {index === selectedIndex ? "> " : "  "}
                {index + 1}. {previewPrompt(prompt)}
              </Text>
            ))
          )}
          <Text dimColor>↑/↓ select · e edit · a add · d delete · r reset · s save · Esc back</Text>
        </Box>
      )}
      {saving ? <Text color="cyan">Saving system prompts...</Text> : null}
      {status ? <Text color="green">{status}</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
    </Box>
  );
}

function cleanPrompts(prompts: string[]): string[] {
  return prompts.filter((prompt) => prompt.trim() !== "");
}

function escapePrompt(prompt: string): string {
  return prompt.replace(/\n/gu, "\\n");
}

function unescapePrompt(prompt: string): string {
  return prompt.replace(/\\n/gu, "\n");
}

function previewPrompt(prompt: string): string {
  const escaped = escapePrompt(prompt);
  return escaped.length > 80 ? `${escaped.slice(0, 77)}...` : escaped;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

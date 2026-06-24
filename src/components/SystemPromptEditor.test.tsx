import React from "react";
import { render } from "ink-testing-library";
import { expect, test, vi } from "vitest";

import { SystemPromptEditor } from "@/components/SystemPromptEditor";

const defaultPrompts = ["default one", "default two"];

function renderEditor(overrides: Partial<React.ComponentProps<typeof SystemPromptEditor>> = {}) {
  const onSave = vi.fn(async () => {});
  const onExit = vi.fn();
  const view = render(
    <SystemPromptEditor
      initialPrompts={["first prompt", "second prompt"]}
      defaultPrompts={defaultPrompts}
      onSave={onSave}
      onExit={onExit}
      {...overrides}
    />,
  );
  return { ...view, onSave, onExit };
}

test("renders prompt list and navigates selection", async () => {
  const { lastFrame, stdin } = renderEditor();

  expect(lastFrame()).toContain("System Prompts");
  expect(lastFrame()).toContain("> 1. first prompt");
  expect(lastFrame()).toContain("  2. second prompt");

  stdin.write("[B");

  await vi.waitFor(() => expect(lastFrame()).toContain("> 2. second prompt"));
});

test("adds a prompt and converts escaped newlines on save", async () => {
  const { lastFrame, stdin, onSave } = renderEditor();

  stdin.write("a");
  await vi.waitFor(() => expect(lastFrame()).toContain("Add system prompt"));
  stdin.write("new\\nline");
  await vi.waitFor(() => expect(lastFrame()).toContain("new\\nline"));
  stdin.write("\r");
  await vi.waitFor(() => expect(lastFrame()).toContain("new\\nline"));

  stdin.write("s");

  await vi.waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(["first prompt", "second prompt", "new\nline"]),
  );
  await vi.waitFor(() => expect(lastFrame()).toContain("Saved system prompts."));
});

test("edits selected prompt and removes it when edited blank", async () => {
  const { lastFrame, stdin } = renderEditor();

  stdin.write("e");
  await vi.waitFor(() => expect(lastFrame()).toContain("Edit system prompt"));
  stdin.write("");
  stdin.write("replacement");
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("> 1. replacement"));

  stdin.write("e");
  await vi.waitFor(() => expect(lastFrame()).toContain("Edit system prompt"));
  stdin.write("");
  stdin.write("   ");
  stdin.write("\r");

  await vi.waitFor(() => expect(lastFrame()).toContain("> 1. second prompt"));
  expect(lastFrame()).not.toContain("replacement");
});

test("deletes prompts and can save an empty list", async () => {
  const { lastFrame, stdin, onSave } = renderEditor({ initialPrompts: ["only prompt"] });

  stdin.write("d");
  await vi.waitFor(() => expect(lastFrame()).toContain("No custom system prompts"));
  stdin.write("s");

  await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith([]));
});

test("resets to defaults and exits on Escape", async () => {
  const { lastFrame, stdin, onExit } = renderEditor({ initialPrompts: ["custom"] });

  stdin.write("r");
  await vi.waitFor(() => expect(lastFrame()).toContain("> 1. default one"));
  expect(lastFrame()).toContain("  2. default two");

  stdin.write("");
  await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce());
});

test("shows save errors without exiting", async () => {
  const onSave = vi.fn(async () => {
    throw new Error("disk full");
  });
  const { lastFrame, stdin } = renderEditor({ onSave });

  stdin.write("s");

  await vi.waitFor(() => expect(lastFrame()).toContain("Failed to save system prompts: disk full"));
  expect(lastFrame()).toContain("System Prompts");
});

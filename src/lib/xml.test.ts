import { describe, expect, it } from "vitest";
import { xml2json } from "@/lib/xml";

describe("xml2json", () => {
  it("parses known XML tags", () => {
    expect(xml2json("开头<summary>摘要</summary>结尾", ["summary"])).toEqual({
      summary: ["摘要"],
    });
  });

  it("keeps text in an unclosed tag at the end", () => {
    expect(xml2json("<content>正文", ["content"])).toEqual({
      content: ["正文"],
    });
  });

  it("keeps text in any known unclosed tag at the end", () => {
    expect(xml2json("<summary>摘要", ["summary", "note", "choices"])).toEqual({
      summary: ["摘要"],
      note: [],
      choices: [],
    });
    expect(xml2json("<note>状态", ["summary", "note", "choices"])).toEqual({
      summary: [],
      note: ["状态"],
      choices: [],
    });
    expect(xml2json("<choices>\nA: 前进", ["summary", "note", "choices"])).toEqual({
      summary: [],
      note: [],
      choices: ["A: 前进"],
    });
  });

  it("keeps completed tags before an unclosed tag at the end", () => {
    expect(
      xml2json("<content>正文</content><summary>摘要", ["content", "summary", "note"]),
    ).toEqual({
      content: ["正文"],
      summary: ["摘要"],
      note: [],
    });
    expect(
      xml2json("<content>正文</content><summary>摘要</summary><note>状态", [
        "content",
        "summary",
        "note",
      ]),
    ).toEqual({
      content: ["正文"],
      summary: ["摘要"],
      note: ["状态"],
    });
  });

  it("keeps partial second choice in an unclosed choices tag", () => {
    expect(xml2json("<choices>\nA: 前进\nB: 等", ["choices"])).toEqual({
      choices: ["A: 前进\nB: 等"],
    });
  });

  it("stops an unclosed tag before the next known opening tag", () => {
    expect(
      xml2json("<content>正文<summary>摘要<note>状态</note>", ["content", "summary", "note"]),
    ).toEqual({
      content: ["正文"],
      summary: ["摘要"],
      note: ["状态"],
    });
  });

  it("keeps repeated tag blocks in order", () => {
    expect(xml2json("<summary>第一次</summary><summary>第二次</summary>", ["summary"])).toEqual({
      summary: ["第一次", "第二次"],
    });
  });

  it("ignores stray closing tags outside known tag values", () => {
    expect(xml2json("<summary>第一次</summary>第二次</summary>", ["summary"])).toEqual({
      summary: ["第一次"],
    });
  });

  it("ignores unknown tags", () => {
    expect(xml2json("<unknown>保留</unknown><summary>摘要</summary>", ["summary"])).toEqual({
      summary: ["摘要"],
    });
  });
});

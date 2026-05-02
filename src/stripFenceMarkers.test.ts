import { describe, expect, it } from "vitest";
import { stripFenceMarkers } from "./stripFenceMarkers.js";

describe("stripFenceMarkers", () => {
	it("drops opener and closer fence lines", () => {
		const out = stripFenceMarkers(["```typescript", "const x = 1;", "```", "after"]);
		expect(out).toEqual(["const x = 1;", "after"]);
	});

	it("strips fences after stripping ANSI", () => {
		const opener = "\x1b[31m```ts\x1b[0m";
		expect(stripFenceMarkers([opener, "code"])).toEqual(["code"]);
	});

	it("strips opener/closer wrapped in XML-like theme markup (test themes)", () => {
		const opener = "<mdCodeBlockBorder>```typescript</mdCodeBlockBorder>";
		const closer = "<mdCodeBlockBorder>```</mdCodeBlockBorder>";
		expect(stripFenceMarkers([opener, "  body", closer])).toEqual(["  body"]);
	});

	it("merges rows split by wrap when matching a fence delimiter", () => {
		const row1 = "<mdCodeBlockBorder>```typescript</mdCodeBl";
		const row2 = "ockBorder>";
		expect(stripFenceMarkers([row1, row2, "  x", "<mdCodeBlockBorder>```</mdCodeBlockBorder>"])).toEqual(["  x"]);
	});

	it("keeps lines that only mention triple backticks mid-string", () => {
		expect(stripFenceMarkers(["text ``` not start"])).toEqual(["text ``` not start"]);
	});

	it("drops fence opener lines with extra info after the language token", () => {
		expect(stripFenceMarkers(["```typescript title=demo", "const x = 1;", "```"])).toEqual(["const x = 1;"]);
	});
});

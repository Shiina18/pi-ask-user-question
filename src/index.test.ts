import { describe, expect, it } from "vitest";
import register from "./index.js";

describe("ask_user_question registration", () => {
	it("tells callers to keep headers within the schema limit", () => {
		let registeredTool: { promptGuidelines?: string[] } | undefined;
		const pi = {
			registerTool: (tool: { promptGuidelines?: string[] }) => {
				registeredTool = tool;
			},
		};

		register(pi as never);

		expect(registeredTool?.promptGuidelines?.join("\n")).toContain("12 characters or fewer");
	});
});

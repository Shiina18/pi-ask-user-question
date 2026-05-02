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

	it("preserves preview and notes annotations in tool output", async () => {
		let registeredTool:
			| {
					execute?: (...args: unknown[]) => Promise<{
						content: Array<{ type: "text"; text: string }>;
						details?: Record<string, unknown>;
					}>;
			  }
			| undefined;
		const pi = {
			registerTool: (tool: typeof registeredTool) => {
				registeredTool = tool;
			},
		};

		register(pi as never);

		const result = await registeredTool!.execute!(
			"id",
			{
				questions: [
					{
						question: "Which layout should we use?",
						header: "Layout",
						options: [
							{
								label: "Compact",
								description: "Dense",
								preview: "Compact preview",
							},
						],
					},
				],
			},
			undefined,
			undefined,
			{
				ui: {
					custom: async () => [
						{
							answer: "Compact",
							selectedIndex: 0,
							preview: "Compact preview",
							notes: "Prefer dense UI",
						},
					],
				},
			},
		);

		expect(result.content[0]?.text).toContain("selected preview:\nCompact preview");
		expect(result.content[0]?.text).toContain("user notes: Prefer dense UI");
		expect(result.details).toMatchObject({
			annotations: { "Which layout should we use?": { preview: "Compact preview", notes: "Prefer dense UI" } },
		});
	});
});

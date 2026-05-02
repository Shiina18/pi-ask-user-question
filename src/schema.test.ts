import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { AskUserQuestionParams } from "./schema.js";

describe("AskUserQuestionParams", () => {
	const validParams = {
		questions: [
			{
				question: "Which language should we use?",
				header: "Language",
				options: [
					{ label: "TypeScript", description: "Typed JavaScript" },
					{ label: "Python", description: "General purpose" },
				],
			},
		],
	};

	it("allows multiSelect to be omitted while retaining default false", () => {
		const schema = AskUserQuestionParams as unknown as {
			properties: {
				questions: {
					items: {
						required?: string[];
						properties: {
							multiSelect: { default?: boolean };
						};
					};
				};
			};
		};

		const questionSchema = schema.properties.questions.items;
		expect(questionSchema.required).not.toContain("multiSelect");
		expect(questionSchema.properties.multiSelect.default).toBe(false);
	});

	it("accepts unique question texts and option labels", () => {
		expect(Value.Check(AskUserQuestionParams, validParams)).toBe(true);
	});

	it("accepts option preview content", () => {
		expect(
			Value.Check(AskUserQuestionParams, {
				questions: [
					{
						...validParams.questions[0],
						options: [
							{
								label: "TypeScript",
								description: "Typed JavaScript",
								preview: "```ts\nconst value: string = 'ok';\n```",
							},
							{ label: "Python", description: "General purpose", preview: "print('ok')" },
						],
					},
				],
			}),
		).toBe(true);
	});

	it("rejects duplicate question texts", () => {
		expect(
			Value.Check(AskUserQuestionParams, {
				questions: [
					validParams.questions[0],
					{
						...validParams.questions[0],
						header: "Runtime",
						options: [
							{ label: "Node", description: "Node.js runtime" },
							{ label: "Bun", description: "Bun runtime" },
						],
					},
				],
			}),
		).toBe(false);
	});

	it("rejects duplicate option labels within a question", () => {
		expect(
			Value.Check(AskUserQuestionParams, {
				questions: [
					{
						...validParams.questions[0],
						options: [
							{ label: "TypeScript", description: "Typed JavaScript" },
							{ label: "TypeScript", description: "Same label" },
						],
					},
				],
			}),
		).toBe(false);
	});
});

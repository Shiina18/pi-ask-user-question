import { describe, expect, it } from "vitest";
import { AskUserQuestionParams } from "./schema.js";

describe("AskUserQuestionParams", () => {
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
});

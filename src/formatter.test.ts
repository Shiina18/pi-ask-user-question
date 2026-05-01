import { describe, expect, it } from "vitest";
import { formatDetails, formatSingleResult } from "./formatter.js";

describe("formatSingleResult", () => {
	it("formats basic question and answer", () => {
		const result = formatSingleResult("Which library should we use?", "React");
		expect(result).toBe(
			'User has answered your questions: "Which library should we use?"="React". You can now continue with the user\'s answers in mind.',
		);
	});

	it("handles special characters in question text", () => {
		const result = formatSingleResult('What about "quotes" and <brackets>?', "Option A");
		expect(result).toContain('"What about "quotes" and <brackets>?"');
	});

	it("handles special characters in selected label", () => {
		const result = formatSingleResult("Pick one", 'It\'s "the best" <option>');
		expect(result).toContain('="It\'s "the best" <option>"');
	});

	it("handles empty question text", () => {
		const result = formatSingleResult("", "Some answer");
		expect(result).toBe(
			'User has answered your questions: ""="Some answer". You can now continue with the user\'s answers in mind.',
		);
	});

	it("handles unicode in question and answer", () => {
		const result = formatSingleResult("哪个方案更好？", "方案A");
		expect(result).toContain('"哪个方案更好？"="方案A"');
	});
});

describe("formatDetails", () => {
	it("returns structured answers map", () => {
		const result = formatDetails({ "Which library?": "React" });
		expect(result).toEqual({ questions: [], answers: { "Which library?": "React" } });
	});

	it("handles multiple answers", () => {
		const result = formatDetails({
			"Question 1?": "Answer 1",
			"Question 2?": "Answer 2",
		});
		expect(result).toEqual({
			questions: [],
			answers: { "Question 1?": "Answer 1", "Question 2?": "Answer 2" },
		});
	});

	it("returns empty answers for empty input", () => {
		const result = formatDetails({});
		expect(result).toEqual({ questions: [], answers: {} });
	});

	it("includes questions metadata", () => {
		const questions = [
			{
				question: "Which library?",
				header: "Library",
				options: [{ label: "React", description: "A UI library" }],
				multiSelect: false,
			},
		];
		const result = formatDetails({ "Which library?": "React" }, questions);
		expect(result).toEqual({
			questions,
			answers: { "Which library?": "React" },
		});
	});
});

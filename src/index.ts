import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createQuestionComponent, type QuestionResult } from "./component.js";
import { formatDetails, formatResult } from "./formatter.js";
import { AskUserQuestionParams } from "./schema.js";

export default function (pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User Question",
		description:
			"Ask the user questions to gather information, clarify ambiguous instructions, understand preferences, make decisions, or offer them choices.",
		promptSnippet:
			"Ask the user 1-4 focused questions with multiple-choice options to gather preferences or clarify instructions",
		promptGuidelines: [
			"Use ask_user_question when the user's intent is ambiguous, a decision requires explicit user input, or multiple valid approaches exist.",
			"Ask 1-4 clear, specific questions per call. Each question must end with a question mark.",
			"Keep each header at 12 characters or fewer. Prefer a short noun like 'Testing', 'Library', or 'Auth'.",
			"Provide 2-4 distinct options per question. The system adds an 'Other' freeform option automatically — do not include one yourself.",
			"Use option preview only for single-select questions when users need to visually compare concrete artifacts such as mockups, layouts, diagrams, or code snippets.",
			"Before calling, gather context with other tools and frame the question so the user can make an informed choice.",
		],
		parameters: AskUserQuestionParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const questions = params.questions;

			const results = await ctx.ui.custom<QuestionResult[] | null>((tui, theme, kb, done) => {
				return createQuestionComponent(
					questions.map((q) => ({
						question: q.question,
						header: q.header,
						options: q.options.map((o) => ({ label: o.label, description: o.description, preview: o.preview })),
						multiSelect: q.multiSelect ?? false,
					})),
					theme,
					kb,
					tui,
					done,
				);
			});

			if (!results) {
				throw new Error("User cancelled");
			}

			const answersMap: Record<string, string> = {};
			const annotationsMap: Record<string, { preview?: string }> = {};
			for (let i = 0; i < questions.length; i++) {
				const result = results[i];
				if (result) {
					answersMap[questions[i].question] = result.answer;
					if (result.preview) {
						annotationsMap[questions[i].question] = { preview: result.preview };
					}
				}
			}

			const text = formatResult(answersMap, annotationsMap);
			const details = formatDetails(
				answersMap,
				questions.map((q) => ({
					question: q.question,
					header: q.header,
					options: q.options.map((o) => ({ label: o.label, description: o.description, preview: o.preview })),
					multiSelect: q.multiSelect ?? false,
				})),
				annotationsMap,
			);

			return {
				content: [{ type: "text" as const, text }],
				details,
			};
		},
	});
}

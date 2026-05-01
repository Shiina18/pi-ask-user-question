import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createQuestionComponent } from "./component.js";
import { AskUserQuestionParams } from "./schema.js";

export default function (pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User Question",
		description:
			"Ask the user 1-4 questions with multiple-choice options to gather preferences, clarify ambiguous instructions, or let the user choose between valid approaches. An 'Other' option for freeform input is provided automatically.",
		promptSnippet:
			"Ask the user 1-4 focused questions with multiple-choice options to gather preferences or clarify instructions",
		promptGuidelines: [
			"Use ask_user_question when the user's intent is ambiguous, a decision requires explicit user input, or multiple valid approaches exist.",
			"Ask 1-4 clear, specific questions per call. Each question must end with a question mark.",
			"Provide 2-4 distinct options per question. The system adds an 'Other' freeform option automatically — do not include one yourself.",
			"Before calling, gather context with other tools and frame the question so the user can make an informed choice.",
		],
		parameters: AskUserQuestionParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			// Phase 3: single question only
			const q = params.questions[0];

			const result = await ctx.ui.custom<{
				answer: string;
				selectedIndex: number;
			} | null>((tui, theme, kb, done) => {
				return createQuestionComponent(
					{
						question: q.question,
						header: q.header,
						options: q.options.map((o) => ({
							label: o.label,
							description: o.description,
						})),
					},
					theme,
					kb,
					tui,
					done,
				);
			});

			if (!result) {
				return {
					content: [{ type: "text" as const, text: "User cancelled." }],
					details: {},
				};
			}

			return {
				content: [{ type: "text" as const, text: result.answer }],
				details: {},
			};
		},
	});
}

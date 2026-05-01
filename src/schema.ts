import { Refine, type Static, Type } from "typebox";

const ASK_USER_QUESTION_UNIQUENESS_ERROR =
	"Question texts must be unique, option labels must be unique within each question";

const AskUserQuestionParamsBase = Type.Object(
	{
		questions: Type.Array(
			Type.Object(
				{
					question: Type.String({
						description:
							"The complete question to ask the user. Should be clear, specific, and end with a question mark.",
					}),
					header: Type.String({
						maxLength: 12,
						description:
							"Very short label displayed as a chip/tag. Must be 12 characters or fewer. Examples: 'Testing', 'Library', 'Auth'.",
					}),
					options: Type.Array(
						Type.Object(
							{
								label: Type.String({
									description:
										"The display text for this option. Should be concise (1-5 words) and clearly describe the choice.",
								}),
								description: Type.String({
									description: "Explanation of what this option means or what will happen if chosen.",
								}),
								preview: Type.Optional(
									Type.String({
										description: "Optional preview content rendered when this option is focused.",
									}),
								),
							},
							{ additionalProperties: false },
						),
						{
							minItems: 2,
							maxItems: 4,
							description: "The available choices (2-4 options).",
						},
					),
					multiSelect: Type.Optional(
						Type.Boolean({
							default: false,
							description: "Set to true to allow the user to select multiple options.",
						}),
					),
				},
				{ additionalProperties: false },
			),
			{ minItems: 1, maxItems: 4, description: "Questions to ask the user (1-4 questions)." },
		),
	},
	{ additionalProperties: false },
);

type AskUserQuestionParamsValue = Static<typeof AskUserQuestionParamsBase>;

function hasUniqueQuestionsAndOptions(value: AskUserQuestionParamsValue): boolean {
	const questionTexts = value.questions.map((q) => q.question);
	if (new Set(questionTexts).size !== questionTexts.length) return false;

	return value.questions.every((question) => {
		const labels = question.options.map((option) => option.label);
		return new Set(labels).size === labels.length;
	});
}

export const AskUserQuestionParams = Refine(
	AskUserQuestionParamsBase,
	hasUniqueQuestionsAndOptions,
	ASK_USER_QUESTION_UNIQUENESS_ERROR,
);

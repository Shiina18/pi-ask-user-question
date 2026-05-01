import { Type } from "typebox";

export const AskUserQuestionParams = Type.Object(
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
							"Very short label displayed as a chip/tag (max 12 chars). Examples: 'Auth method', 'Library', 'Approach'.",
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

export interface FormatAnswers {
	[questionText: string]: string;
}

export function formatResult(answers: FormatAnswers): string {
	const answerText = Object.entries(answers)
		.map(([questionText, selectedLabel]) => `"${questionText}"="${selectedLabel}"`)
		.join(", ");

	return `User has answered your questions: ${answerText}. You can now continue with the user's answers in mind.`;
}

export function formatSingleResult(questionText: string, selectedLabel: string): string {
	return formatResult({ [questionText]: selectedLabel });
}

export function formatDetails(
	answers: FormatAnswers,
	questions?: Array<{
		question: string;
		header: string;
		options: Array<{ label: string; description: string }>;
		multiSelect: boolean;
	}>,
): Record<string, unknown> {
	return { questions: questions ?? [], answers };
}

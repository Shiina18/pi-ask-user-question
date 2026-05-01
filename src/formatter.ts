export interface FormatAnswers {
	[questionText: string]: string;
}

export function formatSingleResult(questionText: string, selectedLabel: string): string {
	return `User has answered your questions: "${questionText}"="${selectedLabel}". You can now continue with the user's answers in mind.`;
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

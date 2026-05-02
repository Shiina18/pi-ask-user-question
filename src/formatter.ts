export interface FormatAnswers {
	[questionText: string]: string;
}

export interface FormatAnnotation {
	preview?: string;
}

export interface FormatAnnotations {
	[questionText: string]: FormatAnnotation;
}

export function formatResult(answers: FormatAnswers, annotations: FormatAnnotations = {}): string {
	const answerText = Object.entries(answers)
		.map(([questionText, selectedLabel]) => {
			const annotation = annotations[questionText];
			const previewText = annotation?.preview ? ` selected preview:\n${annotation.preview}` : "";
			return `"${questionText}"="${selectedLabel}"${previewText}`;
		})
		.join(", ");

	return `User has answered your questions: ${answerText}. You can now continue with the user's answers in mind.`;
}

export function formatSingleResult(questionText: string, selectedLabel: string, annotation?: FormatAnnotation): string {
	return formatResult({ [questionText]: selectedLabel }, annotation ? { [questionText]: annotation } : {});
}

export function formatDetails(
	answers: FormatAnswers,
	questions?: Array<{
		question: string;
		header: string;
		options: Array<{ label: string; description: string; preview?: string }>;
		multiSelect: boolean;
	}>,
	annotations: FormatAnnotations = {},
): Record<string, unknown> {
	const result: Record<string, unknown> = { questions: questions ?? [], answers };
	if (Object.keys(annotations).length > 0) {
		result.annotations = annotations;
	}
	return result;
}

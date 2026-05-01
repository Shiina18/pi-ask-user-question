export interface QuestionState {
	questionIndex: number;
	highlightedIndex: number;
	selectedIndex: number | null;
	confirmed: boolean;
	optionCount: number;
}

export type Action = { type: "navigateUp" } | { type: "navigateDown" } | { type: "selectCurrent" };

export function createInitialState(optionCount: number): QuestionState {
	return {
		questionIndex: 0,
		highlightedIndex: 0,
		selectedIndex: null,
		confirmed: false,
		optionCount,
	};
}

export function reducer(state: QuestionState, action: Action): QuestionState {
	if (state.confirmed) return state;

	switch (action.type) {
		case "navigateUp":
			return {
				...state,
				highlightedIndex: state.highlightedIndex === 0 ? state.optionCount - 1 : state.highlightedIndex - 1,
			};
		case "navigateDown":
			return {
				...state,
				highlightedIndex: state.highlightedIndex === state.optionCount - 1 ? 0 : state.highlightedIndex + 1,
			};
		case "selectCurrent":
			return {
				...state,
				selectedIndex: state.highlightedIndex,
				confirmed: true,
			};
		default: {
			const _exhaustive: never = action;
			return state;
		}
	}
}

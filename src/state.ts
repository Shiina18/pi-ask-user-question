export type QuestionItem = { type: "option" } | { type: "input" };

export interface QuestionState {
	questionIndex: number;
	highlightedIndex: number;
	selectedIndex: number | null;
	confirmed: boolean;
	items: QuestionItem[];
	textInputValue: string;
}

export type Action =
	| { type: "navigateUp" }
	| { type: "navigateDown" }
	| { type: "selectCurrent" }
	| { type: "updateTextInput"; text: string };

export function createInitialState(items: QuestionItem[]): QuestionState {
	if (items.length === 0) {
		throw new Error("Question state requires at least one item");
	}

	return {
		questionIndex: 0,
		highlightedIndex: 0,
		selectedIndex: null,
		confirmed: false,
		items,
		textInputValue: "",
	};
}

function isInputItem(state: QuestionState, index: number): boolean {
	return state.items[index]?.type === "input";
}

export function reducer(state: QuestionState, action: Action): QuestionState {
	if (state.confirmed) return state;

	switch (action.type) {
		case "navigateUp": {
			const totalItems = state.items.length;
			const newIndex = state.highlightedIndex === 0 ? totalItems - 1 : state.highlightedIndex - 1;
			return {
				...state,
				highlightedIndex: newIndex,
			};
		}
		case "navigateDown": {
			const totalItems = state.items.length;
			const newIndex = state.highlightedIndex === totalItems - 1 ? 0 : state.highlightedIndex + 1;
			return {
				...state,
				highlightedIndex: newIndex,
			};
		}
		case "selectCurrent": {
			if (isInputItem(state, state.highlightedIndex)) {
				if (state.textInputValue.length === 0) return state;
			}
			return { ...state, selectedIndex: state.highlightedIndex, confirmed: true };
		}
		case "updateTextInput": {
			if (!isInputItem(state, state.highlightedIndex)) return state;
			return { ...state, textInputValue: action.text };
		}
		default: {
			const _exhaustive: never = action;
			return state;
		}
	}
}

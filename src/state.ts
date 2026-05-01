export type QuestionItem = { type: "option" } | { type: "input" };

export interface QuestionState {
	questionIndex: number;
	highlightedIndex: number;
	selectedIndex: number | null;
	selectedIndices: number[];
	multiSelect: boolean;
	isSubmitFocused: boolean;
	confirmed: boolean;
	items: QuestionItem[];
	textInputValue: string;
}

export type Action =
	| { type: "navigateUp" }
	| { type: "navigateDown" }
	| { type: "selectCurrent" }
	| { type: "toggleSelection" }
	| { type: "updateTextInput"; text: string };

export function createInitialState(items: QuestionItem[], multiSelect = false): QuestionState {
	if (items.length === 0) {
		throw new Error("Question state requires at least one item");
	}

	return {
		questionIndex: 0,
		highlightedIndex: 0,
		selectedIndex: null,
		selectedIndices: [],
		multiSelect,
		isSubmitFocused: false,
		confirmed: false,
		items,
		textInputValue: "",
	};
}

function isInputItem(state: QuestionState, index: number): boolean {
	return state.items[index]?.type === "input";
}

function toggleSelection(state: QuestionState): QuestionState {
	if (!state.multiSelect || state.isSubmitFocused) return state;
	const idx = state.highlightedIndex;
	const isSelected = state.selectedIndices.includes(idx);
	if (isSelected) {
		return { ...state, selectedIndices: state.selectedIndices.filter((i) => i !== idx) };
	}
	if (isInputItem(state, idx) && state.textInputValue.length === 0) return state;
	return { ...state, selectedIndices: [...state.selectedIndices, idx] };
}

export function reducer(state: QuestionState, action: Action): QuestionState {
	if (state.confirmed) return state;

	switch (action.type) {
		case "navigateUp": {
			const totalItems = state.items.length;
			if (state.multiSelect && state.isSubmitFocused) {
				return {
					...state,
					highlightedIndex: totalItems - 1,
					isSubmitFocused: false,
				};
			}
			const newIndex = state.highlightedIndex === 0 ? totalItems - 1 : state.highlightedIndex - 1;
			return {
				...state,
				highlightedIndex: newIndex,
				isSubmitFocused: false,
			};
		}
		case "navigateDown": {
			const totalItems = state.items.length;
			if (state.multiSelect && state.isSubmitFocused) {
				return {
					...state,
					highlightedIndex: 0,
					isSubmitFocused: false,
				};
			}
			if (state.multiSelect && state.highlightedIndex === totalItems - 1) {
				return {
					...state,
					isSubmitFocused: true,
				};
			}
			const newIndex = state.highlightedIndex === totalItems - 1 ? 0 : state.highlightedIndex + 1;
			return {
				...state,
				highlightedIndex: newIndex,
				isSubmitFocused: false,
			};
		}
		case "selectCurrent": {
			if (state.multiSelect) {
				if (!state.isSubmitFocused) return toggleSelection(state);
				if (state.selectedIndices.length === 0) return state;
				return { ...state, confirmed: true };
			}
			if (isInputItem(state, state.highlightedIndex)) {
				if (state.textInputValue.length === 0) return state;
			}
			return { ...state, selectedIndex: state.highlightedIndex, confirmed: true };
		}
		case "toggleSelection": {
			if (state.multiSelect && state.isSubmitFocused) {
				if (state.selectedIndices.length === 0) return state;
				return { ...state, confirmed: true };
			}
			return toggleSelection(state);
		}
		case "updateTextInput": {
			if (!isInputItem(state, state.highlightedIndex)) return state;
			if (!state.multiSelect) return { ...state, textInputValue: action.text };
			const idx = state.highlightedIndex;
			const selectedIndices =
				action.text.length > 0
					? state.selectedIndices.includes(idx)
						? state.selectedIndices
						: [...state.selectedIndices, idx]
					: state.selectedIndices.filter((i) => i !== idx);
			return { ...state, selectedIndices, textInputValue: action.text };
		}
		default: {
			const _exhaustive: never = action;
			return state;
		}
	}
}

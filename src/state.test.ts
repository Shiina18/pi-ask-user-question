import { describe, expect, it } from "vitest";
import { createInitialState, reducer } from "./state.js";

describe("createInitialState", () => {
	it("initializes with first option highlighted", () => {
		const state = createInitialState(3);
		expect(state).toEqual({
			questionIndex: 0,
			highlightedIndex: 0,
			selectedIndex: null,
			confirmed: false,
			optionCount: 3,
		});
	});

	it("works with minimum 1 option", () => {
		const state = createInitialState(1);
		expect(state.highlightedIndex).toBe(0);
		expect(state.optionCount).toBe(1);
	});

	it("works with 4 options", () => {
		const state = createInitialState(4);
		expect(state.optionCount).toBe(4);
	});
});

describe("navigateDown", () => {
	it("moves highlight to next option", () => {
		const state = createInitialState(3);
		const next = reducer(state, { type: "navigateDown" });
		expect(next.highlightedIndex).toBe(1);
	});

	it("wraps around from last to first", () => {
		let state = createInitialState(3);
		state = reducer(state, { type: "navigateDown" }); // 0->1
		state = reducer(state, { type: "navigateDown" }); // 1->2
		state = reducer(state, { type: "navigateDown" }); // 2->0 (wrap)
		expect(state.highlightedIndex).toBe(0);
	});

	it("stays at 0 with single option", () => {
		const state = createInitialState(1);
		const next = reducer(state, { type: "navigateDown" });
		expect(next.highlightedIndex).toBe(0);
	});
});

describe("navigateUp", () => {
	it("moves highlight to previous option", () => {
		let state = createInitialState(3);
		state = reducer(state, { type: "navigateDown" }); // 0->1
		state = reducer(state, { type: "navigateUp" }); // 1->0
		expect(state.highlightedIndex).toBe(0);
	});

	it("wraps around from first to last", () => {
		const state = createInitialState(3);
		const next = reducer(state, { type: "navigateUp" });
		expect(next.highlightedIndex).toBe(2);
	});

	it("stays at 0 with single option", () => {
		const state = createInitialState(1);
		const next = reducer(state, { type: "navigateUp" });
		expect(next.highlightedIndex).toBe(0);
	});
});

describe("selectCurrent", () => {
	it("confirms the highlighted option", () => {
		const state = createInitialState(3);
		const result = reducer(state, { type: "selectCurrent" });
		expect(result).toEqual({
			questionIndex: 0,
			highlightedIndex: 0,
			selectedIndex: 0,
			confirmed: true,
			optionCount: 3,
		});
	});

	it("confirms whichever option is highlighted", () => {
		let state = createInitialState(3);
		state = reducer(state, { type: "navigateDown" }); // highlight 1
		state = reducer(state, { type: "selectCurrent" });
		expect(state.selectedIndex).toBe(1);
		expect(state.confirmed).toBe(true);
	});
});

describe("confirmed state blocks actions", () => {
	it("ignores navigateDown after confirmed", () => {
		let state = createInitialState(3);
		state = reducer(state, { type: "selectCurrent" });
		const after = reducer(state, { type: "navigateDown" });
		expect(after).toEqual(state);
	});

	it("ignores navigateUp after confirmed", () => {
		let state = createInitialState(3);
		state = reducer(state, { type: "selectCurrent" });
		const after = reducer(state, { type: "navigateUp" });
		expect(after).toEqual(state);
	});

	it("ignores selectCurrent after confirmed", () => {
		let state = createInitialState(3);
		state = reducer(state, { type: "selectCurrent" });
		const after = reducer(state, { type: "selectCurrent" });
		expect(after).toEqual(state);
	});
});

describe("round-trip navigation", () => {
	it("navigateDown then navigateUp returns to same position", () => {
		const state = createInitialState(4);
		const after = reducer(reducer(state, { type: "navigateDown" }), { type: "navigateUp" });
		expect(after.highlightedIndex).toBe(state.highlightedIndex);
	});

	it("full cycle through all options returns to start", () => {
		let state = createInitialState(3);
		for (let i = 0; i < 3; i++) {
			state = reducer(state, { type: "navigateDown" });
		}
		expect(state.highlightedIndex).toBe(0);
	});
});

package exactcompiler

func firstMethodSource(empty, callable bool) string {
	target := "[x]"
	if empty {
		target = "[]"
	}
	replacement := "9"
	if callable {
		replacement = "function(this: {iterator: typeof I}) { return this.iterator; }"
	}
	return `export {};
const Q = {done: false, value: 3};
const I = {
 result: Q,
 next: function(this: {result: typeof Q}) { return this.result; },
 return: function(this: {result: typeof Q}) { return this.result; }
};
const O = {iterator: I, [Symbol.iterator]: function(this: {iterator: typeof I}) { return this.iterator; }};
const A: {[Symbol.iterator]: number | ((this: {iterator: typeof I}) => typeof I)} = O;
A[Symbol.iterator] = ` + replacement + `;
const ` + target + ` = O;`
}

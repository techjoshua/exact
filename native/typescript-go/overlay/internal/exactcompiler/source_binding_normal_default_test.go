package exactcompiler

func normalDefaultSource(defined, exhausted bool) string {
	value, done := "undefined", "false"
	if defined {
		value = "3"
	}
	if exhausted {
		value, done = "9", "true"
	}
	return `export {};
let mark = 0;
const Q = {done: ` + done + `, value: ` + value + `};
const C = {value: 0};
const I = {
 result: Q, closeResult: C,
 next: function(this: {result: typeof Q}) { return this.result; },
 return: function(this: {closeResult: typeof C}) { return this.closeResult; }
};
const O = {iterator: I, [Symbol.iterator]: function(this: {iterator: typeof I}) { return this.iterator; }};
const [x = (mark = 3, 4)] = O;`
}

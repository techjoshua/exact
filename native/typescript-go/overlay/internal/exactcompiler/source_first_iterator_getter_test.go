package exactcompiler

func firstIteratorGetterThrowSource() string {
	return `export {};
const Q = {done: true, value: 9};
const I = {
 result: Q,
 next: function(this: {result: typeof Q}) { return this.result; },
 return: function(this: {result: typeof Q}) { return this.result; }
};
const O = {
 iterator: I,
 get [Symbol.iterator](): () => typeof I {
  try { throw 9; } finally {}
 }
};
const [] = O;`
}

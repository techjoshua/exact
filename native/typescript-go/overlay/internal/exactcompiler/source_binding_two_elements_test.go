package exactcompiler

// The compiler sees the original qualified source, without counters or hooks.
// The Node witness separately wraps emitted own methods, preserving this and
// arguments, and restores their exact descriptors after the unchanged binding.
const twoElementSource = `export {};
let mark = 0;
const Q = { done: false, value: 3 };
const C = { value: 0 };
const I = {
  result: Q,
  closeResult: C,
  next: function(this: { result: typeof Q }) { return this.result; },
  return: function(this: { closeResult: typeof C }) { return this.closeResult; }
};
const O = {
  iterator: I,
  [Symbol.iterator]: function(this: { iterator: typeof I }) { return this.iterator; }
};
const [x, y] = O;
`

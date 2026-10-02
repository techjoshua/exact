/**
 * Compiler-owned registration uses these module-bound built-ins so application bindings named
 * Object, Reflect, Symbol or Function cannot change generated work or its checking obligations.
 * The record adds no transaction execution dependency and does not wrap authored callables.
 */
export const taskHelperIntrinsics = Object.freeze({ Object, Reflect, Symbol, Function });

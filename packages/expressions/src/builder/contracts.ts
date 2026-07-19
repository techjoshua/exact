import type { ExpressionType } from '../model.js';

export interface FunctionOptions {
	readonly exported?: boolean;
	readonly async?: boolean;
	readonly generator?: boolean;
	readonly returnType?: ExpressionType;
	readonly typeParameters?: readonly string[];
}

export interface MethodOptions extends FunctionOptions {
	readonly static?: boolean;
	readonly access?: 'public' | 'protected' | 'private';
}

export interface PropertyOptions {
	readonly static?: boolean;
	readonly readonly?: boolean;
	readonly optional?: boolean;
	readonly access?: 'public' | 'protected' | 'private';
}

export interface ImportOptions {
	readonly typeOnly?: boolean;
	readonly aliases?: Readonly<Record<string, string>>;
}

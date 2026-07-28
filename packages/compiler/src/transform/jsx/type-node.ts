import type * as ts from '../../native-typescript.js';
import { parseNativeTypeNode } from '../../emission/native-type-parsing.js';

/** Reads a type node from its source representation. */
export function parseTypeNode(source: string): ts.TypeNode {
	return parseNativeTypeNode(source);
}

import type { Child } from '../component/contracts.js';
import type { DoctypeOptions } from './doctype.js';

/** Authored document structure. Omitted html, head, and body elements receive framework defaults. */
export type DocumentProps = { children?: Child | readonly Child[]; doctype?: DoctypeOptions };

/** Compiler-owned document composition boundary preserving supplied elements and reactive bindings. */
export const Document = Symbol.for('@exactjs/document') as symbol &
	((props: DocumentProps) => never);

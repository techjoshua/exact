import type { Child } from '@exactjs/core';

/** Compiler-backed root used to exercise prototype operations through normal renderer entry points. */
export function PrototypePlacementRoot(props: { operation: Child }) {
	return () => props.operation;
}

/** Supplies the already prepared operation without an extra render or discovery pass. */
export function prototypeRoot(operation: Child) {
	return <PrototypePlacementRoot operation={operation} />;
}

/** Authored text host verifies the compiler-to-renderer projection boundary. */
export function PrototypeTextarea(props: { operation: Child }) {
	return () => <textarea>{props.operation}</textarea>;
}

/** Places prepared output inside an authored text-only intrinsic. */
export function prototypeTextarea(operation: Child) {
	return <PrototypeTextarea operation={operation} />;
}

/** Nested authored markup must retain projection structure instead of a DOM program slot. */
export function PrototypeAuthoredTextarea(props: { text: string }) {
	return () => (
		<textarea>
			<span lang="en">{props.text}</span>
		</textarea>
	);
}

/** Exercises ordinary JSX through both compiler targets. */
export function prototypeAuthoredTextarea(text: string) {
	return <PrototypeAuthoredTextarea text={text} />;
}

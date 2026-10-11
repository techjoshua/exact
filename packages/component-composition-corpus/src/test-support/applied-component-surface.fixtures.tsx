import { createContext, type Component } from '@exactjs/core';

const AppliedContext = createContext<string>('applied-context', { keep: 'shared' });
function hasAppliedContext(owner: Component<{}>) {
	return owner.hasContext(AppliedContext);
}
function DirectAppliedSurface(this: Component<{}>) {
	return () => (
		<output data-applied-context data-applied-variant="direct">
			{hasAppliedContext.apply(null, [this]) ? 'present' : 'absent'}
		</output>
	);
}
function SpreadAppliedSurface(this: Component<{}>) {
	return () => (
		<output data-applied-variant="spread">
			{hasAppliedContext.apply(null, [...([this] as const)]) ? 'present' : 'absent'}
		</output>
	);
}
function AliasedAppliedSurface(this: Component<{}>) {
	const argumentsTuple: [Component<{}>] = [this];
	argumentsTuple[0] = this;
	return () => (
		<output data-applied-variant="alias">
			{
				// eslint-disable-next-line prefer-spread -- Exercises capability forwarding through a mutable apply tuple.
				hasAppliedContext.apply(null, argumentsTuple) ? 'present' : 'absent'
			}
		</output>
	);
}
/** Retains helper capabilities across direct, spread and mutated apply argument tuples. */
export function AppliedComponentSurface() {
	return () => (
		<>
			<DirectAppliedSurface />
			<SpreadAppliedSurface />
			<AliasedAppliedSurface />
		</>
	);
}
/** Creates the shared applied-owner context fixture. */
export const appliedComponentRoot = () => <AppliedComponentSurface />;

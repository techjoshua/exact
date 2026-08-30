import type { Component } from '@exactjs/core';

type StructureState = { visible: boolean };
let mountedStructure: Component<StructureState> | undefined;

function ConditionalChild() {
	return () => <em data-role="conditional">visible</em>;
}

function ConditionalRange(this: Component<StructureState>) {
	mountedStructure = this;
	this.state.visible = true;
	return () => (
		<section data-scenario="structure">
			<span data-role="before">before</span>
			{this.state.visible ? <ConditionalChild /> : null}
			<span data-role="after">after</span>
		</section>
	);
}

/** Compiler-issued conditional structural root. */
export const structureRoot = <ConditionalRange />;

/** Reads the mounted conditional-range owner. */
export function structureOwner(): Component<StructureState> {
	if (!mountedStructure) throw new Error('Conditional structure scenario is not mounted');
	return mountedStructure;
}

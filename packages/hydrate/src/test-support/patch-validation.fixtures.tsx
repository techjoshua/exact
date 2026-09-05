import { type Component } from '@exactjs/core';

let ownedInstance: Component<{}> | undefined;

function OwnedPatchIsland(this: Component<{}>) {
	ownedInstance = this;
	return () => <button>Old island</button>;
}

/** Compiler-issued island root used to exercise failing ownership cleanup. */
export const ownedPatchIslandRoot = <OwnedPatchIsland />;

/** Returns the durable compiled owner constructed by the latest fixture mount. */
export function readOwnedPatchIsland(): Component<{}> {
	if (!ownedInstance) throw new Error('Owned patch island has not been constructed');
	return ownedInstance;
}

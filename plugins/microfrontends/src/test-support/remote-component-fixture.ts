const fixtureComponentsKey = '__exactRemoteFixtureComponents';

/** References one exactc-compiled fixture artifact from an isolated deployment entry. */
export function remoteComponentReference(name: string): string {
	return `const ${name} = globalThis.${fixtureComponentsKey}.${name};`;
}

/** Publishes exactc-compiled fixture artifacts to isolated data-module deployment entries. */
export function installRemoteComponentFixtures(
	components: Readonly<Record<string, unknown>>
): void {
	(globalThis as Record<string, unknown>)[fixtureComponentsKey] = components;
}

/** Removes the fixture deployment registry. */
export function removeRemoteComponentFixtures(): void {
	delete (globalThis as Record<string, unknown>)[fixtureComponentsKey];
}

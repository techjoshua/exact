import { readMutationVersion, unwrap } from '@exactjs/reactive/framework/runtime';
import type { IntlEnvironment, IntlEnvironmentState } from './environment.js';
import type { IntlMeasurementPresentation } from './measurement-presentation.js';

type PresentationOwner = {
	environment: IntlEnvironment;
	state: IntlEnvironmentState;
	locale: string;
	generation: number;
	revision: number;
};
const owners = new WeakMap<IntlMeasurementPresentation, PresentationOwner>();

/** Captures update authority before resolution and publishes only within that same environment revision. */
export function ownIntlMeasurementPresentation(
	environment: IntlEnvironment,
	create: () => IntlMeasurementPresentation
): IntlMeasurementPresentation {
	const reactiveState = environment.state;
	const state = unwrap(reactiveState);
	const owner = {
		environment,
		state,
		locale: reactiveState.locale,
		generation: reactiveState.generation,
		revision: stateRevision(state)
	};
	const presentation = create();
	requireCurrentOwner(owner);
	owners.set(presentation, owner);
	return presentation;
}

/** Resolves live formatting authority, rejecting retired revisions even when public state values are restored. */
export function requireIntlMeasurementEnvironment(
	presentation: IntlMeasurementPresentation
): IntlEnvironment {
	const owner = owners.get(presentation);
	if (!owner) throw new TypeError('Intl measurement presentation was not created by intl');
	requireCurrentOwner(owner);
	return owner.environment;
}

/** Reuses monotonically advancing reactive versions without adding observers or a second counter. */
function stateRevision(state: IntlEnvironmentState): number {
	return Math.max(readMutationVersion(state, 'locale'), readMutationVersion(state, 'generation'));
}

/** Keeps public state writable while preserving the identity and mutation history of its owner. */
function requireCurrentOwner(owner: PresentationOwner): void {
	const state = owner.environment.state;
	if (
		unwrap(state) !== owner.state ||
		state.locale !== owner.locale ||
		state.generation !== owner.generation ||
		stateRevision(owner.state) !== owner.revision
	)
		throw new TypeError(
			'Intl measurement presentation must be resolved again after an intl update'
		);
}

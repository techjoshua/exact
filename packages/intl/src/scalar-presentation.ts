import { createContext, unwrap, type Reactive } from '@exactjs/core';
import type { IntlEnvironment } from './environment.js';
import { intlLocaleMetadata } from './environment.js';
import type { PreparedIntlActivation } from './prepared.js';
import { isPreparedIntlActivation } from './prepared.js';
import { renderIntlActivation, renderIntlSourceActivation } from './render.js';

/** Read-only scalar text produced by one existing compiler-prepared intl activation. */
export interface IntlScalarPresentation {
	/** Current translation, or the prepared source pattern when no translation applies. */
	readonly value: string;
	/** The same activation rendered strictly from its authored source pattern. */
	readonly source: string;
	readonly locale: string;
	readonly direction: 'ltr' | 'rtl';
}

/** Receiver-owned reactive slot populated while one scalar message remains mounted. */
export type IntlScalarPresentationConsumer = Reactive<{
	presentation?: IntlScalarPresentation;
}>;

/** Shared optional context through which scalar intl output is explicitly published. */
export const IntlScalarPresentationContext = createContext<IntlScalarPresentationConsumer>(
	'@exactjs/intl.scalar-presentation',
	{ global: true, reactive: false, keep: 'shared' }
);

/** Internal shape shared by the prepared intl role components. */
export interface IntlScalarActivationSource {
	readonly message?: unknown;
	readonly plural?: unknown;
	readonly select?: unknown;
	readonly unit?: unknown;
	readonly cldr?: unknown;
	readonly currency?: unknown;
}

/** Publishes one prepared scalar activation to the nearest opt-in consumer. */
export function publishIntlScalarPresentation(
	source: IntlScalarActivationSource,
	environment: IntlEnvironment,
	consumer: IntlScalarPresentationConsumer
): (() => void) | undefined {
	const activation = findScalarActivation(source);
	if (!activation) return undefined;
	const presentation = new PreparedIntlScalarPresentation(source, environment, activation);
	consumer.presentation = presentation;
	return () => {
		if (consumer.presentation === presentation) consumer.presentation = undefined;
	};
}

class PreparedIntlScalarPresentation implements IntlScalarPresentation {
	constructor(
		private readonly sourceProps: IntlScalarActivationSource,
		private readonly environment: IntlEnvironment,
		initial: PreparedIntlActivation
	) {
		assertScalarActivation(initial);
	}

	get value(): string {
		return scalarText(
			renderIntlActivation(requireScalarActivation(this.sourceProps), this.environment)
		);
	}

	get source(): string {
		return scalarText(
			renderIntlSourceActivation(requireScalarActivation(this.sourceProps), this.environment)
		);
	}

	get locale(): string {
		return this.environment.state.locale;
	}

	get direction(): 'ltr' | 'rtl' {
		return intlLocaleMetadata(this.environment.state.locale).dir;
	}
}

function requireScalarActivation(source: IntlScalarActivationSource): PreparedIntlActivation {
	const activation = findScalarActivation(source);
	if (activation) return activation;
	throw new TypeError('Intl scalar presentation requires one prepared activation');
}

function findScalarActivation(
	source: IntlScalarActivationSource
): PreparedIntlActivation | undefined {
	for (const candidate of [
		source.message,
		source.plural,
		source.select,
		source.unit,
		source.cldr,
		source.currency
	]) {
		const value = unwrap(candidate);
		if (!isPreparedIntlActivation(value)) continue;
		assertScalarActivation(value);
		return value;
	}
	return undefined;
}

function assertScalarActivation(activation: PreparedIntlActivation): void {
	if (
		activation.descriptor.bindings.some(
			(binding) => binding.kind === 'element' || binding.kind === 'opaque'
		)
	)
		throw new TypeError('Intl messages containing structure cannot publish a scalar presentation');
}

function scalarText(children: readonly unknown[]): string {
	let output = '';
	for (const child of children) {
		const value = unwrap(child);
		if (typeof value === 'string' || typeof value === 'number') output += String(value);
		else if (value !== undefined && value !== null && typeof value !== 'boolean')
			throw new TypeError('Intl scalar presentation produced non-text content');
	}
	return output;
}

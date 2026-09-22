/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace attributes. */
import type { Component } from '@exactjs/core';
import {
	IntlProvider,
	IntlMessage,
	createIntlEnvironment,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { prepareIntlActivation } from '@exactjs/intl/internal';
import { Presentation } from './presentation.js';
import * as presentation from './routing.js' with { type: 'exact-enhancement' };

/** Common behavior available before and after the target redesign. */
export type ComparisonKind = 'plain' | 'intrinsic' | 'component' | 'explicit' | 'intl';
/** Durable receivers mutated by the timed update workload. */
export const owners: Component<{ value: number }>[] = [];
const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'enhancement-comparison',
	occurrenceId: 'Message:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [{ index: 0, kind: 'value', type: 'number' }],
	source: [{ kind: 'value', binding: 0 }],
	capabilities: []
};
const environment = createIntlEnvironment({ locale: 'en-US', descriptors: [descriptor] });

function TextReceiver(this: Component<{ value: number }>) {
	this.state.value = 0;
	owners.push(this);
	return () => <>{this.state.value}</>;
}

function ElementReceiver(this: Component<{ value: number }>) {
	this.state.value = 0;
	owners.push(this);
	return () => <span>{this.state.value}</span>;
}

function IntlReceiver(this: Component<{ value: number }>) {
	this.state.value = 0;
	owners.push(this);
	return () => (
		<>
			<IntlMessage message={prepareIntlActivation(descriptor, [this.state.value])} />
		</>
	);
}

function Population(props: { kind: ComparisonKind; count: number }) {
	return () => (
		<section>
			{Array.from({ length: props.count }, (_, index) =>
				props.kind === 'plain' ? (
					<TextReceiver key={index} />
				) : props.kind === 'intl' ? (
					<IntlReceiver key={index} />
				) : props.kind === 'component' ? (
					<ElementReceiver key={index} presentation:label="measured" />
				) : props.kind === 'explicit' ? (
					<Presentation key={index} label="measured">
						<span>
							<TextReceiver />
						</span>
					</Presentation>
				) : (
					<span key={index} presentation:label="measured">
						<TextReceiver />
					</span>
				)
			)}
		</section>
	);
}

/** Creates the same observable population on both ABI epochs. */
export function population(kind: ComparisonKind, count: number) {
	return kind === 'intl' ? (
		<IntlProvider environment={environment}>
			<Population kind={kind} count={count} />
		</IntlProvider>
	) : (
		<Population kind={kind} count={count} />
	);
}

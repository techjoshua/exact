/* eslint-disable @typescript-eslint/no-unused-vars -- exactc consumes enhancement namespace attributes. */
import type { Component } from '@exactjs/core';
import {
	IntlProvider,
	IntlMessage,
	createIntlEnvironment,
	type IntlRuntimeDescriptorV1
} from '@exactjs/intl';
import { prepareIntlActivation } from '@exactjs/intl/internal';
import { Presentation } from './enhancement-presentation.js';
import * as presentation from './enhancement-routing.js' with { type: 'exact-enhancement' };
import * as secondary from './enhancement-secondary.js' with { type: 'exact-enhancement' };

/** Retained receiving instances used to measure scalar updates independently of route changes. */
export const receivingOwners: Component<{ value: number }>[] = [];
/** Observable lifecycle accounting shared by all benchmark variants. */
export const enhancementLifecycle = { mounted: 0, disposed: 0 };

/** Comparable plain, presentation-host, and real internationalized fragment populations. */
export type PopulationKind =
	| 'plain'
	| 'intrinsic'
	| 'explicit'
	| 'enhanced'
	| 'coalesced'
	| 'intl'
	| 'intl-enhanced';
const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'enhancement-performance',
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

function IntlText(this: Component<{ value: number }>) {
	this.state.value = 0;
	receivingOwners.push(this);
	this.onMount(() => enhancementLifecycle.mounted++);
	this.onUnmount(() => enhancementLifecycle.disposed++);
	return () => (
		<>
			<IntlMessage message={prepareIntlActivation(descriptor, [this.state.value])} />
		</>
	);
}

function UnawareText(this: Component<{ value: number }>) {
	this.state.value = 0;
	receivingOwners.push(this);
	this.onMount(() => enhancementLifecycle.mounted++);
	this.onUnmount(() => enhancementLifecycle.disposed++);
	return () => <>{this.state.value}</>;
}

function Population(props: { kind: PopulationKind; count: number }) {
	return () => (
		<section>
			{Array.from({ length: props.count }, (_, index) =>
				props.kind === 'intrinsic' ? (
					<span key={index} presentation:label="measured">
						<UnawareText />
					</span>
				) : props.kind === 'coalesced' ? (
					<_ key={index} presentation:label="measured" secondary:lang="en">
						<UnawareText />
					</_>
				) : props.kind === 'intl' ? (
					<IntlText key={index} />
				) : props.kind === 'intl-enhanced' ? (
					<_ key={index} presentation:label="measured">
						<IntlText />
					</_>
				) : props.kind === 'plain' ? (
					<UnawareText key={index} />
				) : props.kind === 'explicit' ? (
					<Presentation key={index} label="measured">
						<span>
							<UnawareText />
						</span>
					</Presentation>
				) : (
					<UnawareText key={index} presentation:label="measured" />
				)
			)}
		</section>
	);
}

/** Comparable populations with plain, explicit-host, or runtime-selected fragment presentation. */
export function enhancementPopulation(kind: PopulationKind, count: number) {
	if (kind === 'intl' || kind === 'intl-enhanced')
		return (
			<IntlProvider environment={environment}>
				<Population kind={kind} count={count} />
			</IntlProvider>
		);
	return <Population kind={kind} count={count} />;
}

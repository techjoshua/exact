import {
	createComponentRegistry,
	hasComponent,
	renderComponent,
	type ActionContext,
	type Component,
	type ComponentAction,
	type ComponentSelection,
	type ComponentProps,
	type KeyOf
} from '@exactjs/core';

declare const component: Component<Record<string, never>>;

const contextFree = component.action('context free', async (value: string) => value.length);
const contextFreeContract: ComponentAction<[string], number> = contextFree;
const contextFreeResult: Promise<number> = contextFreeContract('value');

const contextual = component.action(
	'contextual',
	async (value: string, { signal, generation }: ActionContext) => {
		if (signal.aborted) return generation;
		return value.length;
	},
	'latest'
);
const contextualContract: ComponentAction<[string], number> = contextual;
const contextualResult: Promise<number> = contextualContract('value');
// @ts-expect-error ActionContext is runtime-injected and excluded from the public argument tuple.
contextualContract('value', {} as ActionContext);

function Summary(this: Component<Record<string, never>>, props: { summary: string }) {
	return () => props.summary;
}

function Details(this: Component<Record<string, never>>, props: { detail: number }) {
	return () => props.detail;
}

const Report = createComponentRegistry(({ lazy }) => ({
	summary: Summary,
	details: lazy(async () => Details)
}));

const reportKey: KeyOf<typeof Report> = 'details';
// @ts-expect-error Registry keys remain the finite definition union.
const invalidReportKey: KeyOf<typeof Report> = 'missing';
const reportSelection: ComponentSelection<typeof Report> = {
	component: 'details',
	props: { detail: 1 }
};
renderComponent(Report, reportSelection);
const summaryProps: ComponentProps<typeof Report.summary> = { summary: 'ready' };
// @ts-expect-error Static registry members retain their specific component props.
const invalidSummaryProps: ComponentProps<typeof Report.summary> = { detail: 1 };
declare const untrustedReportKey: string;
if (hasComponent(Report, untrustedReportKey)) {
	const narrowedReportKey: KeyOf<typeof Report> = untrustedReportKey;
	const selectedReportComponent = Report[untrustedReportKey];
	void [narrowedReportKey, selectedReportComponent];
}
const invalidSelection: ComponentSelection<typeof Report> = {
	component: 'summary',
	// @ts-expect-error Correlated selection props must match their selected entry.
	props: { detail: 1 }
};

void [
	contextFreeResult,
	contextualResult,
	reportKey,
	invalidReportKey,
	invalidSelection,
	summaryProps,
	invalidSummaryProps
];

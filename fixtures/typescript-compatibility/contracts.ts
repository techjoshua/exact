import {
	bindTask,
	createTaskOwner,
	createComponentRegistry,
	defineTask,
	hasComponent,
	renderComponent,
	TaskContext,
	type BoundTaskFunction,
	type Component,
	type ComponentSelection,
	type ComponentProps,
	type KeyOf
} from '@exactjs/core';

const owner = createTaskOwner({ label: 'type-compatibility' });
const contextFree = bindTask(
	defineTask(
		{ label: 'context free', owner },
		async (value: string, _task: TaskContext) => value.length
	),
	{ owner }
);
const contextFreeContract: BoundTaskFunction<[string], number> = contextFree;
const contextFreeResult: Promise<number> = contextFreeContract('value');

const contextual = bindTask(
	defineTask(
		{ label: 'contextual', owner, concurrency: 'latest' },
		async (value: string, task: TaskContext) => {
			if (task.signal.aborted) return task.generation;
			return value.length;
		}
	),
	{ owner }
);
const contextualContract: BoundTaskFunction<[string], number> = contextual;
const contextualResult: Promise<number> = contextualContract('value');
// @ts-expect-error TaskContext is runtime-injected and excluded from authored arguments.
contextualContract('value', TaskContext);

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

import { TaskContext, createContext, createRef, type Child, type Component } from '@exactjs/core';

const preparedContext = createContext<string>('prepared-chain-context', true);

/** Self-closing placement receives its implicit child without an authored props parameter. */
export function ImplicitPreparedEnhancement() {
	return () => <_target title="implicit" />;
}

/** Destructuring props must not hide the independently supplied child from target lowering. */
export function DestructuredPreparedEnhancement({ label }: { label: string }) {
	return () => <_target title={label} />;
}

/** Supplies context before the chain's dependent component is prepared. */
export function PreparedContextProvider(this: Component<Record<string, never>>) {
	preparationAudit.setup++;
	this.setContext(preparedContext, 'provided');
	this.onUnmount(() => preparationAudit.disposed++);
	return () => <_target />;
}

/** Requires the context owned by the earlier contributor without seeing later peers. */
export function PreparedContextConsumer(this: Component<Record<string, never>>) {
	preparationAudit.setup++;
	const label = this.getContext(preparedContext);
	this.onUnmount(() => preparationAudit.disposed++);
	return () => <_target title={label} />;
}

/** Observable lifecycle counters for the preparation acceptance fixture. */
export const preparationAudit = { setup: 0, mounted: 0, disposed: 0 };
/** Presentation ref must stay empty until native output is committed. */
export const preparationRef = createRef<Element>('prepared-presentation');
/** Retains the durable instance so the test can exercise a post-commit state update. */
export let preparationInstance: Component<{ label: string }> | undefined;

/** A real contributing component used to verify preparation and attachment ownership. */
export function PreparedEnhancement(this: Component<{ label: string }>) {
	preparationAudit.setup++;
	preparationInstance = this;
	this.state.label = 'prepared';
	this.onMount(() => preparationAudit.mounted++);
	this.onUnmount(() => preparationAudit.disposed++);
	return () => <_target title={this.state.label} ref={this.ref(preparationRef)} />;
}

/** Creates a real compiled enhancement component receipt for deferred native placement. */
export function preparationRoot(child: Child) {
	return <PreparedEnhancement>{child}</PreparedEnhancement>;
}

/** A client-only contribution still requires the same host in server output. */
export function RefOnlyEnhancement(this: Component<Record<string, never>>) {
	return () => <_target ref={this.ref(preparationRef)} />;
}

/** A contribution-free enhancement must not materialize a fragment host. */
export function PreparedPassthrough() {
	return () => <_target />;
}

/** A target placement without contributed props must leave its fragment transparent. */
export function transparentPreparationRoot(child: Child) {
	return <PreparedPassthrough>{child}</PreparedPassthrough>;
}

/** Durable structural contributor for reactive host retention checks. */
export let structuralPreparationOwner: Component<{ title: string }>;

/** An authored wrapper separates transparent fragment contribution groups. */
export function StructuralPreparedEnhancement(this: Component<{ title: string }>) {
	structuralPreparationOwner = this;
	this.state.title = 'structural';
	return () => (
		<article data-structural="true">
			<_target title={this.state.title} />
		</article>
	);
}

/** Settles a server contribution asynchronously before its fragment host is serialized. */
export function AsyncPreparedEnhancement(
	this: Component<{ label: string }>,
	props: { label: string }
) {
	preparationAudit.setup++;
	this.state.label = 'pending';
	this.onUnmount(() => preparationAudit.disposed++);
	const prepare = async (label: string, _task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		await Promise.resolve();
		this.state.label = label;
	};
	prepare(props.label);
	return () => <_target title={this.state.label} />;
}

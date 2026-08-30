import type { Component } from '@exactjs/core';

function ReadyParagraph(this: Component<{}>) {
	return () => <p>ready</p>;
}

function IdentifiedParagraph(this: Component<{}>, props: { id: string; label: string }) {
	return () => <p id={props.id}>{props.label}</p>;
}

const listItems = [
	{ id: 'a', kind: 'primary' },
	{ id: 'b', kind: 'secondary' }
];

let listRootInstance: Component<{ kind: string }> | undefined;

function MarkerlessListRoot(this: Component<{ kind: string }>) {
	listRootInstance = this;
	this.state.kind = 'all';
	return () => (
		<section>
			<select
				value={this.state.kind}
				onChange={(event) => {
					this.state.kind = (event.currentTarget as HTMLSelectElement).value;
				}}
			>
				<option value="all">All</option>
				<option value="primary">Primary</option>
			</select>
			<ul>
				{this.map(
					listItems.filter((item) => this.state.kind === 'all' || item.kind === this.state.kind),
					(item) => item.id,
					() => (
						<li data-testid="row" />
					),
					'root-hydration-items'
				)}
			</ul>
		</section>
	);
}

/** Compiler-owned root shared by focused hydration integration tests. */
export const readyParagraphRoot = <ReadyParagraph />;

/** Creates a compiler-owned identified paragraph root. */
export const identifiedParagraphRoot = (id: string, label: string) => (
	<IdentifiedParagraph id={id} label={label} />
);

/** Compiler-owned stateful list root. */
export const markerlessListRoot = <MarkerlessListRoot />;

/** Reads the mounted stateful list fixture instance. */
export function mountedMarkerlessListRoot(): Component<{ kind: string }> {
	if (!listRootInstance) throw new Error('Markerless list fixture has not been mounted');
	return listRootInstance;
}

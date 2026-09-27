import {
	Activity,
	Suspense,
	createComponentRegistry,
	type ActivityMode,
	type Component
} from '@exactjs/core';
import { lazyActivityOwners } from './activity-lazy-control.js';

const Views = createComponentRegistry(({ lazy }) => ({
	panel: lazy(() => import('./activity-lazy-panel.fixtures.js').then(({ Panel }) => Panel))
}));

/** Two roots share module loading while retaining independent Activity ownership. */
export function LazyActivity(this: Component<{ mode: ActivityMode }>, props: { label: string }) {
	lazyActivityOwners.set(props.label, this);
	this.state.mode = 'active';
	return () => (
		<Activity mode={this.state.mode}>
			<Suspense fallback={<p>loading</p>}>
				<Views.panel label={props.label} />
			</Suspense>
		</Activity>
	);
}

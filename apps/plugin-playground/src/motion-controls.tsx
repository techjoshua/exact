import { createRef, type Component } from '@exactjs/core';
import {
	animate,
	defineMotion,
	Motion,
	Presence,
	type MotionEffect,
	type MotionPlayback
} from '@exactjs/motion';

const panelMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateY(8px)' },
			{ opacity: 1, transform: 'none' }
		],
		options: { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }
	},
	leave: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'translateY(-6px)' }
		],
		options: { duration: 130, easing: 'ease-in' }
	},
	reduced: 'skip'
});

const disclosureMotion = defineMotion({
	enter: {
		keyframes: [
			{
				opacity: 0,
				clipPath: 'inset(0 0 100% 0)',
				transform: 'scaleY(.82)',
				transformOrigin: 'top'
			},
			{
				opacity: 1,
				clipPath: 'inset(0)',
				transform: 'scaleY(1)',
				transformOrigin: 'top'
			}
		],
		options: { duration: 340, easing: 'cubic-bezier(.16,1,.3,1)' }
	},
	leave: {
		keyframes: [
			{ opacity: 1, clipPath: 'inset(0)', transform: 'scaleY(1)', transformOrigin: 'top' },
			{
				opacity: 0,
				clipPath: 'inset(0 0 100% 0)',
				transform: 'scaleY(.88)',
				transformOrigin: 'top'
			}
		],
		options: { duration: 220, easing: 'ease-in' }
	},
	reduced: 'skip'
});

const toastMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateX(20px) scale(.96)' },
			{ opacity: 1, transform: 'none' }
		],
		options: { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }
	},
	leave: {
		keyframes: [
			{ opacity: 1, transform: 'none' },
			{ opacity: 0, transform: 'translateX(16px) scale(.96)' }
		],
		options: { duration: 150, easing: 'ease-in' }
	},
	reduced: 'skip'
});

type MotionControlsState = {
	activeTab: 'profile' | 'activity';
	expanded: boolean;
	toastVisible: boolean;
};

const indicatorTransforms = {
	profile: 'translateX(0)',
	activity: 'translateX(calc(100% + 4px))'
} as const;

function indicatorChange(
	from: MotionControlsState['activeTab'],
	to: MotionControlsState['activeTab']
): MotionEffect {
	return {
		keyframes: [
			{ transform: indicatorTransforms[from] },
			{ transform: indicatorTransforms[to] }
		],
		options: { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }
	};
}

/** Common state-driven controls enhanced with optional motion. */
export function MotionControls(this: Component<MotionControlsState>) {
	this.state.activeTab = 'profile';
	this.state.expanded = false;
	this.state.toastVisible = false;
	const tabIndicator = createRef<HTMLElement>('plugin-playground-tab-indicator');
	let indicatorPlayback: MotionPlayback | undefined;
	const selectTab = (tab: MotionControlsState['activeTab']) => {
		if (tab === this.state.activeTab) return;
		const previousTab = this.state.activeTab;
		this.state.activeTab = tab;
		const indicator = this.refs.get(tabIndicator);
		if (!indicator) return;
		indicatorPlayback?.cancel('tab-selection-changed');
		indicatorPlayback = animate(indicator, indicatorChange(previousTab, tab));
	};
	this.onUnmount(() => indicatorPlayback?.cancel('tab-control-unmounted'));

	return () => (
		<section className="demo-card motion-demo" aria-labelledby="motion-title">
			<div className="demo-heading">
				<div>
					<p className="eyebrow">Motion</p>
					<h2 id="motion-title">State changes with visual continuity</h2>
				</div>
				<span className="package-label">@exactjs/motion</span>
			</div>

			<div className="tab-list" role="tablist" aria-label="Account information">
				<span
					className="tab-indicator"
					aria-hidden="true"
					ref={this.ref(tabIndicator)}
					style={{ transform: indicatorTransforms[this.state.activeTab] }}
				/>
					<button
						role="tab"
						aria-selected={this.state.activeTab === 'profile'}
						onClick={() => selectTab('profile')}
					>
						<span className="tab-label">Profile</span>
					</button>
					<button
						role="tab"
						aria-selected={this.state.activeTab === 'activity'}
						onClick={() => selectTab('activity')}
					>
						<span className="tab-label">Activity</span>
					</button>
				</div>
			<div className="tab-panel">
				<Presence when mode="out-in">
					{this.state.activeTab === 'profile' ? (
						<Motion key="profile" as="div" motion={panelMotion} role="tabpanel">
							<strong>Jordan Lee</strong>
							<p>Design systems · Pacific time · Available for review</p>
						</Motion>
					) : (
						<Motion key="activity" as="div" motion={panelMotion} role="tabpanel">
							<strong>Three updates today</strong>
							<p>Published tokens, reviewed navigation, and resolved two comments.</p>
						</Motion>
					)}
				</Presence>
			</div>

			<div className="control-row">
				<button
					className="primary-button"
					onClick={() => (this.state.toastVisible = !this.state.toastVisible)}
				>
					{this.state.toastVisible ? 'Dismiss toast' : 'Save changes'}
				</button>
				<button
					className="secondary-button"
					aria-expanded={this.state.expanded}
					onClick={() => (this.state.expanded = !this.state.expanded)}
				>
					{this.state.expanded ? 'Hide details' : 'Show details'}
				</button>
			</div>

			<Presence when={this.state.expanded}>
				<Motion key="details" as="div" className="disclosure" motion={disclosureMotion}>
					Motion follows committed state; it does not own whether this disclosure is open.
				</Motion>
			</Presence>
			<Presence when={this.state.toastVisible}>
				<Motion className="toast" key="saved" as="div" role="status" motion={toastMotion}>
					<span className="toast-icon">✓</span>
					<div>
						<strong>Changes saved</strong>
						<small>Your account settings are up to date.</small>
					</div>
				</Motion>
			</Presence>
		</section>
	);
}

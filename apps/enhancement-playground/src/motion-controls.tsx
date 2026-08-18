import type { Component } from '@exactjs/core';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by motion:* attributes.
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { defineMotion, Presence, type MotionEffect } from '@exactjs/motion';
import { slideLeft, slideUp } from '@exactjs/motion/presets';

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
		keyframes: [{ transform: indicatorTransforms[from] }, { transform: indicatorTransforms[to] }],
		options: { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }
	};
}

/** Common state-driven controls enhanced with optional motion. */
export function MotionControls(this: Component<MotionControlsState>) {
	this.state.activeTab = 'profile';
	this.state.expanded = false;
	this.state.toastVisible = false;
	let previousTab: MotionControlsState['activeTab'] = 'profile';
	const selectTab = (tab: MotionControlsState['activeTab']) => {
		if (tab === this.state.activeTab) return;
		previousTab = this.state.activeTab;
		this.state.activeTab = tab;
	};

	return () => (
		<section
			theme:surface="raised"
			className="demo-card motion-demo"
			aria-labelledby="motion-title"
		>
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
					motion:change={indicatorChange(previousTab, this.state.activeTab)}
					style={{ transform: indicatorTransforms[this.state.activeTab] }}
				/>
				<button
					theme:selection="strong"
					role="tab"
					aria-selected={this.state.activeTab === 'profile'}
					onClick={() => selectTab('profile')}
				>
					<span className="tab-label">Profile</span>
				</button>
				<button
					theme:selection="strong"
					role="tab"
					aria-selected={this.state.activeTab === 'activity'}
					onClick={() => selectTab('activity')}
				>
					<span className="tab-label">Activity</span>
				</button>
			</div>
			<div theme:surface="sunken" className="tab-panel">
				<Presence when mode="out-in">
					{this.state.activeTab === 'profile' ? (
						<div key="profile" motion:apply={slideUp} role="tabpanel">
							<strong>Jordan Lee</strong>
							<p>Design systems · Pacific time · Available for review</p>
						</div>
					) : (
						<div key="activity" motion:apply={slideUp} role="tabpanel">
							<strong>Three updates today</strong>
							<p>Published tokens, reviewed navigation, and resolved two comments.</p>
						</div>
					)}
				</Presence>
			</div>

			<div className="control-row">
				<button
					theme:action="primary"
					className="primary-button"
					onClick={() => (this.state.toastVisible = !this.state.toastVisible)}
				>
					{this.state.toastVisible ? 'Dismiss toast' : 'Save changes'}
				</button>
				<button
					theme:action="secondary"
					className="secondary-button"
					aria-expanded={this.state.expanded}
					onClick={() => (this.state.expanded = !this.state.expanded)}
				>
					{this.state.expanded ? 'Hide details' : 'Show details'}
				</button>
			</div>

			<Presence when={this.state.expanded}>
				<div key="details" className="disclosure" motion:apply={disclosureMotion}>
					Motion follows committed state; it does not own whether this disclosure is open.
				</div>
			</Presence>
			<Presence when={this.state.toastVisible}>
				<div
					theme:status="success"
					className="toast"
					key="saved"
					role="status"
					motion:apply={slideLeft}
				>
					<span className="toast-icon">✓</span>
					<div>
						<strong>Changes saved</strong>
						<small>Your account settings are up to date.</small>
					</div>
				</div>
			</Presence>
		</section>
	);
}

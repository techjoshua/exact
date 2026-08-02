import type { Component } from '@exactjs/core';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by motion:* attributes.
import motion from '@exactjs/motion' with { type: 'exact-plugin' };
import { defineMotion } from '@exactjs/motion';

const panelMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateY(8px)' },
			{ opacity: 1, transform: 'none' }
		],
		options: { duration: 180, easing: 'ease-out' }
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

const toastMotion = defineMotion({
	enter: {
		keyframes: [
			{ opacity: 0, transform: 'translateX(20px) scale(.96)' },
			{ opacity: 1, transform: 'none' }
		],
		options: { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }
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

/** Common state-driven controls enhanced with optional motion. */
export function MotionControls(this: Component<MotionControlsState>) {
	this.state.activeTab = 'profile';
	this.state.expanded = false;
	this.state.toastVisible = false;

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
				<button
					role="tab"
					aria-selected={this.state.activeTab === 'profile'}
					onClick={() => (this.state.activeTab = 'profile')}
				>
					Profile
				</button>
				<button
					role="tab"
					aria-selected={this.state.activeTab === 'activity'}
					onClick={() => (this.state.activeTab = 'activity')}
				>
					Activity
				</button>
			</div>
			<div className="tab-panel">
				{this.state.activeTab === 'profile' ? (
					<div key="profile" motion:apply={panelMotion} motion:appear role="tabpanel">
						<strong>Jordan Lee</strong>
						<p>Design systems · Pacific time · Available for review</p>
					</div>
				) : (
					<div key="activity" motion:apply={panelMotion} motion:appear role="tabpanel">
						<strong>Three updates today</strong>
						<p>Published tokens, reviewed navigation, and resolved two comments.</p>
					</div>
				)}
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

			{this.state.expanded ? (
				<div className="disclosure" motion:apply={panelMotion} motion:appear>
					Motion follows committed state; it does not own whether this disclosure is open.
				</div>
			) : null}
			{this.state.toastVisible ? (
				<div className="toast" key="saved" role="status" motion:apply={toastMotion} motion:appear>
					<span className="toast-icon">✓</span>
					<div>
						<strong>Changes saved</strong>
						<small>Your account settings are up to date.</small>
					</div>
				</div>
			) : null}
		</section>
	);
}

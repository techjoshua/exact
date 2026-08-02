import type { Component } from '@exactjs/core';
import { defineMotion, LayoutGroup, Motion, Presence } from '@exactjs/motion';

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

			<LayoutGroup id="account-tabs">
				<div className="tab-list" role="tablist" aria-label="Account information">
					<button
						role="tab"
						aria-selected={this.state.activeTab === 'profile'}
						onClick={() => (this.state.activeTab = 'profile')}
					>
						{this.state.activeTab === 'profile' ? (
							<Motion
								key="active-tab-indicator"
								as="span"
								className="tab-indicator"
								layout="position"
								layoutId="active-tab-indicator"
							/>
						) : null}
						<span className="tab-label">Profile</span>
					</button>
					<button
						role="tab"
						aria-selected={this.state.activeTab === 'activity'}
						onClick={() => (this.state.activeTab = 'activity')}
					>
						{this.state.activeTab === 'activity' ? (
							<Motion
								key="active-tab-indicator"
								as="span"
								className="tab-indicator"
								layout="position"
								layoutId="active-tab-indicator"
							/>
						) : null}
						<span className="tab-label">Activity</span>
					</button>
				</div>
			</LayoutGroup>
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

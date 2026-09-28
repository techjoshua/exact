import { LocalizationContext, TaskContext, type Component } from '@exactjs/core';

const number = new Intl.NumberFormat('en-US');

/** Exercises explicit and compiler-selected localization through one component owner. */
export function IntlOwner(this: Component<{ value: number; formatted: string }>) {
	this.state.value = 1234.5;
	this.state.formatted = '';
	const format = async (prefix: string, task: TaskContext = TaskContext.server()) => {
		void task;
		this.state.formatted =
			prefix +
			[
				new Intl.NumberFormat('en-US').format(this.state.value),
				this.intl.NumberFormat('en-US').format(this.state.value),
				number.format(this.state.value),
				this.state.value.toLocaleString('en-US')
			].join('|');
	};
	function formatAgain(task: TaskContext = TaskContext.server()) {
		void task;
		return new Intl.NumberFormat('en-US').format(1234.5);
	}
	return () => (
		<section>
			<p>{number.format(this.state.value)}</p>
			<p>{this.state.value.toLocaleString('en-US')}</p>
			<p>{this.intl.NumberFormat('en-US').format(this.state.value)}</p>
			<button data-format onClick={() => format('value:')}>
				Format
			</button>
			<button
				data-again
				onClick={async () => {
					this.state.formatted = await formatAgain();
				}}
			>
				Again
			</button>
			<output>{this.state.formatted}</output>
		</section>
	);
}

/** Provides a mutable locale without sharing component ownership between roots. */
export function IntlHost(this: Component<{ locale: string }>, props: { locale: string }) {
	this.state.locale = props.locale;
	const owner = this;
	this.setContext(LocalizationContext, {
		get locale() {
			return owner.state.locale;
		},
		sourceLocale: 'en-US'
	});
	return () => (
		<>
			<button data-french onClick={() => (this.state.locale = 'fr-FR')}>
				French
			</button>
			<IntlOwner />
		</>
	);
}

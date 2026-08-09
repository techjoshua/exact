import type { Component } from '@exactjs/core';

type CardinalForms = Readonly<Record<Intl.LDMLPluralRule, string>>;

const cardinalExamples: readonly Readonly<{
	locale: string;
	label: string;
	direction: 'ltr' | 'rtl';
	rules: Intl.PluralRules;
	forms: CardinalForms;
}>[] = [
	{
		locale: 'ar-EG',
		label: 'Arabic',
		direction: 'rtl',
		rules: new Intl.PluralRules('ar-EG'),
		forms: {
			zero: 'لا رسائل',
			one: 'رسالة',
			two: 'رسالتان',
			few: 'رسائل',
			many: 'رسالة',
			other: 'رسالة'
		}
	},
	{
		locale: 'pl-PL',
		label: 'Polish',
		direction: 'ltr',
		rules: new Intl.PluralRules('pl-PL'),
		forms: {
			zero: 'wiadomości',
			one: 'wiadomość',
			two: 'wiadomości',
			few: 'wiadomości',
			many: 'wiadomości',
			other: 'wiadomości'
		}
	},
	{
		locale: 'fr-FR',
		label: 'French',
		direction: 'ltr',
		rules: new Intl.PluralRules('fr-FR'),
		forms: {
			zero: 'message',
			one: 'message',
			two: 'messages',
			few: 'messages',
			many: 'messages',
			other: 'messages'
		}
	},
	{
		locale: 'hi-IN',
		label: 'Hindi',
		direction: 'ltr',
		rules: new Intl.PluralRules('hi-IN'),
		forms: {
			zero: 'संदेश',
			one: 'संदेश',
			two: 'संदेश',
			few: 'संदेश',
			many: 'संदेश',
			other: 'संदेश'
		}
	}
];

/** Props for the native cardinal-rule comparison. */
export interface PluralRulesShowcaseProps {
	count: number;
}

/** Shows how one value selects different native cardinal categories and authored forms. */
export function PluralRulesShowcase(
	this: Component<Record<string, never>>,
	props: PluralRulesShowcaseProps
) {
	return () => (
		<section className="plural-rules-showcase" aria-labelledby="plural-rules-title">
			<div>
				<p className="eyebrow">Source-locale inference</p>
				<h2 id="plural-rules-title">One count, four cardinal systems</h2>
				<p>
					These are direct <code>Intl.PluralRules</code> lookups—the same category-map shape the
					native analyzer lowers inside an internationalized message.
				</p>
			</div>
			<div className="plural-rules-grid">
				{cardinalExamples.map((example) => {
					const category = example.rules.select(props.count);
					return (
						<article lang={example.locale} dir={example.direction}>
							<span>{example.label}</span>
							<code>{example.locale}</code>
							<strong>
								{props.count} {example.forms[category]}
							</strong>
							<small>{category}</small>
						</article>
					);
				})}
			</div>
		</section>
	);
}

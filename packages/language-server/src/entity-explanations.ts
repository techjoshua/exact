import type { ExactSourceEntity } from '@exactjs/compiler';

/** Formats normalized compiler classification facts for hover and inlay presentation. */
export function entityFacts(entity: ExactSourceEntity): string[] {
	const classification = entity.classification;
	if (!classification) return [];
	if (classification.kind === 'initializer')
		return [`Runs **${classification.execution}** with **${classification.placement}** placement.`];
	if (classification.kind === 'render')
		return [
			...(classification.referencedComponent
				? [
						`\`${entity.name ?? 'Component'}\` is a **${classification.referencedComponent.placement} component** rendered at this element.`,
						`Boundary classification: **${classification.referencedComponent.boundary}**.`
					]
				: []),
			'Runs as fine-grained **reactive** render work.',
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			)
		];
	if (classification.kind === 'task')
		return [
			`${capitalize(classification.origin)} **${classification.readiness} ${classification.placement}** task.`,
			`Priority: **${classification.priority}**. Publication: **${classification.publication}**.`,
			`Cancellation: **${classification.cancellation}**.`,
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			),
			...classification.effects.map(
				(effect) =>
					`Effect: \`${effect.path ?? effect.kind}\`${effect.confidence === 'exact' ? '' : ` (${effect.confidence})`}`
			)
		];
	if (classification.kind === 'action')
		return [
			`Runs as a named **${classification.placement}** action.`,
			`Concurrency: **${classification.concurrency}**.`
		];
	return [];
}

/** Formats typed compiler inference reasons without discarding related causal evidence. */
export function reasonFacts(entity: ExactSourceEntity): string[] {
	return entity.reasons.flatMap((reason) => [
		`**Why:** ${reason.summary}`,
		...(reason.related ?? []).map((related) => `- ${related.summary}`)
	]);
}

/** Capitalizes one normalized compiler enum value for sentence presentation. */
export function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

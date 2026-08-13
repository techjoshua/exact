import type {
	ExactDeclarativeAttributeV1,
	ExactDeclarativeLanguageContributionV1,
	ExactJsxAttributeV1,
	ExactLanguageCompletionV1,
	ExactLanguageDiagnosticV1,
	ExactLanguageHoverV1,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';

/** Evaluates fixed protocol predicates over compiler-owned JSX facts. */
export function evaluateDeclarativeDiagnostics(
	contribution: ExactDeclarativeLanguageContributionV1,
	projection: ExactLanguageProjectionV1
): readonly ExactLanguageDiagnosticV1[] {
	const diagnostics: ExactLanguageDiagnosticV1[] = [];
	for (const element of projection.jsx) {
		for (const attribute of element.attributes) {
			const declaration = declarationFor(contribution, attribute);
			if (!declaration) continue;
			const severity = declaration.severity ?? 'error';
			if (
				declaration.targets?.length &&
				(!element.tag || !declaration.targets.includes(element.tag))
			)
				diagnostics.push({
					code: 'invalid-target',
					severity,
					range: attribute.nameRange,
					summary: `${attribute.name} is not supported on ${element.tag ?? element.kind}.`,
					explanation: `Supported intrinsic targets: ${declaration.targets.join(', ')}.`
				});
			for (const required of declaration.requires ?? [])
				if (!hasAttribute(element.attributes, attribute.namespace, required))
					diagnostics.push({
						code: `requires-${codePart(required)}`,
						severity,
						range: attribute.nameRange,
						summary: `${attribute.name} requires ${qualified(attribute.namespace, required)}.`,
						explanation: declaration.description
					});
			for (const excluded of declaration.excludes ?? [])
				if (hasAttribute(element.attributes, attribute.namespace, excluded))
					diagnostics.push({
						code: `excludes-${codePart(excluded)}`,
						severity,
						range: attribute.nameRange,
						summary: `${attribute.name} cannot be combined with ${qualified(attribute.namespace, excluded)}.`,
						explanation: declaration.description
					});
			validateValue(attribute, declaration, severity, diagnostics);
		}
	}
	return Object.freeze(diagnostics);
}

/** Returns finite attribute or value completions at one source cursor. */
export function evaluateDeclarativeCompletions(
	contribution: ExactDeclarativeLanguageContributionV1,
	projection: ExactLanguageProjectionV1,
	position: number
): readonly ExactLanguageCompletionV1[] {
	for (const element of projection.jsx)
		for (const attribute of element.attributes) {
			if (
				!attribute.valueRange ||
				position < attribute.valueRange.start ||
				position > attribute.valueRange.end
			)
				continue;
			const declaration = declarationFor(contribution, attribute);
			if (!declaration?.values) return [];
			return Object.freeze(
				declaration.values.map((value) => ({
					label: value.value,
					detail: value.deprecated ? 'Deprecated enhancement value' : declaration.description,
					documentation: value.description,
					insertText: value.value
				}))
			);
		}
	const source = projection.document.text;
	if (!source) return [];
	const match = /([A-Za-z_$][\w$-]*):([\w-]*)$/u.exec(
		source.slice(Math.max(0, position - 80), position)
	);
	if (!match) return [];
	const namespace = contribution.capabilities.namespaces.find((entry) => entry.name === match[1]);
	if (!namespace) return [];
	const prefix = match[2] ?? '';
	return Object.freeze(
		namespace.attributes
			.filter((attribute) => attribute.name.startsWith(prefix))
			.map((attribute) => ({
				label: attribute.name,
				detail: attribute.description,
				documentation: attribute.documentation,
				replace: { start: position - prefix.length, end: position }
			}))
	);
}

/** Returns declarative documentation for the smallest matching authored attribute. */
export function evaluateDeclarativeHover(
	contribution: ExactDeclarativeLanguageContributionV1,
	projection: ExactLanguageProjectionV1,
	position: number
): ExactLanguageHoverV1 | undefined {
	for (const element of projection.jsx)
		for (const attribute of element.attributes) {
			if (position < attribute.range.start || position > attribute.range.end) continue;
			const declaration = declarationFor(contribution, attribute);
			if (!declaration) continue;
			return Object.freeze({
				range: attribute.range,
				markdown: [
					`### \`${attribute.name}\``,
					declaration.description,
					...(declaration.targets?.length
						? [`**Targets:** ${declaration.targets.map((target) => `\`${target}\``).join(', ')}`]
						: []),
					...(declaration.values?.length
						? [`**Values:** ${declaration.values.map((value) => `\`${value.value}\``).join(', ')}`]
						: []),
					...(declaration.documentation ? [`[Documentation](${declaration.documentation})`] : [])
				].join('\n\n')
			});
		}
	return undefined;
}

function declarationFor(
	contribution: ExactDeclarativeLanguageContributionV1,
	attribute: ExactJsxAttributeV1
): ExactDeclarativeAttributeV1 | undefined {
	if (!attribute.namespace) return undefined;
	return contribution.capabilities.namespaces
		.find((namespace) => namespace.name === attribute.namespace)
		?.attributes.find((candidate) => candidate.name === attribute.localName);
}

function validateValue(
	attribute: ExactJsxAttributeV1,
	declaration: ExactDeclarativeAttributeV1,
	severity: ExactLanguageDiagnosticV1['severity'],
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	if (declaration.valueKind === 'boolean' && attribute.valueKind !== 'boolean')
		diagnostics.push(
			valueDiagnostic(
				attribute,
				severity,
				'boolean-value',
				`${attribute.name} is a boolean activator.`
			)
		);
	if (
		declaration.valueKind === 'nonempty-string' &&
		attribute.valueKind === 'string' &&
		attribute.constant === ''
	)
		diagnostics.push(
			valueDiagnostic(attribute, severity, 'empty-value', `${attribute.name} must not be empty.`)
		);
	if (
		declaration.valueKind === 'id-token-list' &&
		typeof attribute.constant === 'string' &&
		!validIdTokenList(attribute.constant)
	)
		diagnostics.push(
			valueDiagnostic(
				attribute,
				severity,
				'invalid-id-token-list',
				`${attribute.name} must contain valid ID tokens.`
			)
		);
	if (declaration.values && typeof attribute.constant === 'string') {
		const selected = declaration.values.find((value) => value.value === attribute.constant);
		if (!selected)
			diagnostics.push(
				valueDiagnostic(
					attribute,
					severity,
					'invalid-value',
					`${attribute.name} must be one of: ${declaration.values.map((value) => value.value).join(', ')}.`
				)
			);
		else if (selected.deprecated)
			diagnostics.push({
				...valueDiagnostic(
					attribute,
					'warning',
					'deprecated-value',
					`${attribute.constant} is deprecated.`
				),
				tags: ['deprecated'],
				explanation: selected.replacement
					? `Use ${selected.replacement} instead.`
					: selected.description
			});
	}
}

function valueDiagnostic(
	attribute: ExactJsxAttributeV1,
	severity: ExactLanguageDiagnosticV1['severity'],
	code: string,
	summary: string
): ExactLanguageDiagnosticV1 {
	return {
		code,
		severity,
		range: attribute.valueRange ?? attribute.range,
		summary
	};
}

function hasAttribute(
	attributes: readonly ExactJsxAttributeV1[],
	namespace: string | undefined,
	name: string
): boolean {
	const [qualifiedNamespace, localName] = name.includes(':')
		? name.split(':', 2)
		: [namespace, name];
	return attributes.some(
		(attribute) => attribute.namespace === qualifiedNamespace && attribute.localName === localName
	);
}

function qualified(namespace: string | undefined, name: string): string {
	return name.includes(':') || !namespace ? name : `${namespace}:${name}`;
}

function validIdTokenList(value: string): boolean {
	const tokens = value.trim().split(/\s+/u);
	return tokens.length > 0 && tokens.every((token) => /^[A-Za-z][\w:.-]*$/u.test(token));
}

function codePart(value: string): string {
	return value.replace(/[^a-z0-9-]+/giu, '-').toLocaleLowerCase();
}

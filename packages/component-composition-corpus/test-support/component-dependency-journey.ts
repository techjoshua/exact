import { flushSync } from '@exactjs/reactive';
import { unmount } from '@exactjs/dom/root';
import {
	dependencyButton,
	dependencyOwner,
	mountDependencyOwner
} from './component-dependency.fixtures.js';

/** Checks direct-owner input publication, next interaction, retained refs and final cleanup. */
export async function verifyComponentDependencyTransaction() {
	const host = document.createElement('div');
	document.body.append(host);
	const reports: unknown[] = [];
	try {
		mountDependencyOwner(host, 'first', { onErrorReport: (report) => reports.push(report.error) });
		const owner = dependencyOwner;
		const section = host.querySelector('section');
		const button = host.querySelector('button');
		if (!section || !button || owner.refs.get(dependencyButton) !== button)
			throw new Error('Missing initial dependency owner/ref anchor');
		mountDependencyOwner(host, 'second', { onErrorReport: (report) => reports.push(report.error) });
		if (
			dependencyOwner !== owner ||
			host.querySelector('section') !== section ||
			host.querySelector('button') !== button
		)
			throw new Error('Input delivery replaced a retained direct owner');
		if (
			section.title !== 'second' ||
			host.querySelector('[data-dependency-child]')?.textContent !== 'second'
		)
			throw new Error('Parent input did not reach its current child');
		button.click();
		flushSync();
		if (host.querySelector('[data-dependency-count]')?.textContent !== '1')
			throw new Error('Following interaction did not progress');
		unmount(host);
		if (owner.refs.get(dependencyButton) !== undefined || host.childNodes.length)
			throw new Error('Dependency owner cleanup retained a ref or DOM range');
		mountDependencyOwner(host, 'fresh', { onErrorReport: (report) => reports.push(report.error) });
		if (
			dependencyOwner === owner ||
			host.querySelector('[data-dependency-count]')?.textContent !== '0'
		)
			throw new Error('A fresh owner reused retired state');
		unmount(host);
		if (reports.length) throw reports[0];
		return { retained: true, input: true, progress: true, cleanup: true, fresh: true, reports };
	} finally {
		unmount(host);
		host.remove();
	}
}

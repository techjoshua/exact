import { describe, expect, it } from 'vitest';
import { PrototypeTargetBindings, type TargetCandidate } from './prototypes/target-bindings.js';
import {
	FragmentPresentationHosts,
	type FragmentContribution
} from '@exactjs/core/framework/render-structure';

const candidate = (
	kind: TargetCandidate<object>['kind'] = 'intrinsic'
): TargetCandidate<object> => ({
	identity: Symbol('target'),
	kind,
	target: {}
});
const owner = (
	tag?: string,
	props: Record<string, unknown> = { className: undefined }
): FragmentContribution => ({
	owner: Symbol('owner'),
	tag,
	props
});

describe('independent target binding prototype', () => {
	it('retains same-target selections and does no discovery on repeated reads', () => {
		const bindings = new PrototypeTargetBindings();
		const target = candidate();
		const slot = Symbol();
		bindings.stage('motion', slot, true, target);
		const first = bindings.read('motion');
		const visits = bindings.candidateVisits;
		for (let index = 0; index < 10000; index++) expect(bindings.read('motion')).toBe(first);
		expect(bindings.candidateVisits).toBe(visits);
		bindings.stage('motion', slot, true, { ...target });
		expect(bindings.read('motion')).toBe(first);
		bindings.dispose();
		expect(bindings.read('motion').status).toBe('absent');
	});

	it('separates namespaces, explicit dormancy, and bounded fallback', () => {
		const bindings = new PrototypeTargetBindings();
		const host = candidate();
		const text = candidate('text');
		const slot = Symbol();
		bindings.setFallback(host);
		bindings.stage('intl', slot, true, text);
		expect(bindings.read('motion')).toMatchObject({ status: 'ready', candidate: host });
		expect(bindings.read('intl')).toMatchObject({ status: 'ready', candidate: text });
		bindings.stage('intl', slot, true);
		expect(bindings.read('intl').status).toBe('dormant');
		bindings.stage('intl', slot, false);
		expect(bindings.read('intl')).toMatchObject({ status: 'ready', candidate: host });
		bindings.remove('intl', slot);
		bindings.publish();
		expect(bindings.read('intl')).toMatchObject({ status: 'ready', candidate: host });
	});

	it('validates duplicate active candidates without publishing other dirty namespaces', () => {
		const bindings = new PrototypeTargetBindings();
		const initial = candidate();
		const slot = Symbol();
		bindings.stage('a', slot, true, initial);
		const previous = bindings.read('a');
		bindings.stage('a', slot, true, candidate());
		bindings.stage('b', Symbol(), true, candidate());
		const duplicate = Symbol();
		bindings.stage('b', duplicate, true, candidate());
		expect(() => bindings.publish()).toThrow('Multiple active enhancement roots');
		bindings.stage('a', slot, true, initial);
		bindings.remove('b', duplicate);
		bindings.publish();
		expect(bindings.read('a')).toBe(previous);
	});
});

describe('fragment host planning prototype', () => {
	it('wraps only actual or declared contributions, retaining undefined values', () => {
		const hosts = new FragmentPresentationHosts();
		const empty = owner('aside', {});
		expect(hosts.reconcile([empty])).toHaveLength(0);
		expect(hosts.reconcile([{ ...empty, props: { key: 'x' } }])).toHaveLength(0);
		const declared = { ...empty, declaredHostProps: true };
		expect(hosts.reconcile([declared])).toMatchObject([{ tag: 'aside' }]);
		hosts.dispose();
		expect(hosts.reconcile([owner(undefined)])).toMatchObject([{ tag: 'span' }]);
	});

	it('coalesces consecutive equal tags in source order without merging owners', () => {
		const hosts = new FragmentPresentationHosts();
		const owners = [owner(), owner(), owner('div'), owner()];
		const plan = hosts.reconcile(owners);
		expect(plan.map((host) => host.tag)).toEqual(['span', 'div', 'span']);
		expect(plan.map((host) => host.owners.length)).toEqual([2, 1, 1]);
		expect(plan[0]!.owners).toEqual(owners.slice(0, 2));
	});

	it('latches spread requirements and preserves surviving host identity after removal', () => {
		const hosts = new FragmentPresentationHosts();
		const first = owner(undefined, {});
		const second = owner();
		expect(hosts.reconcile([first])).toHaveLength(0);
		const created = hosts.reconcile([{ ...first, props: { title: undefined } }, second])[0]!;
		const latched = hosts.reconcile([first, second])[0]!;
		expect(latched.identity).toBe(created.identity);
		expect(hosts.reconcile([second])[0]!.identity).toBe(created.identity);
		expect(hosts.reconcile([])).toHaveLength(0);
		expect(hosts.reconcile([first])).toHaveLength(0);
	});

	it('does not compact existing groups or cross structural barriers', () => {
		const hosts = new FragmentPresentationHosts();
		const [first, middle, last] = [owner(), owner('div'), owner()];
		const initial = hosts.reconcile([first!, middle!, last!]);
		const removed = hosts.reconcile([first!, last!]);
		expect(removed.map((host) => host.identity)).toEqual([
			initial[0]!.identity,
			initial[2]!.identity
		]);
		hosts.dispose();
		expect(
			hosts.reconcile([first!, { ...middle!, props: {}, structuralBarrier: true }, last!])
		).toHaveLength(2);
	});
});

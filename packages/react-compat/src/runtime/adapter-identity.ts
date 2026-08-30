import {
	componentDomainTarget,
	currentComponentDomain
} from '@exactjs/core/framework/component-domains';

/** Returns the target of the component domain currently converting React-owned values. */
export function reactCompatibilityArtifactTarget(): 'client' | 'server' {
	const domain = currentComponentDomain();
	return domain ? componentDomainTarget(domain) : 'client';
}

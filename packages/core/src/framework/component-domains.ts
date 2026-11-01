export {
	componentDomainInspection,
	componentDomainLogging,
	componentDomainResumption,
	componentDomainTarget,
	componentDomainWallClockSnapshot,
	componentDomainUsesWallClock,
	createFrameworkComponentDomain,
	callWithComponentDomain,
	currentComponentDomain,
	isHydrationComponentDomain,
	markComponentDomainWallClockUsed,
	markComponentDomainLoggerOverride,
	setComponentDomainLogger,
	withComponentDomain,
	withComponentDomainSnapshot,
	type ComponentDomainCapabilities,
	type ComponentDomainLogging,
	type FrameworkComponentDomainOptions
} from '../component/domain.js';
export type {
	ComponentResumptionSource,
	IndexedComponentResumptionActivation
} from '../component/contracts.js';

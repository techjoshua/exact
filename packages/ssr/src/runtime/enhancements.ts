import {
	activateSsrEnhancements,
	activateSsrEnhancementsAsync
} from '../render/enhancements.js';
import { registerSsrEnhancementExecutionCapability } from '../render/enhancement-execution-capability.js';
import {
	applySsrTargetContributions,
	applySsrTargetContributionsAsync
} from '../render/target-contributions.js';

registerSsrEnhancementExecutionCapability({
	activate: activateSsrEnhancements,
	activateAsync: activateSsrEnhancementsAsync,
	applyTarget: applySsrTargetContributions,
	applyTargetAsync: applySsrTargetContributionsAsync
});

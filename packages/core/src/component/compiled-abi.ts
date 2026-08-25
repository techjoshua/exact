/** The compiled render arrow only constructs compiler-owned live readers once. */
export const compiledComponentRenderABI = 1;

/** The component registers authored lifecycle or resource-ownership work. */
export const compiledComponentLifecycleABI = 2;

/** The component uses the general runtime list capability. */
export const compiledComponentListsABI = 4;

/** The component needs task, interaction, or compatibility execution ownership. */
export const compiledComponentTasksABI = 8;

/** Complete capability ABI used by explicitly constructed framework-owned boundary artifacts. */
export const generalComponentABI =
	compiledComponentLifecycleABI | compiledComponentListsABI | compiledComponentTasksABI;

/** Global property under which compiled artifacts carry their target-local contract. */
export const exactComponentContract = Symbol.for('@exactjs/component-contract');

/** Global marker distinguishing a native eXact component from compatibility-owned functions. */
export const exactComponentType = Symbol.for('@exactjs/component');

let nextComponentId = 1;

/** Allocates the process-local diagnostic identity shared by every client instance storage lane. */
export function allocateComponentInstanceId(): string {
	return `c${nextComponentId++}`;
}

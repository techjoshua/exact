/** Holds the event consumer installed by the mounted fixture. */
export const handlerReceipt = { current: undefined };
/** Receives an event after module initialization replaces the initially empty declaration. */
export function reassignedHandler() {}
reassignedHandler = function (event) {
	handlerReceipt.current?.(event);
};

/** The declaration exposes arity, while the JavaScript implementation owns event consumption. */
export declare function reassignedHandler(): void;
/** Connects the fixture owner without an opaque setup call. */
export declare const handlerReceipt: { current?: (event?: { type: string }) => void };

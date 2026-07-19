/**
 * Public compiler API.
 *
 * Implementation modules live with their owning domains. Consumers inside this
 * package should import those owners directly instead of importing this facade.
 */
export * from './compilation/compiler.js';

import { TaskContext, type Component } from '@exactjs/core';
import { IdentityProvider } from './IdentityProvider.js';
import { ServerAuthorizationContext, ServerBrandContext } from './identity-context.js';

/**
 * Reads protected server contexts and projects only explicitly shared public
 * results into client-visible component state.
 */
export function ServerIdentityProjection(
	this: Component<{
		roleNames: string;
		brandName: string;
		brandAccent: string;
	}>
) {
	this.state.roleNames ??= '';
	this.state.brandName ??= '';
	this.state.brandAccent ??= '';

	const projectIdentity = async (_task: TaskContext = TaskContext.server()) => {
		await Promise.resolve();
		const authorization = this.getContext(ServerAuthorizationContext);
		const brand = this.getContext(ServerBrandContext);
		const publicBrand = brand.publicBrand();
		this.state.roleNames = authorization.roles().join(',');
		this.state.brandName = publicBrand.name;
		this.state.brandAccent = publicBrand.accent;
	};
	void projectIdentity();

	return () => (
		<IdentityProvider
			initial={{
				roles: this.state.roleNames.split(',').filter(Boolean),
				brand: {
					name: this.state.brandName,
					accent: this.state.brandAccent
				}
			}}
		/>
	);
}

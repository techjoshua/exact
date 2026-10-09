/** Retains an already lowered artifact's target when a build or test host evaluates both projections. */
export function exactGeneratedArtifactTarget(id: string): 'client' | 'server' | undefined {
	return /\.exact\.(client|server)\.[cm]?[jt]sx?(?:$|\?)/i.exec(id)?.[1]?.toLowerCase() as
		| 'client'
		| 'server'
		| undefined;
}

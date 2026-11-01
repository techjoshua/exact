/** Shared physical DOM address key across independently loaded matching providers. This is not operation authority. */
export const compiledElementIdentity = Symbol.for('@exactjs/physical-element-identity');

/** Matches only ASCII case variants of the compiler-reserved HTML attribute. */
export function isReservedElementIdentityName(name: string): boolean {
	return /^[dD][aA][tT][aA]-[eE][xX][aA][cC][tT]-[iI][dD]$/.test(name);
}

/** Reads the compiler-installed own data value without executing an authored metadata accessor. */
export function physicalElementIdentity(props: object): string | undefined {
	return Object.getOwnPropertyDescriptor(props, compiledElementIdentity)?.value;
}

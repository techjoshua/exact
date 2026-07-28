package main

import "github.com/microsoft/typescript-go/internal/exactcompiler"

// linkedExtensions is replaced by the native distribution build when it
// statically links first-party or application-selected compiler extensions.
func linkedExtensions() []exactcompiler.Extension {
	return nil
}

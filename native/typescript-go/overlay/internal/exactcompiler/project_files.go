package exactcompiler

import (
	"os"

	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"github.com/microsoft/TypeScript/tsc/internal/tsoptions"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"github.com/microsoft/TypeScript/tsc/internal/vfs/osvfs"
)

// projectFiles delegates root selection to the same TypeScript config parser used
// by semantic checking. It neither adds an explicit source root nor installs overlays.
func projectFiles(request Request, response Response) Response {
	if request.ConfigFile == "" {
		response.Error = "project file selection requires a configFile"
		return response
	}
	root := request.Root
	if root == "" {
		var err error
		root, err = os.Getwd()
		if err != nil {
			response.Error = err.Error()
			return response
		}
	}
	configFile := tspath.GetNormalizedAbsolutePath(request.ConfigFile, root)
	host := compiler.NewCompilerHost(root, bundled.WrapFS(osvfs.FS()), bundled.LibPath(), nil, nil, nil)
	parsed, diagnostics := tsoptions.GetParsedCommandLineOfConfigFile(configFile, nil, nil, host, nil)
	if parsed != nil {
		diagnostics = append(diagnostics, parsed.Errors...)
		response.ProjectFiles = append([]string{}, parsed.FileNames()...)
	}
	for _, diagnostic := range diagnostics {
		response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
	}
	return response
}

package exactcompiler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

func (lowering *jsxLowering) configuredExactComponent(reference externalImportReference) bool {
	if lowering.interop == nil {
		return false
	}
	for _, component := range lowering.interop.ExactComponents {
		if component.ModuleSpecifier == reference.moduleSpecifier &&
			component.ExportName == reference.exportName {
			return true
		}
	}
	return false
}

type publishedComponentManifest struct {
	Name                  string `json:"name"`
	ExactComponentLibrary struct {
		Protocol int    `json:"protocol"`
		Build    string `json:"build"`
	} `json:"exactComponentLibrary"`
}

type publishedComponentBuild struct {
	Protocol int `json:"protocol"`
	Package  struct {
		Name string `json:"name"`
	} `json:"package"`
	Exports []struct {
		Subpath    string `json:"subpath"`
		ExportName string `json:"exportName"`
	} `json:"exports"`
}

// publishedExactComponent admits an imported JSX tag only when the dependency's inert protocol-2
// build facts publish that exact package subpath and export. It never evaluates dependency source
// or asks the runtime value whether it happens to look like a native component.
func (lowering *jsxLowering) publishedExactComponent(
	symbol *ast.Symbol,
	reference externalImportReference,
) bool {
	if reference.namespace || reference.moduleSpecifier == "" || strings.HasPrefix(reference.moduleSpecifier, ".") {
		return false
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		key := sourceFile.FileName() + "\x00" + reference.moduleSpecifier + "\x00" + reference.exportName
		if value, exists := lowering.publishedComponentImports[key]; exists {
			return value
		}
		value := publishedComponentExport(sourceFile.FileName(), reference)
		lowering.publishedComponentImports[key] = value
		if value {
			return true
		}
	}
	return false
}

func publishedComponentExport(filename string, reference externalImportReference) bool {
	directory := filepath.Dir(filename)
	for {
		manifestFile := filepath.Join(directory, "package.json")
		contents, error := os.ReadFile(manifestFile)
		if error == nil {
			var manifest publishedComponentManifest
			if json.Unmarshal(contents, &manifest) == nil &&
				manifest.Name != "" &&
				packageSubpath(manifest.Name, reference.moduleSpecifier) != "" {
				return publishedComponentBuildExports(directory, manifest, reference)
			}
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return false
		}
		directory = parent
	}
}

func publishedComponentBuildExports(
	packageRoot string,
	manifest publishedComponentManifest,
	reference externalImportReference,
) bool {
	if manifest.ExactComponentLibrary.Protocol != 2 || manifest.ExactComponentLibrary.Build == "" {
		return false
	}
	contents, error := os.ReadFile(filepath.Join(packageRoot, filepath.FromSlash(manifest.ExactComponentLibrary.Build)))
	if error != nil {
		return false
	}
	var build publishedComponentBuild
	if json.Unmarshal(contents, &build) != nil || build.Protocol != 2 || build.Package.Name != manifest.Name {
		return false
	}
	subpath := packageSubpath(manifest.Name, reference.moduleSpecifier)
	for _, exported := range build.Exports {
		if exported.Subpath == subpath && exported.ExportName == reference.exportName {
			return true
		}
	}
	return false
}

func packageSubpath(packageName string, moduleSpecifier string) string {
	if moduleSpecifier == packageName {
		return "."
	}
	prefix := packageName + "/"
	if strings.HasPrefix(moduleSpecifier, prefix) {
		return "./" + strings.TrimPrefix(moduleSpecifier, prefix)
	}
	return ""
}

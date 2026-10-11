package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// nativeNeutralReceiver recognizes standard-library receiver contracts without
// treating same-named application types as portable. Read-only collection views
// constrain mutation, not the environments in which their methods can execute.
func nativeNeutralReceiver(value *checker.Type) bool {
	symbol := value.Symbol()
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	switch symbol.Name {
	case "Map", "Set", "Array", "ReadonlyMap", "ReadonlySet", "ReadonlyArray":
		if symbol.Parent != nil {
			return false
		}
	default:
		if symbol.Parent == nil || symbol.Parent.Name != "Intl" {
			return false
		}
		if _, known := cachedIntlConstructors[symbol.Name]; !known {
			return false
		}
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if !standardLibrarySource(source) {
			return false
		}
		name := filepath.Base(source.FileName())
		if !strings.HasPrefix(name, "lib.es") || !strings.HasSuffix(name, ".d.ts") {
			return false
		}
	}
	return true
}

// exactIntlReceiver recognizes the framework facade through its declaration owner.
// Naming a user-defined interface IntlFacade does not establish portable execution.
func exactIntlReceiver(value *checker.Type) bool {
	symbol := value.Symbol()
	if symbol == nil || symbol.Name != "IntlFacade" || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil {
			return false
		}
		name := strings.ReplaceAll(source.FileName(), `\`, "/")
		if !strings.Contains(name, "/packages/core/") && !strings.Contains(name, "/@exactjs/core/") {
			return false
		}
	}
	return true
}

// nativePortableEventReceiver recognizes standard event primitives shared by supported
// execution runtimes. DOM subclasses and application-defined names retain their own placement.
func nativePortableEventReceiver(value *checker.Type) bool {
	return nativePortableEventSymbol(value.Symbol())
}

// nativePortableEventSymbol verifies the declaration owner of the portable contract.
func nativePortableEventSymbol(symbol *ast.Symbol) bool {
	if symbol == nil || symbol.Parent != nil || len(symbol.Declarations) == 0 || (symbol.Name != "Event" && symbol.Name != "EventTarget") {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if !standardLibrarySource(source) {
			return false
		}
		name := filepath.Base(source.FileName())
		if name != "lib.dom.d.ts" && name != "lib.webworker.d.ts" {
			return false
		}
	}
	return true
}

// nativeReceiverMemberEnvironment preserves standard method ownership through
// mapped views and DOM subclasses whose displayed name hides the declaring interface.
func nativeReceiverMemberEnvironment(expression *ast.Node, typeChecker *checker.Checker) string {
	symbol := nativeReceiverMemberSymbol(expression, typeChecker)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return ""
	}
	environment := ""
	for _, declaration := range symbol.Declarations {
		if exactReactiveValueMember(declaration) {
			if environment != "" && environment != "neutral" {
				return ""
			}
			environment = "neutral"
			continue
		}
		owner := declaration.Parent
		if owner == nil || !ast.IsInterfaceDeclaration(owner) {
			return ""
		}
		ownerSymbol := typeChecker.GetSymbolAtLocation(owner.Name())
		if ownerSymbol == nil {
			return ""
		}
		current := ""
		if nativeNeutralMember(declaration, ownerSymbol) {
			current = "neutral"
		} else if nativePortableEventMember(declaration, ownerSymbol) {
			current = "neutral"
		} else if browserReceiverType.MatchString(ownerSymbol.Name) || strings.HasPrefix(ownerSymbol.Name, "HTML") || strings.HasPrefix(ownerSymbol.Name, "SVG") {
			source := ast.GetSourceFileOfNode(declaration)
			if !standardLibrarySource(source) || filepath.Base(source.FileName()) != "lib.dom.d.ts" {
				return ""
			}
			current = "browser"
		}
		if current == "" || (environment != "" && environment != current) {
			return ""
		}
		environment = current
	}
	return environment
}

// exactReactiveValueMember follows framework declaration ownership through aliases and mapped
// views. Application-defined ReactiveValue types do not acquire a framework execution contract.
func exactReactiveValueMember(declaration *ast.Node) bool {
	owner := declaration.Parent
	if owner == nil || !ast.IsTypeLiteralNode(owner) || owner.Parent == nil || !ast.IsTypeAliasDeclaration(owner.Parent) || owner.Parent.Name() == nil || owner.Parent.Name().Text() != "ReactiveValue" {
		return false
	}
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil {
		return false
	}
	name := strings.ReplaceAll(source.FileName(), `\`, "/")
	return strings.Contains(name, "/packages/reactive/") || strings.Contains(name, "/@exactjs/reactive/")
}

// nativeNeutralMember checks the selected method declaration independently of
// unrelated global augmentations, including Intl namespace interfaces. Added
// methods never inherit built-in authority.
func nativeNeutralMember(declaration *ast.Node, owner *ast.Symbol) bool {
	if owner.Parent != nil {
		if owner.Parent.Name != "Intl" {
			return false
		}
		if _, known := cachedIntlConstructors[owner.Name]; !known {
			return false
		}
	} else {
		switch owner.Name {
		case "Map", "Set", "Array", "ReadonlyMap", "ReadonlySet", "ReadonlyArray":
		default:
			return false
		}
	}
	source := ast.GetSourceFileOfNode(declaration)
	if !standardLibrarySource(source) {
		return false
	}
	name := filepath.Base(source.FileName())
	return strings.HasPrefix(name, "lib.es") && strings.HasSuffix(name, ".d.ts")
}

// nativeReceiverMemberDeclarations fences display-name fallbacks to selected
// standard-library members. Application extensions keep their own authority.
func nativeReceiverMemberDeclarations(expression *ast.Node, typeChecker *checker.Checker) bool {
	symbol := nativeReceiverMemberSymbol(expression, typeChecker)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if !standardLibrarySource(source) {
			return false
		}
		name := filepath.Base(source.FileName())
		if !(strings.HasPrefix(name, "lib.es") && strings.HasSuffix(name, ".d.ts")) && name != "lib.dom.d.ts" && name != "lib.webworker.d.ts" {
			return false
		}
	}
	return true
}

// nativePortableEventMember retains portable standard methods when an
// application augments Event or EventTarget with unrelated members.
func nativePortableEventMember(declaration *ast.Node, owner *ast.Symbol) bool {
	if owner.Name != "Event" && owner.Name != "EventTarget" {
		return false
	}
	source := ast.GetSourceFileOfNode(declaration)
	if !standardLibrarySource(source) {
		return false
	}
	name := filepath.Base(source.FileName())
	return name == "lib.dom.d.ts" || name == "lib.webworker.d.ts"
}

// nativeReceiverMemberSymbol resolves literal and narrowed computed keys without
// using receiver spelling as execution authority.
func nativeReceiverMemberSymbol(expression *ast.Node, typeChecker *checker.Checker) *ast.Symbol {
	receiver, name := restrictedInvocationMember(unwrapSourceCallableReference(expression), typeChecker)
	if receiver != nil && name != "" {
		return typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(receiver), name)
	}
	return typeChecker.GetSymbolAtLocation(expression)
}

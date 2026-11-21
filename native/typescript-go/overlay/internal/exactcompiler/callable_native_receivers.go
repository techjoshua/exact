package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// portableNativeContainerName centralizes standard collection and byte-storage contracts.
// Callers must still prove declaration ownership before granting execution authority.
func portableNativeContainerName(name string) bool {
	switch name {
	case "Map", "Set", "Array", "ReadonlyMap", "ReadonlySet", "ReadonlyArray":
		return true
	}
	return standardByteStorageName(name)
}

func standardByteStorageName(name string) bool {
	switch name {
	case "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
		"Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array", "ArrayBuffer", "DataView":
		return true
	default:
		return false
	}
}

// nativeNeutralReceiver recognizes standard-library receiver contracts without
// treating same-named application types as portable. Read-only collection views
// constrain mutation, not the environments in which their methods can execute.
func nativeNeutralReceiver(value *checker.Type) bool {
	symbol := value.Symbol()
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	if portableNativeContainerName(symbol.Name) {
		if symbol.Parent != nil {
			return false
		}
	} else {
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
// methods never inherit built-in authority. Primitive aliases and boxed views
// retain the same standard method owner without depending on receiver display text.
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
		case "String", "Number", "Boolean", "BigInt", "Symbol":
		default:
			if !portableNativeContainerName(owner.Name) {
				return false
			}
		}
	}
	source := ast.GetSourceFileOfNode(declaration)
	if !standardLibrarySource(source) {
		return false
	}
	name := filepath.Base(source.FileName())
	return strings.HasPrefix(name, "lib.es") && strings.HasSuffix(name, ".d.ts")
}

// checkedPrimitiveMemberRead accounts for the standard Get itself. The
// receiver and key expressions still evaluate at their original source sites.
// Boxed primitives and authored members can have their own getters.
func checkedPrimitiveMemberRead(node *ast.Node, c *checker.Checker) bool {
	if !ast.IsPropertyAccessExpression(node) && !ast.IsElementAccessExpression(node) {
		return false
	}
	read, write := accessorEvaluationMode(node)
	if !read || write {
		return false
	}
	receiver, name := restrictedInvocationMember(node, c)
	return name != "" && checkedPrimitiveOperand(receiver, c) && nativeReceiverMemberDeclarations(node, c)
}

// directInvocationLeaf recognizes operations whose execution is covered by
// the standard declaration and ordinary child walk. It grants no result or
// invocation authority. Calls that can enter authored work through inputs
// keep the invocation-relative query.
func directInvocationLeaf(call *ast.CallExpression, c *checker.Checker) bool {
	if checkedPrimitiveMemberInvocation(call, c) {
		return true
	}
	if standardNumberPredicate(call.Expression, c) {
		if call.Arguments == nil {
			return true
		}
		for _, argument := range call.Arguments.Nodes {
			if ast.IsSpreadElement(argument) {
				return false
			}
		}
		return true
	}
	receiver, name := restrictedInvocationMember(unwrapSourceCallableReference(call.Expression), c)
	if (name != "every" && name != "some") || receiver == nil || call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return false
	}
	receiver = unwrapSourceCallableReference(receiver)
	// A fresh dense literal owns all of its indexed Gets. The original walk
	// visits its element expressions and the graph still records the Call.
	return ast.IsArrayLiteralExpression(receiver) &&
		denseArrayElements(receiver.AsArrayLiteralExpression().Elements.Nodes) &&
		nativeReceiverMemberDeclarations(call.Expression, c) &&
		standardNumberPredicate(call.Arguments.Nodes[0], c)
}

// standardNumberPredicate follows the selected standard declaration. These
// predicates neither coerce their input nor invoke work through it.
func standardNumberPredicate(expression *ast.Node, c *checker.Checker) bool {
	receiver, name := restrictedInvocationMember(unwrapSourceCallableReference(expression), c)
	switch name {
	case "isFinite", "isInteger", "isNaN", "isSafeInteger":
	default:
		return false
	}
	return receiver != nil && ast.IsIdentifier(receiver) && receiver.Text() == "Number" && standardLibraryCallRoot(expression, c)
}

// checkedPrimitiveMemberInvocation accounts for standard calls with no authored
// coercion, callback or protocol method supplied by an argument. Consumers of
// the returned value still select it through their original operation.
func checkedPrimitiveMemberInvocation(call *ast.CallExpression, c *checker.Checker) bool {
	if !checkedPrimitiveMemberRead(unwrapSourceCallableReference(call.Expression), c) {
		return false
	}
	if call.Arguments != nil {
		for _, argument := range call.Arguments.Nodes {
			if ast.IsSpreadElement(argument) || !checkedPrimitiveOperand(argument, c) {
				return false
			}
		}
	}
	return true
}

// checkedPrimitiveOperand admits only primitive values. A union is primitive
// when each alternative is primitive, including nullish argument values.
func checkedPrimitiveOperand(node *ast.Node, c *checker.Checker) bool {
	if node == nil {
		return false
	}
	return checkedPrimitiveType(c.GetTypeAtLocation(node))
}

func checkedPrimitiveType(value *checker.Type) bool {
	if value == nil {
		return false
	}
	if value.Flags()&checker.TypeFlagsPrimitive != 0 {
		return true
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		for _, alternative := range value.Types() {
			if !checkedPrimitiveType(alternative) {
				return false
			}
		}
		return true
	}
	return false
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
	reference := unwrapSourceCallableReference(expression)
	receiver, name := restrictedInvocationMember(reference, typeChecker)
	if receiver != nil && ast.IsPropertyAccessExpression(reference) && ast.IsArrayLiteralExpression(receiver) {
		// The original named access already resolves against this fresh array.
		// Reuse that symbol instead of instantiating its receiver type again.
		if symbol := typeChecker.GetSymbolAtLocation(reference); symbol != nil {
			return symbol
		}
	}
	if receiver != nil && name != "" {
		// Optional evaluation skips nullish values, but the selected member still needs
		// its declaration proof. A remaining authored union member cannot gain native authority.
		value := typeChecker.GetNonNullableType(typeChecker.GetTypeAtLocation(receiver))
		return typeChecker.GetPropertyOfType(value, name)
	}
	return typeChecker.GetSymbolAtLocation(expression)
}

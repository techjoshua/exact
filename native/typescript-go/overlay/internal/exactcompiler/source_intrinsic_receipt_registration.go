package exactcompiler

import (
	"crypto/sha256"
	"fmt"
	"path"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// intrinsicReceiptRegistration excludes only direct writer discovery for the
// selected Core issuer's storage operation. Normal operand and call evaluation
// retain their existing owners.
func (q *sourceValueQuery) intrinsicReceiptRegistration(call *ast.Node, bindings sourceValueBindings) bool {
	if call == nil || !ast.IsCallExpression(call) || call.Parent == nil || !ast.IsExpressionStatement(call.Parent) ||
		!ast.IsPropertyAccessExpression(call.Expression()) || call.Expression().Name().Text() != "set" || ast.IsOptionalChain(call) {
		return false
	}
	receiver := call.Expression().Expression()
	if !ast.IsIdentifier(receiver) || receiver.Text() != "intrinsics" || !q.installedMemberSourceOwned(call) {
		return false
	}
	declaration := enclosingCallableNode(call)
	if declaration == nil || !ast.IsFunctionDeclaration(declaration) || declaration.Name() == nil || declaration.Name().Text() != "issueIntrinsicReceipt" {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return false
	}
	if _, substituted := bindings[ast.GetSymbolId(symbol)]; substituted {
		return false
	}
	owner := q.executable
	binding := symbol.ValueDeclaration
	if accepted, assessed := owner.intrinsicReceiptStores[binding]; assessed {
		return accepted
	}
	accepted := owner.selectedIntrinsicReceiptStore(binding, ast.GetSourceFileOfNode(call))
	if owner.intrinsicReceiptStores == nil {
		owner.intrinsicReceiptStores = make(map[*ast.Node]bool)
	}
	owner.intrinsicReceiptStores[binding] = accepted
	return accepted
}

// selectedIntrinsicReceiptStore identifies the two reviewed Core modules in the
// current executable generation. Whole-module identity covers the callable
// category and other bindings to the same slot within those modules. Supported
// Core copies cooperate through the private realm slot.
func (owner *executableBodyOwner) selectedIntrinsicReceiptStore(binding *ast.Node, issuer *ast.SourceFile) bool {
	const issuerRevision = "f02ab213691b30cd964d362cebd1eb37cb33d600f30dfe77ec5cefd1d3e773e9"
	const storeRevision = "fdd6a3c77876329f1db33897ca058201c5496f5e82ff2bd9295a3f74733f19d9"
	const issuerPath = "src/component-abi/intrinsic-receipt.ts"
	filename := strings.ReplaceAll(issuer.FileName(), "\\", "/")
	if !strings.HasSuffix(filename, "/"+issuerPath) || ast.GetSourceFileOfNode(binding) != issuer {
		return false
	}
	program := owner.values.program
	root := program.GetNearestAncestorDirectoryWithPackageJson(path.Dir(filename))
	if root == "" || filename != path.Join(root, issuerPath) ||
		owner.selection != nil && !owner.currentSelectedSource(issuer) {
		return false
	}
	manifest := program.GetPackageJsonInfo(path.Join(root, "package.json")).GetContents()
	if manifest == nil || manifest.Name.Value != "@exactjs/core" || fmt.Sprintf("%x", sha256.Sum256([]byte(issuer.Text()))) != issuerRevision {
		return false
	}
	initializer := binding.Initializer().Expression()
	body, selected := owner.body(initializer)
	if owner.selection == nil {
		if symbol := resolvedCallableSymbol(owner.checker.GetSymbolAtLocation(initializer), owner.checker); symbol != nil {
			body = symbol.ValueDeclaration
			selected = len(symbol.Declarations) == 1
		}
	}
	if !selected || body == nil || !ast.IsFunctionDeclaration(body) || body.Name() == nil ||
		body.Name().Text() != "sharedOpaqueOperationStore" {
		return false
	}
	source := ast.GetSourceFileOfNode(body)
	return program.GetSourceFile(source.FileName()) == source &&
		strings.ReplaceAll(source.FileName(), "\\", "/") == path.Join(root, "src/component-abi/opaque-operation.ts") &&
		fmt.Sprintf("%x", sha256.Sum256([]byte(source.Text()))) == storeRevision
}

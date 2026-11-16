package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedInvokedDescriptorBodySource names an existing conditional Get producer, not an
// invocation or an effect inferred from a stored body's presence. The actual
// field Get must still select, bind and transfer this getter before closure.
// Only the input-independent opaque lexical Call domain is admitted here.
func stagedInvokedDescriptorBodySource(descriptor, operation, region *ast.Node, owner *executableBodyOwner) (string, bool) {
	if descriptor == nil || !ast.IsObjectLiteralExpression(descriptor) || region == nil || !ast.IsGetAccessorDeclaration(region) || region.Parent != descriptor || region.Name() == nil || ast.IsComputedPropertyName(region.Name()) || enclosingCallableNode(operation) != region || !sourceOpaqueDeclarationCall(operation, owner) || !stagedFieldGetterInputsMapped(region, nil, owner) {
		return "", false
	}
	field := callableNameText(region.Name())
	if stagedDescriptorFieldIndex(field) < 0 {
		return "", false
	}
	for _, getter := range sourceReflectiveGetterRequirements(descriptor, field) {
		if getter == region {
			return field, true
		}
	}
	return "", false
}

// Descriptor DATA reads never invoke stored callable bodies, including bodies
// nested under those stored functions. Accessor bodies retain their original
// actual Get producer. This source relation supplies no field value or output.
func stagedDescriptorBodySource(descriptor, operation, region *ast.Node, owner *executableBodyOwner) (sourceStagedDescriptorBodySource, bool) {
	if field, known := stagedInvokedDescriptorBodySource(descriptor, operation, region, owner); known {
		return sourceStagedDescriptorBodySource{field: field, descriptor: descriptor}, true
	}
	if descriptor == nil || !ast.IsObjectLiteralExpression(descriptor) || operation == nil || region == nil || !nodeInside(operation, region) {
		return sourceStagedDescriptorBodySource{}, false
	}
	for body := region; body != nil; body = enclosingCallableNode(body.Parent) {
		member := body.Parent
		if member != nil && ast.IsPropertyAssignment(member) && member.AsPropertyAssignment().Initializer == body && member.Parent == descriptor && !ast.IsComputedPropertyName(member.Name()) {
			field := callableNameText(member.Name())
			return sourceStagedDescriptorBodySource{field: field, descriptor: descriptor, body: body, member: member, stored: ast.IsFunctionExpression(body) || ast.IsArrowFunction(body)}, stagedDescriptorFieldIndex(field) >= 0
		}
		if ast.IsMethodDeclaration(body) && body.Parent == descriptor && !ast.IsComputedPropertyName(body.Name()) {
			field := callableNameText(body.Name())
			return sourceStagedDescriptorBodySource{field: field, descriptor: descriptor, body: body}, stagedDescriptorFieldIndex(field) >= 0
		}
		if body.Parent == descriptor {
			break
		}
	}
	return sourceStagedDescriptorBodySource{}, false
}

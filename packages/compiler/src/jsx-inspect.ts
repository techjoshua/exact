import ts from "typescript";
import { stableId } from "./ids.js";
import { semanticReferenceForIdentifier } from "./semantic.js";
import type {
  ExactImportedComponentIR,
  ExactPlacement,
  SemanticReferenceIndex
} from "./types.js";

/** Returns whether JSX attributes force an element into a client island. */
export function jsxElementIsClientIsland(attributes: ts.JsxAttributes): boolean {
  return attributes.properties.some(property => {
    if (ts.isJsxSpreadAttribute(property)) return false;
    const name = property.name.getText();
    return /^on[A-Z]/.test(name) || name === "ref";
  });
}

/** Returns whether a JSX tag references a component classified as client-only. */
export function jsxTagIsClientComponent(
  tagName: ts.JsxTagNameExpression,
  placements: Map<string, ExactPlacement>,
  sourceFile?: ts.SourceFile,
  semanticReferences?: SemanticReferenceIndex
): boolean {
  if (ts.isIdentifier(tagName) && /^[a-z]/.test(tagName.text)) return false;
  if (sourceFile && semanticReferences && !jsxTagCanReferenceComponent(tagName, semanticReferences, sourceFile)) return false;
  return placements.get(tagName.getText()) === "client";
}

/** Returns whether a JSX tag can semantically refer to a component value. */
export function jsxTagCanReferenceComponent(
  tagName: ts.JsxTagNameExpression,
  semanticReferences: SemanticReferenceIndex,
  sourceFile: ts.SourceFile
): boolean {
  if (!ts.isIdentifier(tagName)) return true;
  const reference = semanticReferenceForIdentifier(tagName, semanticReferences, sourceFile);
  return reference?.declarationKind === "import" || reference?.declarationKind === "function";
}

/** Returns the boundary name used for a JSX component tag. */
export function componentBoundaryName(
  tagName: ts.JsxTagNameExpression,
  componentInfo: Map<string, ExactImportedComponentIR>,
  sourceFile: ts.SourceFile
): string {
  const tagKey = tagName.getText(sourceFile);
  return componentInfo.get(tagKey)?.boundaryName ?? tagKey;
}

/** Creates an exact element id for intrinsic JSX elements. */
export function exactElementId(sourceFile: ts.SourceFile, tagName: ts.JsxTagNameExpression, node: ts.Node): string | undefined {
  if (!jsxTagIsIntrinsicElement(tagName)) return undefined;
  return stableId(sourceFile.fileName, "element", String(node.getStart(sourceFile)), String(node.getEnd()));
}

/** Returns whether a JSX tag is an intrinsic DOM-like element. */
export function jsxTagIsIntrinsicElement(tagName: ts.JsxTagNameExpression): boolean {
  if (ts.isIdentifier(tagName)) return /^[a-z]/.test(tagName.text);
  return ts.isJsxNamespacedName(tagName);
}

/** Returns whether a JSX element has only empty text children. */
export function jsxElementHasNoMeaningfulChildren(node: ts.JsxElement): boolean {
  return node.children.every(child => ts.isJsxText(child) && !child.text.trim());
}

/** Converts simple client-component JSX children into a serializable children prop expression. */
export function clientComponentChildrenProp(context: ts.TransformationContext, node: ts.JsxElement): ts.Expression | undefined {
  const values: ts.Expression[] = [];
  let text = "";
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      text += child.text;
      continue;
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized) values.push(context.factory.createStringLiteral(normalized));
    text = "";

    if (ts.isJsxExpression(child)) {
      if (!child.expression) continue;
      if (containsJsx(child.expression)) return undefined;
      values.push(child.expression);
      continue;
    }
    return undefined;
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized) values.push(context.factory.createStringLiteral(normalized));
  if (!values.length) return undefined;
  if (values.length === 1) return values[0];
  return context.factory.createArrayLiteralExpression(values, false);
}

/** Returns whether client component children require a server slot boundary. */
export function clientComponentHasServerSlotChildren(node: ts.JsxElement): boolean {
  for (const child of node.children) {
    if (ts.isJsxText(child)) continue;
    if (ts.isJsxExpression(child)) {
      if (child.expression && containsJsx(child.expression)) return true;
      continue;
    }
    return true;
  }
  return false;
}

/** Returns whether a node subtree contains JSX syntax. */
export function containsJsx(node: ts.Node): boolean {
  let found = false;
  function visit(current: ts.Node): void {
    if (found) return;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

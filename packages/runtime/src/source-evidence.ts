import ts from "typescript";
import type { PropertyEvidence } from "./control-derivation";
type ComponentFunction =
  | ts.FunctionDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression;
function selectedFunction(
  file: ts.SourceFile,
  exportName: string,
): ComponentFunction | undefined {
  const declarations = new Map<string, ComponentFunction>();
  const exports = new Map<string, string>();
  for (const statement of file.statements) {
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    const exported = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    const defaultExport = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
    );
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
      if (exported)
        exports.set(
          defaultExport ? "default" : statement.name.text,
          statement.name.text,
        );
    }
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          declarations.set(declaration.name.text, declaration.initializer);
          if (exported)
            exports.set(declaration.name.text, declaration.name.text);
        }
      }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const element of statement.exportClause.elements)
        exports.set(
          element.name.text,
          element.propertyName?.text ?? element.name.text,
        );
  }
  const local = exports.get(exportName);
  return local ? declarations.get(local) : undefined;
}
function renderExpression(
  component: ComponentFunction,
): ts.Expression | undefined {
  let expression: ts.Expression | undefined;
  if (!component.body) return undefined;
  if (ts.isBlock(component.body)) {
    if (
      component.body.statements.length !== 1 ||
      !ts.isReturnStatement(component.body.statements[0])
    )
      return undefined;
    expression = component.body.statements[0].expression;
  } else expression = component.body;
  while (expression && ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  return expression;
}
/** State defaults support only bare boolean literals; expressions are never evaluated. */
function literalBoolean(expression: ts.Expression): boolean | undefined {
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}
/** Static parsing only: repository modules, scripts and hooks are never evaluated. */
export function extractPublicProperties(
  source: string,
  exportName: string,
): PropertyEvidence[] {
  const file = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, ts.TypeNode | ts.InterfaceDeclaration>();
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement))
      declarations.set(statement.name.text, statement.type);
    if (ts.isInterfaceDeclaration(statement))
      declarations.set(statement.name.text, statement);
  }
  const component = selectedFunction(file, exportName);
  const parameter = component?.parameters[0];
  const type = parameter?.type;
  const defaults = new Map<string, string | number | boolean>();
  const unsupportedStateDefaults = new Set<string>();
  if (parameter && ts.isObjectBindingPattern(parameter.name)) {
    for (const element of parameter.name.elements) {
      const stateName = (element.propertyName ?? element.name)
        .getText(file)
        .replace(/^['"]|['"]$/g, "");
      if (
        (stateName === "checked" || stateName === "disabled") &&
        (element.propertyName ||
          element.dotDotDotToken ||
          (element.initializer &&
            literalBoolean(element.initializer) === undefined))
      )
        unsupportedStateDefaults.add(stateName);
      if (!ts.isIdentifier(element.name) || !element.initializer) continue;
      const value = element.initializer;
      if (ts.isStringLiteral(value))
        defaults.set(element.name.text, value.text);
      else if (ts.isNumericLiteral(value))
        defaults.set(element.name.text, Number(value.text));
      else if (
        value.kind === ts.SyntaxKind.TrueKeyword ||
        value.kind === ts.SyntaxKind.FalseKeyword
      )
        defaults.set(
          element.name.text,
          value.kind === ts.SyntaxKind.TrueKeyword,
        );
    }
  }
  if (!type)
    return [{ name: "public contract", kind: "complex", ambiguous: true }];
  const members: ts.TypeElement[] = [];
  let unresolved = false;
  const seen = new Set<ts.Node>();
  const resolve = (node: ts.TypeNode | ts.InterfaceDeclaration) => {
    if (seen.has(node)) {
      unresolved = true;
      return;
    }
    seen.add(node);
    if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)) {
      members.push(...node.members);
      if (ts.isInterfaceDeclaration(node) && node.heritageClauses?.length)
        unresolved = true;
    } else if (ts.isTypeReferenceNode(node)) {
      const target = declarations.get(node.typeName.getText(file));
      if (target) resolve(target);
      else unresolved = true;
    } else if (ts.isIntersectionTypeNode(node)) node.types.forEach(resolve);
    else unresolved = true;
  };
  resolve(type);
  const properties: PropertyEvidence[] = [];
  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.type || !member.name)
      continue;
    const name = member.name.getText(file).replace(/^['"]|['"]$/g, "");
    const type = member.type;
    if (ts.isFunctionTypeNode(type) || /^on[A-Z]/.test(name)) continue;
    if (type.kind === ts.SyntaxKind.BooleanKeyword)
      properties.push({ name, kind: "boolean" });
    else if (type.kind === ts.SyntaxKind.StringKeyword)
      properties.push({ name, kind: "text" });
    else if (type.kind === ts.SyntaxKind.NumberKeyword)
      properties.push({ name, kind: "number" });
    else if (
      ts.isUnionTypeNode(type) &&
      type.types.every(
        (t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal),
      )
    )
      properties.push({
        name,
        kind: "enum",
        options: type.types
          .map((t) => (t as ts.LiteralTypeNode).literal as ts.StringLiteral)
          .map((t) => t.text),
      });
    else properties.push({ name, kind: "complex", ambiguous: true });
  }
  for (const property of properties) {
    const member = members.find(
      (member) =>
        member.name?.getText(file).replace(/^['"]|['"]$/g, "") ===
        property.name,
    );
    if (!member) continue;
    const tags = ts.getJSDocTags(member);
    const has = (tag: string) => tags.some((t) => t.tagName.text === tag);
    property.advanced = has("advanced");
    property.structural = has("structural");
    property.internal = has("internal");
    property.derived = has("derived");
    property.invariant = has("invariant");
    property.defaultValue = defaults.get(property.name);
    if (
      (property.name === "checked" || property.name === "disabled") &&
      (unsupportedStateDefaults.has(property.name) || parameter?.initializer)
    )
      property.ambiguous = true;
    const declaredControl = tags.find(
      (t) => t.tagName.text === "control",
    )?.comment;
    if (
      typeof declaredControl === "string" &&
      ["icon", "slot", "variant", "state", "breakpoint"].includes(
        declaredControl.trim(),
      )
    )
      property.kind = declaredControl.trim() as PropertyEvidence["kind"];
    else if (
      property.kind === "enum" &&
      ["variant", "state", "icon"].includes(property.name)
    )
      property.kind = property.name as PropertyEvidence["kind"];
  }
  if (unresolved)
    properties.push({
      name: "public contract",
      kind: "complex",
      ambiguous: true,
    });
  return properties;
}

export type TokenValue = string | number | boolean | null;
type TokenTree = TokenValue | { [key: string]: TokenTree };
const prototypePathKeys = new Set(['__proto__', 'prototype', 'constructor']);
const executionMembers = new Set(['Function', 'eval', 'require', 'createRequire', 'getPrototypeOf', 'setPrototypeOf', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'defineProperty', 'defineProperties', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', 'runInContext', 'runInNewContext', 'runInThisContext', 'compileFunction', '_compile', 'Script', 'SourceTextModule', 'SyntheticModule', 'importScripts', 'execScript', 'defaultView', 'contentWindow', 'innerHTML', 'outerHTML', 'srcdoc']);
const executionGlobals = new Set(['Function', 'eval', 'require', 'importScripts', 'execScript', 'setTimeout', 'setInterval']);
const realmGlobals = new Set(['globalThis', 'global', 'window', 'self', 'frames', 'top', 'parent', 'Reflect', 'module']);
function literalMemberKey(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) ? node.text : undefined;
}
function declaredMemberKey(node: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return literalMemberKey(node.expression);
  return literalMemberKey(node);
}
function unsafeObjectKeys(node: ts.Node): boolean {
  if (ts.isObjectLiteralExpression(node) && node.properties.some((property) => {
    const name = ts.isSpreadAssignment(property) ? undefined : property.name;
    const key = declaredMemberKey(name);
    return (key !== undefined && prototypePathKeys.has(key)) || Boolean(name && ts.isComputedPropertyName(name) && key === undefined);
  })) return true;
  return ts.forEachChild(node, (child) => unsafeObjectKeys(child) || undefined) ?? false;
}
function erasedTypeNode(node: ts.Node): boolean {
  if (ts.isExpressionWithTypeArguments(node)) {
    const heritage = node.parent;
    // Class extends and standalone generic instantiations execute. Only
    // interface/implements heritage is erased at this node; type arguments
    // remain ordinary erased TypeNodes below a runtime expression.
    return ts.isHeritageClause(heritage) && (heritage.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(heritage.parent));
  }
  return ts.isTypeNode(node);
}
function erasedReference(node: ts.Node): boolean {
  for (let parent: ts.Node | undefined = node; parent; parent = parent.parent) {
    if (erasedTypeNode(parent) || (ts.isImportSpecifier(parent) && parent.isTypeOnly) || (ts.isImportClause(parent) && parent.isTypeOnly) || (ts.isImportDeclaration(parent) && parent.importClause?.isTypeOnly) || (ts.isImportEqualsDeclaration(parent) && parent.isTypeOnly)) return true;
    if (ts.isStatement(parent)) break;
  }
  return false;
}
function literalPrimitive(node: ts.Expression): boolean {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return literalPrimitive(node.expression);
  return ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind) || (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator));
}
/** Bind an isolated in-memory module graph; no compiler host filesystem access. */
function tokenBindingGraph(sources: Record<string, string>) {
  const normalize = (path: string) => path.replace(/^\//, "");
  const files = new Map(Object.entries(sources).filter(([path]) => /\.[cm]?[jt]sx?$/.test(path)).map(([path, text]) => [normalize(path), ts.createSourceFile('/' + normalize(path), text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : path.endsWith('.jsx') ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS)]));
  const dependency = (path: string, specifier: string) => {
    if (!specifier.startsWith('.')) return undefined;
    const base = new URL(specifier, `https://source/${normalize(path)}`).pathname.slice(1), stem = base.replace(/\.[cm]?jsx?$/, '');
    return [base, ...['.ts','.tsx','.js','.jsx','.mts','.cts','/index.ts','/index.tsx','/index.js'].map((suffix) => base + suffix), ...(stem !== base ? [stem+'.ts',stem+'.tsx',stem+'.mts',stem+'.cts'] : [])].find((candidate) => files.has(candidate));
  };
  const host: ts.CompilerHost = {
    getSourceFile: (path) => files.get(normalize(path)), getDefaultLibFileName: () => '/lib.d.ts', writeFile: () => {},
    getCurrentDirectory: () => '/', getDirectories: () => [], fileExists: (path) => files.has(normalize(path)), readFile: (path) => files.get(normalize(path))?.text,
    getCanonicalFileName: (path) => path, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    resolveModuleNames: (names, containing) => names.map((name) => {
      const path = dependency(containing, name); if (!path) return undefined;
      const extension = path.endsWith('.tsx') ? ts.Extension.Tsx : path.endsWith('.jsx') ? ts.Extension.Jsx : path.endsWith('.mts') ? ts.Extension.Mts : path.endsWith('.cts') ? ts.Extension.Cts : /\.[cm]?js$/.test(path) ? ts.Extension.Js : ts.Extension.Ts;
      return { resolvedFileName: '/' + path, extension };
    }),
  };
  const program = ts.createProgram([...files.keys()].map((path) => '/' + path), { noLib: true, allowJs: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext }, host);
  const checker = program.getTypeChecker();
  const canonical = (input: ts.Symbol | undefined): ts.Symbol | undefined => {
    let current = input; const seen = new Set<ts.Symbol>();
    while (current && (current.flags & ts.SymbolFlags.Alias)) {
      if (seen.has(current)) return undefined; seen.add(current);
      current = checker.getAliasedSymbol(current);
    }
    return current;
  };
  const symbol = (node: ts.Node) => canonical(checker.getSymbolAtLocation(node));
  const namespaceTree = (binding: ts.Symbol, roots: ReadonlyMap<ts.Symbol, TokenTree>, seen = new Set<ts.Symbol>()): TokenTree | undefined => {
    if (!(binding.flags & ts.SymbolFlags.Module) || seen.has(binding)) return undefined;
    const next = new Set(seen).add(binding), tree: { [key: string]: TokenTree } = Object.create(null);
    for (const exported of checker.getExportsOfModule(binding)) {
      const target = canonical(exported); if (!target) continue;
      const value = roots.has(target) ? roots.get(target) : namespaceTree(target, roots, next);
      if (value !== undefined) tree[exported.name] = value;
    }
    return Object.keys(tree).length ? tree : undefined;
  };
  return { files, symbol, namespaceTree, localSymbol: (node: ts.Node) => checker.getSymbolAtLocation(node) };
}

/** Literal evidence is valid only for its lexical binding and an immutable graph. */
export function extractTokenValues(sources: Record<string, string>, sourcePath: string): Record<string, TokenValue> {
  const graph = tokenBindingGraph(sources), file = graph.files.get(sourcePath.replace(/^\//, ''));
  const values: Record<string, TokenValue> = Object.create(null); if (!file) return values;
  const styleAssignment = (node: ts.Node) => {
    const property = node.parent, object = property?.parent, jsx = object?.parent, attribute = jsx?.parent;
    return property && ts.isPropertyAssignment(property) && property.initializer === node && object && ts.isObjectLiteralExpression(object) && jsx && ts.isJsxExpression(jsx) && attribute && ts.isJsxAttribute(attribute) && attribute.name.getText() === 'style';
  };
  const access = (identifier: ts.Identifier) => {
    let root: ts.Expression = identifier;
    if (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier) root = identifier.parent;
    let top = root; const path: string[] = [];
    while (true) {
      if (ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top) { path.push(top.parent.name.text); top = top.parent; }
      else if (ts.isElementAccessExpression(top.parent) && top.parent.expression === top) {
        const key = top.parent.argumentExpression; if (!key || !(ts.isStringLiteral(key) || ts.isNumericLiteral(key))) return undefined;
        path.push(key.text); top = top.parent;
      } else break;
    }
    return { top, path };
  };
  const leaf = (tree: TokenTree, path: readonly string[]) => {
    if (path.some((key) => prototypePathKeys.has(key))) return undefined;
    let current: TokenTree | undefined = tree;
    for (const key of path) { if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined; current = current[key]; }
    return current !== null && typeof current === 'object' ? undefined : current;
  };
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly) continue;
    const clause = statement.importClause, bindings = clause.namedBindings;
    const imports = [clause.name, ...(bindings && ts.isNamedImports(bindings) ? bindings.elements.filter((entry) => !entry.isTypeOnly).map((entry) => entry.name) : [])].filter((name): name is ts.Identifier => Boolean(name));
    for (const imported of imports) {
      if (prototypePathKeys.has(imported.text)) continue;
      let invalidKeys = false;
      const roots = new Map<ts.Symbol, TokenTree>(), allowed = new Set<ts.Node>(), resolving = new Set<ts.Symbol>();
      const evaluateSymbol = (binding: ts.Symbol | undefined): TokenTree | undefined => {
        if (!binding || resolving.has(binding)) return undefined;
        if (roots.has(binding)) return roots.get(binding);
        resolving.add(binding);
        const declarations = binding.declarations ?? [];
        let result: TokenTree | undefined;
        if (declarations.length === 1) {
          const declaration = declarations[0];
          if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const)) result = evaluate(declaration.initializer);
          else if (ts.isExportAssignment(declaration) && !declaration.isExportEquals) result = evaluate(declaration.expression);
        }
        resolving.delete(binding); if (result !== undefined) roots.set(binding, result); return result;
      };
      const evaluate = (node: ts.Expression): TokenTree | undefined => {
        if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return evaluate(node.expression);
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
        if (ts.isNumericLiteral(node)) { const value = Number(node.text); return Number.isFinite(value) ? value : undefined; }
        if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator)) { const value = Number(node.operand.text) * (node.operator === ts.SyntaxKind.MinusToken ? -1 : 1); return Number.isFinite(value) ? value : undefined; }
        if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
        if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
        if (node.kind === ts.SyntaxKind.NullKeyword) return null;
        if (ts.isIdentifier(node)) { const value = evaluateSymbol(graph.symbol(node)); if (value !== undefined) allowed.add(node); return value; }
        if (!ts.isObjectLiteralExpression(node)) return undefined;
        // Inspect the whole literal before parsing supported properties: an
        // unsupported sibling must not hide prototype semantics in a branch.
        if (unsafeObjectKeys(node)) { invalidKeys = true; return undefined; }
        const object: { [key: string]: TokenTree } = Object.create(null);
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name))) return undefined;
          const value = evaluate(property.initializer); if (value === undefined) delete object[property.name.text]; else object[property.name.text] = value;
        }
        return object;
      };
      const binding = graph.symbol(imported), tree = evaluateSymbol(binding); if (!binding || tree === undefined || invalidKeys) continue;
      const safeLocalExecutionName = (binding: ts.Symbol | undefined) => Boolean(binding?.declarations?.length === 1 && binding.declarations.some((declaration) => ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer) || literalPrimitive(declaration.initializer))));
      const primitiveStyleAccess = (node: ts.PropertyAccessExpression | ts.ElementAccessExpression) => {
        const key = ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression;
        const declaration = key && graph.symbol(key)?.valueDeclaration;
        return styleAssignment(node) && declaration && ts.isPropertyAssignment(declaration) && literalPrimitive(declaration.initializer);
      };
      const capability = (node: ts.Node): boolean => {
        if (erasedReference(node)) return false;
        if (ts.isExternalModuleReference(node)) return true;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && ['module', 'node:module', 'vm', 'node:vm'].includes(node.moduleSpecifier.text)) return true;
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          const key = ts.isPropertyAccessExpression(node) ? node.name.text : literalMemberKey(node.argumentExpression);
          // Unknown computed keys can obtain a constructor through an alias.
          if (key === undefined || prototypePathKeys.has(key)) return true;
          if (executionMembers.has(key) && !primitiveStyleAccess(node)) return true;
        }
        if (ts.isBindingElement(node)) {
          const key = declaredMemberKey(node.propertyName ?? node.name);
          if ((node.propertyName && key === undefined) || (key !== undefined && (prototypePathKeys.has(key) || executionMembers.has(key)))) return true;
        }
        if (ts.isComputedPropertyName(node)) {
          const key = literalMemberKey(node.expression);
          if (key === undefined || prototypePathKeys.has(key) || executionMembers.has(key)) return true;
        }
        if (ts.isIdentifier(node)) {
          // Property names are checked above; binding declarations do not acquire a value.
          const parent = node.parent;
          if ((ts.isPropertyAccessExpression(parent) && parent.name === node) || ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isPropertyAssignment(parent)) && parent.name === node)) return false;
          const actual = graph.symbol(node);
          if (executionGlobals.has(node.text) && !safeLocalExecutionName(actual)) return true;
          if (realmGlobals.has(node.text) && (!actual?.declarations?.length || actual.declarations.every((declaration) => ts.isVariableDeclaration(declaration) && !declaration.initializer))) return true;
        }
        return false;
      };
      let immutable = true, shadowed = false;
      const namespaces = new Map<ts.Symbol, TokenTree | undefined>();
      const visit = (node: ts.Node) => {
        // Deny capability acquisition as well as invocation: aliases need not keep
        // the original constructor/evaluator name at their eventual call site.
        if (capability(node)) immutable = false;
        if (ts.isIdentifier(node)) {
          const actual = graph.symbol(node), use = access(node);
          if (node.getSourceFile() === file && node.text === imported.text && use && styleAssignment(use.top) && actual !== binding) shadowed = true;
          if (actual && !roots.has(actual) && !namespaces.has(actual)) namespaces.set(actual, graph.namespaceTree(actual, roots));
          const referencedTree = actual ? roots.has(actual) ? roots.get(actual) : namespaces.get(actual) : undefined;
          if (referencedTree !== undefined) {
            let safe = allowed.has(node) || erasedReference(node) || (ts.isVariableDeclaration(node.parent) && node.parent.name === node);
            for (let parent: ts.Node | undefined = node.parent; parent && !safe; parent = parent.parent) {
              if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) safe = true;
              if (ts.isStatement(parent)) break;
            }
            if (!safe && use && styleAssignment(use.top) && leaf(referencedTree, use.path) !== undefined) safe = true;
            if (!safe) immutable = false;
          }
        }
        ts.forEachChild(node, visit);
      };
      for (const source of graph.files.values()) visit(source);
      if (!immutable || shadowed) continue;
      const leaves = (value: TokenTree, prefix: string) => {
        if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value)) leaves(child, `${prefix}.${key}`);
        else values[prefix] = value;
      };
      leaves(tree, imported.text);
      const exact = (node: ts.Node) => {
        if (ts.isIdentifier(node) && graph.symbol(node) === binding) {
          const use = access(node), value = use ? leaf(tree, use.path) : undefined;
          if (use && value !== undefined) values[use.top.getText(file)] = value;
        }
        ts.forEachChild(node, exact);
      };
      exact(file);
    }
  }
  return values;
}

export function extractVisualBindings(
  sources: Record<string, string>,
  cssDeclarations: (text: string) => {
    declarations: { property: string; value: string }[];
  },
): { property: string; token: string }[] {
  const bindings: { property: string; token: string }[] = [];
  for (const [path, source] of Object.entries(sources)) {
    if (path.endsWith(".css")) {
      for (const declaration of cssDeclarations(source).declarations)
        bindings.push({
          property: declaration.property,
          token: declaration.value,
        });
    } else if (/\.[jt]sx$/.test(path)) {
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          node.name.getText(file) === "style" &&
          node.initializer &&
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          ts.isObjectLiteralExpression(node.initializer.expression)
        ) {
          for (const property of node.initializer.expression.properties)
            if (ts.isPropertyAssignment(property))
              bindings.push({
                property: ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(file),
                token: property.initializer.getText(file),
              });
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  }
  return bindings;
}

/** Reviewed MVP reconstruction: validate the selected export's entire supported render. */
export function deriveCheckboxPreview(
  source: string,
  sourcePath: string,
  assetPaths: readonly string[],
  exportName = sourcePath
    .split("/")
    .at(-1)!
    .replace(/\.[^.]+$/, ""),
  sources: Record<string, string> = {},
) {
  const scope = tokenBindingGraph({ ...sources, [sourcePath]: source });
  const parse = (path: string, text: string) =>
    scope.files.get(path.replace(/^\//, '')) ?? ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  const file = parse(sourcePath, source);
  const component = selectedFunction(file, exportName);
  if (!component) return undefined;
  const parameter = component.parameters[0];
  const stateDefaults = { checked: false, disabled: false };
  if (parameter?.initializer) return undefined;
  if (parameter && ts.isObjectBindingPattern(parameter.name))
    for (const element of parameter.name.elements) {
      const name = (element.propertyName ?? element.name)
        .getText(file)
        .replace(/^['"]|['"]$/g, "");
      if (name !== "checked" && name !== "disabled") continue;
      if (
        element.propertyName ||
        element.dotDotDotToken ||
        !ts.isIdentifier(element.name)
      )
        return undefined;
      if (element.initializer) {
        const value = literalBoolean(element.initializer);
        if (value === undefined) return undefined;
        stateDefaults[name] = value;
      }
    }

  const binds = (expression: ts.Expression, name: string) => {
    if (!parameter) return false;
    if (ts.isIdentifier(parameter.name))
      return (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === parameter.name.text &&
        expression.name.text === name
      );
    if (
      !ts.isObjectBindingPattern(parameter.name) ||
      !ts.isIdentifier(expression)
    )
      return false;
    return parameter.name.elements.some(
      (element) =>
        !element.dotDotDotToken &&
        !element.propertyName &&
        ts.isIdentifier(element.name) &&
        element.name.text === name &&
        expression.text === name,
    );
  };
  const relative = (path: string, ref: string) =>
    new URL(ref, `https://source/${path}`).pathname.slice(1);
  const dependency = (path: string, ref: string) => {
    const base = relative(path, ref);
    return [
      base,
      base + ".tsx",
      base + ".ts",
      base + "/index.tsx",
      base + "/index.ts",
    ].find((candidate) => Object.hasOwn(sources, candidate));
  };
  const namedImport = (context: ts.SourceFile, local: string, reference: ts.Node) => {
    for (const statement of context.statements)
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        const element = statement.importClause.namedBindings.elements.find(
          (element) => element.name.text === local,
        );
        const binding = element && scope.localSymbol(element.name);
        if (element && binding && scope.localSymbol(reference) === binding && scope.symbol(element.name)?.declarations?.length)
          return {
            name: element.propertyName?.text ?? element.name.text,
            specifier: statement.moduleSpecifier.text,
          };
      }
  };
  let namespace: string | undefined;
  let namespaceBinding: ts.Symbol | undefined;
  const assets = new Map<ts.Symbol, string>();
  const tokenBindings = new Set<ts.Symbol>();
  for (const statement of file.statements)
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (statement.importClause?.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      const bindings = statement.importClause?.namedBindings;
      if (
        specifier === "@radix-ui/react-checkbox" &&
        bindings &&
        ts.isNamespaceImport(bindings)
      ) {
        namespace = bindings.name.text;
        namespaceBinding = scope.localSymbol(bindings.name);
      }
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements)
          if (!element.isTypeOnly && (element.propertyName?.text ?? element.name.text) === "tokens") {
            const binding = scope.localSymbol(element.name);
            if (binding) tokenBindings.add(binding);
          }
      const local = statement.importClause?.name?.text;
      if (local && specifier.startsWith(".")) {
        const path = relative(sourcePath, specifier);
        const binding = scope.localSymbol(statement.importClause!.name!);
        if (assetPaths.includes(path) && binding) assets.set(binding, path);
      }
    }
  if (!namespace || !namespaceBinding) return undefined;
  const isRoot = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined) =>
    node && ts.isPropertyAccessExpression(node.tagName) && node.tagName.name.text === "Root" && ts.isIdentifier(node.tagName.expression) && scope.localSymbol(node.tagName.expression) === namespaceBinding;
  const opening = (expression: ts.Expression) =>
    ts.isJsxElement(expression)
      ? expression.openingElement
      : ts.isJsxSelfClosingElement(expression)
        ? expression
        : undefined;
  const children = (expression: ts.Expression) =>
    ts.isJsxElement(expression) ? expression.children : [];
  const attributeValue = (attribute: ts.JsxAttribute) =>
    attribute.initializer && ts.isJsxExpression(attribute.initializer)
      ? attribute.initializer.expression
      : undefined;
  let expression = renderExpression(component);
  if (!expression) return undefined;
  let wrapperClassName: string | undefined;
  const wrapperForwardedStates: ("checked" | "disabled")[] = [];
  let wrapped = false;
  let root = opening(expression);
  if (!root) return undefined;
  if (!isRoot(root)) {
    const imported = namedImport(file, root.tagName.getText(file), root.tagName);
    if (
      !imported ||
      imported.name !== "BaseControl" ||
      !imported.specifier.startsWith(".")
    )
      return undefined;
    // Wrapper capability requires both this call-site binding and the verified props spread below.
    for (const attribute of root.attributes.properties) {
      if (
        !ts.isJsxAttribute(attribute) ||
        attribute.name.getText(file) !== "disabled" ||
        !attributeValue(attribute) ||
        !binds(attributeValue(attribute)!, "disabled")
      )
        return undefined;
      wrapperForwardedStates.push("disabled");
    }
    const content = children(expression).filter(
      (child) =>
        !(ts.isJsxText(child) && !child.text.trim()) &&
        !(ts.isJsxExpression(child) && !child.expression),
    );
    if (
      content.length !== 1 ||
      (!ts.isJsxElement(content[0]) && !ts.isJsxSelfClosingElement(content[0]))
    )
      return undefined;
    const path = dependency(sourcePath, imported.specifier);
    if (!path) return undefined;
    const wrapperFile = parse(path, sources[path]);
    const wrapper = selectedFunction(wrapperFile, "BaseControl");
    const wrapperExpression = wrapper && renderExpression(wrapper);
    if (
      !wrapper ||
      !wrapperExpression ||
      !ts.isJsxSelfClosingElement(wrapperExpression) ||
      wrapperExpression.tagName.getText(wrapperFile) !== "div" ||
      !wrapper.parameters[0] ||
      !ts.isIdentifier(wrapper.parameters[0].name)
    )
      return undefined;
    const wrapperProps = wrapper.parameters[0].name.text;
    let forwarded = false;
    for (const attribute of wrapperExpression.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        if (
          forwarded ||
          !ts.isIdentifier(attribute.expression) ||
          attribute.expression.text !== wrapperProps
        )
          return undefined;
        forwarded = true;
        continue;
      }
      if (
        attribute.name.getText(wrapperFile) !== "className" ||
        wrapperClassName !== undefined
      )
        return undefined;
      if (attribute.initializer && ts.isStringLiteral(attribute.initializer)) {
        wrapperClassName = attribute.initializer.text;
        continue;
      }
      const value = attributeValue(attribute);
      if (
        !value ||
        !ts.isCallExpression(value) ||
        !ts.isIdentifier(value.expression) ||
        value.arguments.length !== 1 ||
        !ts.isStringLiteral(value.arguments[0])
      )
        return undefined;
      const helperImport = namedImport(wrapperFile, value.expression.text, value.expression);
      const helperPath =
        helperImport && dependency(path, helperImport.specifier);
      if (!helperImport || !helperPath) return undefined;
      const helperFile = parse(helperPath, sources[helperPath]);
      const helper = selectedFunction(helperFile, helperImport.name);
      const helperBody = helper && renderExpression(helper);
      if (
        !helper ||
        !helperBody ||
        !helper.parameters[0] ||
        !ts.isIdentifier(helper.parameters[0].name) ||
        !ts.isBinaryExpression(helperBody) ||
        helperBody.operatorToken.kind !== ts.SyntaxKind.PlusToken ||
        !ts.isIdentifier(helperBody.left) ||
        helperBody.left.text !== helper.parameters[0].name.text ||
        !ts.isIdentifier(helperBody.right)
      )
        return undefined;
      const suffixImport = namedImport(helperFile, helperBody.right.text, helperBody.right);
      const suffixPath =
        suffixImport && dependency(helperPath, suffixImport.specifier);
      if (!suffixImport || !suffixPath) return undefined;
      const suffixFile = parse(suffixPath, sources[suffixPath]);
      const emptySuffix = suffixFile.statements.some(
        (statement) =>
          ts.isVariableStatement(statement) &&
          (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
          statement.declarationList.declarations.some(
            (declaration) =>
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === suffixImport.name &&
              declaration.initializer &&
              ts.isStringLiteral(declaration.initializer) &&
              declaration.initializer.text === "",
          ),
      );
      if (!emptySuffix) return undefined;
      wrapperClassName = value.arguments[0].text;
    }
    if (!forwarded) return undefined;
    wrapped = true;
    expression = content[0];
    root = opening(expression);
    if (!root || !isRoot(root)) return undefined;
  }
  let className: string | undefined;
  const inlineBindings: { property: string; token: string }[] = [];
  const forwardedStates: ("checked" | "disabled")[] = [];
  for (const attribute of root.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) return undefined;
    const name = attribute.name.getText(file);
    const value = attributeValue(attribute);
    if (name === "checked" || name === "disabled") {
      if (!value || !binds(value, name)) return undefined;
      forwardedStates.push(name);
      continue;
    }
    if (name === "className") {
      if (!attribute.initializer || !ts.isStringLiteral(attribute.initializer))
        return undefined;
      className = attribute.initializer.text;
      continue;
    }
    if (name === "style") {
      if (
        !value ||
        !ts.isObjectLiteralExpression(value) ||
        value.properties.some((property) => {
          if (
            !ts.isPropertyAssignment(property) ||
            (!ts.isIdentifier(property.name) &&
              !ts.isStringLiteral(property.name)) ||
            !ts.isPropertyAccessExpression(property.initializer)
          )
            return true;
          let base: ts.Expression = property.initializer;
          while (ts.isPropertyAccessExpression(base)) base = base.expression;
          const binding = ts.isIdentifier(base) ? scope.localSymbol(base) : undefined;
          return !binding || !tokenBindings.has(binding);
        })
      )
        return undefined;
      for (const property of value.properties)
        if (ts.isPropertyAssignment(property))
          inlineBindings.push({
            property: ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(file),
            token: property.initializer.getText(file),
          });
      continue;
    }
    return undefined;
  }

  const declaredStates = extractPublicProperties(source, exportName).filter(
    (property) => property.name === "checked" || property.name === "disabled",
  );
  if (
    !forwardedStates.includes("checked") ||
    declaredStates.some(
      (property) =>
        property.kind !== "boolean" ||
        property.ambiguous ||
        property.invariant ||
        property.derived ||
        property.internal ||
        !forwardedStates.some((state) => state === property.name),
    )
  )
    return undefined;
  let imagePath: string | undefined;
  let imageWidth: number | undefined;
  let imageHeight: number | undefined;
  let imageAlt = "";
  let text = "";
  for (const child of children(expression)) {
    if (ts.isJsxText(child)) {
      text += child.text.replace(/\s+/g, " ");
      continue;
    }
    if (ts.isJsxExpression(child) && !child.expression) continue;
    if (
      !ts.isJsxSelfClosingElement(child) ||
      child.tagName.getText(file) !== "img" ||
      imagePath ||
      text.trim()
    )
      return undefined;
    for (const attribute of child.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) return undefined;
      const name = attribute.name.getText(file);
      if (name === "src") {
        const value = attributeValue(attribute);
        if (!value || !ts.isIdentifier(value) || !assets.has(scope.localSymbol(value)!))
          return undefined;
        imagePath = assets.get(scope.localSymbol(value)!);
        continue;
      }
      if (name === "alt") {
        if (
          !attribute.initializer ||
          !ts.isStringLiteral(attribute.initializer)
        )
          return undefined;
        imageAlt = attribute.initializer.text;
        continue;
      }
      if (name === "width" || name === "height") {
        const value = attribute.initializer;
        const literal =
          value && ts.isStringLiteral(value)
            ? value
            : attributeValue(attribute);
        if (
          !literal ||
          (!ts.isStringLiteral(literal) && !ts.isNumericLiteral(literal))
        )
          return undefined;
        const dimension = Number(literal.text);
        if (!Number.isFinite(dimension) || dimension <= 0) return undefined;
        if (name === "width") imageWidth = dimension;
        else imageHeight = dimension;
        continue;
      }
      return undefined;
    }
    if (!imagePath || !imagePath.endsWith(".svg")) return undefined;
  }
  return {
    kind: "checkbox" as const,
    forwardedStates,
    wrapperForwardedStates,
    stateDefaults,
    inlineBindings,
    className,
    imagePath,
    imageWidth,
    imageHeight,
    imageAlt,
    text: text.trim(),
    wrapped,
    wrapperClassName,
  };
}

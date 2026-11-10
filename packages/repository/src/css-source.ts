interface CssDeclaration { property: string; value: string }
interface CssSource { declarations: CssDeclaration[]; imports: string[]; urls: string[] }

/** Keep offsets unchanged so declaration values can retain the exact source text. */
function maskComments(text: string): string {
  let output = '';
  let start = 0;
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) throw new Error('Unsupported unterminated CSS comment');
      output += text.slice(start, index) + ' '.repeat(end + 2 - index);
      start = end + 2;
      index = end + 1;
    }
  }
  return output + text.slice(start);
}

function functionArguments(text: string, name: string): string[] {
  const css = maskComments(text);
  const argumentsFound: string[] = [];
  let quote = '';
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (!/[A-Za-z_-]/.test(char)) continue;
    let end = index + 1;
    while (end < css.length && /[\w-]/.test(css[end])) end++;
    const identifier = css.slice(index, end);
    index = end - 1;
    if (identifier.toLowerCase() !== name || css[end] !== '(') continue;
    const start = end + 1;
    let depth = 1;
    let innerQuote = '';
    for (end = start; end < css.length; end++) {
      const valueChar = css[end];
      if (innerQuote) {
        if (valueChar === '\\') end++;
        else if (valueChar === innerQuote) innerQuote = '';
      } else if (valueChar === '"' || valueChar === "'") innerQuote = valueChar;
      else if (valueChar === '(') depth++;
      else if (valueChar === ')' && --depth === 0) break;
    }
    if (depth !== 0) throw new Error(`Unsupported unterminated CSS ${name}() expression`);
    argumentsFound.push(css.slice(start, end).trim());
    index = end;
  }
  return argumentsFound;
}

function dependencyValue(value: string): string {
  const trimmed = value.trim();
  const unquoted = (trimmed[0] === '"' || trimmed[0] === "'") && trimmed.at(-1) === trimmed[0]
    ? trimmed.slice(1, -1) : trimmed;
  if (!unquoted || unquoted.includes('\\')) throw new Error('Unsupported escaped or empty CSS dependency');
  return unquoted;
}

/** Parse boundaries outside strings/comments/functions; never evaluate stylesheets. */
export function parseCssSource(text: string): CssSource {
  const css = maskComments(text);
  const declarations: CssDeclaration[] = [];
  const imports: string[] = [];
  function statement(start: number, end: number): void {
    const segment = css.slice(start, end);
    const importPrefix = /^\s*@import(?=\s|["'])\s*/i.exec(segment);
    if (importPrefix) {
      const target = segment.slice(importPrefix[0].length).trim();
      if (target[0] === '"' || target[0] === "'") {
        const endQuote = target.indexOf(target[0], 1);
        if (endQuote < 0) throw new Error('Unsupported CSS @import expression');
        imports.push(dependencyValue(target.slice(0, endQuote + 1)));
      } else if (/^url\(/i.test(target)) {
        const argument = functionArguments(target, 'url')[0];
        if (argument === undefined) throw new Error('Unsupported CSS @import expression');
        imports.push(dependencyValue(argument));
      } else throw new Error('Unsupported CSS @import expression');
      return;
    }
    const declaration = /^\s*([\w-]+)\s*:/.exec(segment);
    if (declaration) declarations.push({ property: declaration[1], value: text.slice(start + declaration[0].length, end).trim() });
  }
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && (char === ';' || char === '{' || char === '}')) {
      if (char !== '{') statement(start, index);
      start = index + 1;
    }
  }
  if (quote || depth !== 0) throw new Error('Unsupported unterminated CSS source expression');
  statement(start, css.length);
  return { declarations, imports, urls: functionArguments(css, 'url').map(dependencyValue) };
}

export function hasCssTokenReference(value: string): boolean {
  return functionArguments(value, 'var').some((argument) => /^--[\w-]+(?:\s*,|\s*$)/.test(argument));
}

export function cssDependencies(text: string): string[] {
  const css = parseCssSource(text);
  const imports = css.imports.map((imported) => {
    const local = imported.startsWith('.') || imported.startsWith('/');
    if (local && !imported.endsWith('.css')) {
      throw new Error(`Unsupported local CSS import format: ${imported}`);
    }
    return imported;
  });
  function relativeReference(value: string): string {
    return /^(?:\.|\/|#|[A-Za-z][A-Za-z0-9+.-]*:)/.test(value) ? value : `./${value}`;
  }
  const assets = css.urls.filter((url) => !/^(?:data:|https?:|#|\/\/)/i.test(url));
  return [...new Set([...imports, ...assets.map(relativeReference)])];
}

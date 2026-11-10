import { readFileSync } from 'node:fs';
import ts from 'typescript';

export const gameURL = new URL('../../public/game/', import.meta.url);

export function readGameFile(relativePath) {
  return readFileSync(new URL(relativePath, gameURL), 'utf8');
}

export function parseGameScript(relativePath) {
  const source = readGameFile(relativePath);
  const ast = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return {
    ast,
    source,
    declaration(name) {
      for (const node of ast.statements) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(ast);
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (declaration.name.getText(ast) === name) return `const ${declaration.getText(ast)};`;
          }
        }
      }
      throw new Error(`${relativePath}: declaration ${name} was not found`);
    },
  };
}

export function declares(node, name) {
  return ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => declaration.name.getText() === name);
}

export { ts };

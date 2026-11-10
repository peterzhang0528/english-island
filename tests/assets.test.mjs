import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gameURL, parseGameScript, readGameFile, ts } from './helpers/source.mjs';

const chapters = [
  { page: 'index.html', script: 'js/world.js' },
  { page: 'day2.html', script: 'js/world2.js' },
];

test('both chapters have complete local resource and module dependencies', () => {
  const visited = new Set();
  function visit(url) {
    if (visited.has(url.href)) return;
    assert.equal(url.protocol, 'file:', `Game resource must be local: ${url}`);
    assert.ok(url.href.startsWith(gameURL.href), `Game resource must stay inside public/game: ${url}`);
    assert.ok(statSync(url).isFile(), `Missing resource: ${fileURLToPath(url)}`);
    assert.ok(statSync(url).size > 0, `Empty resource: ${fileURLToPath(url)}`);
    visited.add(url.href);

    const references = [];
    if (url.pathname.endsWith('.html')) {
      const html = readFileSync(url, 'utf8');
      for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) references.push(match[1]);
    } else if (url.pathname.endsWith('.js')) {
      const ast = ts.createSourceFile(url.pathname, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      assert.equal(ast.parseDiagnostics.length, 0, `JavaScript syntax: ${url.pathname}`);
      function inspect(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
          references.push(node.moduleSpecifier.text);
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
          references.push(node.arguments[0].text);
        }
        ts.forEachChild(node, inspect);
      }
      inspect(ast);
    } else if (url.pathname.endsWith('.css')) {
      for (const match of readFileSync(url, 'utf8').matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) references.push(match[1]);
    }
    for (const reference of references) {
      if (reference.startsWith('data:') || reference.startsWith('#')) continue;
      assert.ok(reference.startsWith('./') || reference.startsWith('../'), `Unexpected external game dependency: ${reference}`);
      visit(new URL(reference, url));
    }
  }
  for (const chapter of chapters) visit(new URL(chapter.page, gameURL));
});

for (const chapter of chapters) {
  test(`${chapter.page} contains the elements its game script uses`, () => {
    const html = readGameFile(chapter.page);
    const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    const ids = new Set(idList);
    assert.equal(ids.size, idList.length, 'IDs must be unique');
    const { ast } = parseGameScript(chapter.script);
    function inspect(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === '$' && ts.isStringLiteral(node.arguments[0])) {
        const id = node.arguments[0].text.match(/^#([\w-]+)/)?.[1];
        if (id) assert.ok(ids.has(id), `${chapter.page} is missing #${id}`);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
    if (chapter.page === 'day2.html') {
      for (const name of ['egg', 'milk', 'wheat']) assert.ok(ids.has(`ingredient-${name}`));
    }
  });
}

test('the narration manifest resolves to nonempty local audio and covers core vocabulary', () => {
  const audioURL = new URL('audio/', gameURL);
  const manifest = JSON.parse(readGameFile('audio/voice.json'));
  for (const [text, entry] of Object.entries(manifest)) {
    assert.equal(text, text.trim().toLowerCase(), `Manifest key must be normalized: ${text}`);
    assert.equal(typeof entry.f, 'string');
    const audio = new URL(entry.f, audioURL);
    assert.ok(audio.href.startsWith(audioURL.href), `Audio must stay in its local directory: ${entry.f}`);
    const bytes = readFileSync(audio);
    assert.ok(bytes.length > 0, `Empty recording: ${entry.f}`);
    if (entry.f.endsWith('.mp3')) {
      const id3 = bytes.subarray(0, 3).toString() === 'ID3';
      const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      assert.ok(id3 || frameSync, `Recording is not an MP3 file: ${entry.f}`);
    }
  }
  for (const word of ['door', 'tree', 'log', 'plank', 'stick', 'stone', 'axe', 'chop', 'timber', 'zombie', 'hungry', 'chicken', 'egg', 'cow', 'milk', 'wheat', 'cake', 'friend']) {
    assert.ok(manifest[word], `Missing core vocabulary recording: ${word}`);
  }
});

test('authored vocabulary and dialogue have recordings in every chapter', () => {
  const manifest = JSON.parse(readGameFile('audio/voice.json'));
  const scripts = readdirSync(new URL('js/', gameURL)).filter(name => /^world\d*\.js$/.test(name));
  assert.ok(scripts.length > 0, 'There must be a chapter to check');
  const missing = [];

  for (const script of scripts) {
    const { ast } = parseGameScript(`js/${script}`);
    const phrases = new Map();
    function record(node, text) {
      const key = text.trim().toLowerCase();
      if (key) phrases.set(key, ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1);
    }
    function initializer(identifier) {
      // Find the nearest lexical declaration; a function parameter is dynamic input.
      for (let scope = identifier.parent; scope; scope = scope.parent) {
        if (ts.isFunctionLike(scope) && scope.parameters.some(parameter => parameter.name.getText(ast) === identifier.text)) return undefined;
        if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
        for (const statement of scope.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          const declaration = statement.declarationList.declarations.find(item => ts.isIdentifier(item.name) && item.name.text === identifier.text);
          if (declaration) return declaration.initializer;
        }
      }
      return undefined;
    }
    function literalVariants(expression, visited = new Set()) {
      if (!expression || visited.has(expression)) return [];
      visited.add(expression);
      if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
      if (ts.isIdentifier(expression)) return literalVariants(initializer(expression), visited);
      if (ts.isParenthesizedExpression(expression)) return literalVariants(expression.expression, visited);
      if (ts.isConditionalExpression(expression)) return [...literalVariants(expression.whenTrue, visited), ...literalVariants(expression.whenFalse, visited)];
      if (ts.isElementAccessExpression(expression)) {
        const array = ts.isIdentifier(expression.expression) ? initializer(expression.expression) : expression.expression;
        if (array && ts.isArrayLiteralExpression(array)) {
          const index = expression.argumentExpression;
          const options = index && ts.isNumericLiteral(index) ? [array.elements[Number(index.text)]] : array.elements;
          return options.flatMap(option => literalVariants(option, visited));
        }
      }
      if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === 'toLowerCase') {
        return literalVariants(expression.expression.expression, visited);
      }
      return [];
    }
    function inspect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ZH' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) {
          if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) record(property, property.name.text);
        }
      }
      // Both instruction tables and reveal explanations use [English, Chinese] tuples.
      if (ts.isArrayLiteralExpression(node) && node.elements.length >= 2) {
        const [english, chinese] = node.elements;
        if (ts.isStringLiteral(english) && ts.isStringLiteral(chinese) && /[\u3400-\u9fff]/u.test(chinese.text)) record(english, english.text);
      }
      if (ts.isCallExpression(node)) {
        const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
        if (['say', 'speak', 'learn', 'reveal'].includes(name)) {
          // Resolve finite authored choices such as ['One!', 'Two!', 'Three!'][count].
          for (const phrase of literalVariants(node.arguments[0])) record(node, phrase);
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
    assert.ok(phrases.size > 0, `${script}: no authored narration was found`);
    for (const [phrase, line] of phrases) {
      if (!Object.hasOwn(manifest, phrase)) missing.push(`${script}:${line}: ${JSON.stringify(phrase)}`);
    }
  }
  assert.deepEqual(missing, [], 'Authored dialogue must have a recording instead of silently changing voices');
});

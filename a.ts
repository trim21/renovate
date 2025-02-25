import assert from 'assert';
import is from '@sindresorhus/is';
import { parseTOML, AST } from 'toml-eslint-parser';

function isKey(ast: AST.TOMLKeyValue, path: (string | number)[]) {
  if (ast.key.keys.length > path.length) {
    return;
  }

  if (
    ast.key.keys.every((key, index) => {
      return (
        (key.type === 'TOMLBare' && key.name === path[index]) ||
        (key.type === 'TOMLQuoted' && key.value == path[index])
      );
    })
  ) {
    return getSingleValue(ast.value, path.slice(ast.key.keys.length));
  }
}

/**
 * get a AST node presenting a single value (string/int/float)
 * return undefined if the path point to a compose value (object/array)
 */
function getSingleValue(
  ast: AST.TOMLNode | undefined,
  path: (string | number)[],
): AST.TOMLValue | undefined {
  if (typeof ast === 'undefined') {
    return;
  }

  if (path.length === 0) {
    if (ast.type !== 'TOMLValue') {
      return undefined;
    }
    return ast;
  }

  if (ast.type === 'Program') {
    return getSingleValue(ast.body[0], path);
  }

  if (ast.type === 'TOMLTopLevelTable') {
    for (const body of ast.body) {
      if (body.type === 'TOMLTable') {
        // body.resolvedKey may be ['key'], ['key', 'subkey'] for object and [packages, number] for array
        if (body.resolvedKey.length < path.length) {
          if (body.resolvedKey.every((item, index) => item === path[index])) {
            const restKey = path.slice(body.resolvedKey.length);
            for (const item of body.body) {
              const o = isKey(item, restKey);
              if (o) {
                return o;
              }
            }

            return;
          }
        }
      } else if (body.type === 'TOMLKeyValue') {
        const o = isKey(body, path);
        if (o) {
          return o;
        }
      }
    }

    return;
  }

  if (ast.type === 'TOMLTable') {
    for (const item of ast.body) {
      const o = isKey(item, path);
      if (o) {
        return o;
      }
    }

    return;
  }

  if (ast.type === 'TOMLInlineTable') {
    for (const item of ast.body) {
      const o = isKey(item, path);
      if (o) {
        return o;
      }
    }

    return;
  }

  if (ast.type === 'TOMLArray') {
    if (is.number(path[0])) {
      return getSingleValue(ast.elements[path[0]], path.slice(1));
    }
  }
}

const raw = `
version = 'top level version'
ext.version = 'version of ext'

[project]
name = 'hello-world'
rev = 3
optional-deps = [
  'dep 0',
  'dep 1',
]

[dependencies]
urllib2.version = 'version of urllib2'
urllib2.build = '*py38*'

'urllib3.ext' = 'version of urllib3.ext'
urllib3 = { version = 'version of urllib3' }
'requests' = "version of requests"
"vc" = 'version of vc'

[project.ext]
name = '1 ext'

[[packages]]
name = '0'
version = '0'

[[packages]]
name = '1'
version = '1'
`;

const ast = parseTOML(raw);

const project = getSingleValue(ast, ['project']);
assert.strictEqual(project, undefined);

const optionalDeps = getSingleValue(ast, ['project', 'optional-deps']);
assert.strictEqual(optionalDeps, undefined);

const inlineArray = getSingleValue(ast, ['project', 'optional-deps', 1]);
assert.strictEqual(inlineArray?.value, 'dep 1');

const topLevelArray = getSingleValue(ast, ['packages', 1, 'version']);
assert.strictEqual(topLevelArray?.value, '1');

const urllib2Version = getSingleValue(ast, [
  'dependencies',
  'urllib2',
  'version',
]);

assert.strictEqual(urllib2Version?.value, 'version of urllib2');

const topLevelVersion = getSingleValue(ast, ['version']);
assert.strictEqual(topLevelVersion?.value, 'top level version');

const topLevelExtVersion = getSingleValue(ast, ['ext', 'version']);
assert.strictEqual(topLevelExtVersion?.value, 'version of ext');

const vcVersion = getSingleValue(ast, ['dependencies', 'vc']);
assert.strictEqual(vcVersion?.value, 'version of vc');

const extensionNameAst = getSingleValue(ast, ['project', 'ext', 'name']);

assert.strictEqual(extensionNameAst?.value, '1 ext');

const urllib3AST = getSingleValue(ast, ['dependencies', 'urllib3', 'version']);

assert.strictEqual(urllib3AST?.value, 'version of urllib3');

const urllib3ExtVersionAST = getSingleValue(ast, [
  'dependencies',
  'urllib3.ext',
]);

assert.strictEqual(urllib3ExtVersionAST?.value, 'version of urllib3.ext');

const urllib2AST = getSingleValue(ast, ['dependencies', 'urllib2', 'version']);

assert.strictEqual(urllib2AST?.value, 'version of urllib2');

const projectRev = getSingleValue(ast, ['project', 'rev']);

console.log(projectRev);
assert.strictEqual(projectRev?.kind, 'integer');
assert.strictEqual(projectRev?.value, 3);

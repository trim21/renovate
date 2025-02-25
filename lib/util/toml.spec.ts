import { codeBlock } from 'common-tags';
import { getSingleValue, parse as parseToml } from './toml';
import assert from 'assert';
import { parseTOML } from 'toml-eslint-parser';

describe('util/toml', () => {
  it('works', () => {
    const input = codeBlock`
      [tool.poetry]
      ## Hello world
      include = [
        "README.md",
        { path = "tests", format = "sdist" }
      ]
    `;

    expect(parseToml(input)).toStrictEqual({
      tool: {
        poetry: {
          include: ['README.md', { path: 'tests', format: 'sdist' }],
        },
      },
    });
  });

  it('handles invalid toml', () => {
    const input = codeBlock`
      !@#$%^&*()
    `;

    expect(() => parseToml(input)).toThrow(SyntaxError);
  });

  it('handle AST', () => {
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

    const urllib3AST = getSingleValue(ast, [
      'dependencies',
      'urllib3',
      'version',
    ]);

    assert.strictEqual(urllib3AST?.value, 'version of urllib3');

    const urllib3ExtVersionAST = getSingleValue(ast, [
      'dependencies',
      'urllib3.ext',
    ]);

    assert.strictEqual(urllib3ExtVersionAST?.value, 'version of urllib3.ext');

    const urllib2AST = getSingleValue(ast, [
      'dependencies',
      'urllib2',
      'version',
    ]);

    assert.strictEqual(urllib2AST?.value, 'version of urllib2');

    const projectRev = getSingleValue(ast, ['project', 'rev']);

    console.log(projectRev);
    assert.strictEqual(projectRev?.kind, 'integer');
    assert.strictEqual(projectRev?.value, 3);
  });
});

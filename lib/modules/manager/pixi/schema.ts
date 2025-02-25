import is from '@sindresorhus/is';
import { z } from 'zod';
import { isNotNullOrUndefined } from '../../../util/array';
import { LooseRecord, Toml, Yaml } from '../../../util/schema-utils';
import { PypiDatasource } from '../../datasource/pypi';
import { id as gitRefVersionID } from '../../versioning/git';
import { id as pep440VersionID } from '../../versioning/pep440/';
import type { PackageDependency } from '../types';

export interface PixiManagerData {
  /**
   * object path to version string
   */
  path: (string | number)[];
}

export interface PixiPackageDependency extends PackageDependency {
  managerData: PixiManagerData;
}

function prependObjectPath(
  item: PixiPackageDependency,
  path: (string | number)[],
): PixiPackageDependency {
  return {
    ...item,
    managerData: {
      path: [...path, ...item.managerData.path],
    },
  };
}

const pypiDependencies = z
  .record(
    z.string(),
    z.union([
      z.string().transform((version) => {
        return {
          currentValue: version,
          versioning: pep440VersionID,
          datasource: PypiDatasource.id,
          managerData: { path: [] },
        } satisfies PixiPackageDependency;
      }),
      z.object({ version: z.string() }).transform(({ version }) => {
        return {
          currentValue: version,
          versioning: pep440VersionID,
          datasource: PypiDatasource.id,
          managerData: { path: ['version'] },
        } satisfies PixiPackageDependency;
      }),
      z
        .object({ git: z.string(), rev: z.optional(z.string()) })
        .transform(({ git, rev }) => {
          // empty ref default to HEAD, so do we not need to do anything
          if (!rev) {
            return null;
          }

          return {
            currentValue: rev,
            sourceUrl: git,
            gitRef: true,
            versioning: gitRefVersionID,
            managerData: { path: ['ref'] },
          } satisfies PixiPackageDependency;
        }),
      // z.object({ url: z.string() }).transform(() => null),
      z.any().transform(() => null),
    ]),
  )
  .transform((val) => {
    return Object.entries(val)
      .map(([depName, config]) => {
        if (is.nullOrUndefined(config)) {
          return;
        }

        return prependObjectPath(
          {
            ...config,
            depName,
          },
          [depName],
        );
      })
      .filter((dep) => isNotNullOrUndefined(dep));
  });

const Targets = LooseRecord(
  z.string(),
  z.object({
    'pypi-dependencies': z.optional(pypiDependencies).transform((val) => {
      return (
        val?.map((item) => prependObjectPath(item, ['pypi-dependencies'])) ?? []
      );
    }),
  }),
).transform((val) => {
  const pypi: PixiPackageDependency[] = [];
  for (const [key, value] of Object.entries(val)) {
    pypi.push(
      ...value['pypi-dependencies'].map((item) =>
        prependObjectPath(item, [key]),
      ),
    );
  }

  return { pypi };
});

/**
 * config of `pixi.toml` of `tool.pixi` of `pyproject.toml`
 */
export const PixiConfigSchema = z
  .object({
    'pypi-dependencies': z
      .optional(pypiDependencies)
      .default({})
      .transform((val) => {
        return val.map((item) =>
          prependObjectPath(item, ['pypi-dependencies']),
        );
      }),
    target: z
      .optional(Targets)
      .default({})
      .transform(({ pypi }) => {
        return {
          pypi: pypi.map((item) => prependObjectPath(item, ['target'])),
        };
      }),
    feature: LooseRecord(
      z.string(),
      z.object({
        'pypi-dependencies': z
          .optional(pypiDependencies)
          .default({})
          .transform((val) => {
            return val.map((item) =>
              prependObjectPath(item, ['pypi-dependencies']),
            );
          }),
        target: z
          .optional(Targets)
          .default({})
          .transform(({ pypi }) => {
            return {
              pypi: pypi.map((item) => prependObjectPath(item, ['target'])),
            };
          }),
      }),
    )
      .default({})
      .transform((features) => {
        const result: PixiPackageDependency[] = [];

        for (const [
          feature,
          { target, 'pypi-dependencies': pypi },
        ] of Object.entries(features)) {
          result.push(
            ...pypi.map((item) => {
              return {
                ...prependObjectPath(item, ['feature', feature]),
                depType: feature,
              };
            }),
          );

          result.push(
            ...target.pypi.map((item) => {
              return {
                ...prependObjectPath(item, ['feature', feature]),
                depType: feature,
              };
            }),
          );
        }

        return { pypi: result };
      }),
  })
  .transform((val) => {
    const deps = val['pypi-dependencies']
      .concat(val.feature.pypi)
      .concat(val.target.pypi);
    return { pypi: deps };
  });

export const PyprojectSchema = z
  .object({
    tool: z.object({ pixi: z.optional(PixiConfigSchema) }),
  })
  .transform(({ tool: { pixi } }) => {
    if (!pixi) {
      return;
    }

    return {
      pypi: pixi.pypi.map((item) => prependObjectPath(item, ['tool', 'pixi'])),
    };
  });

export const PyprojectToml = Toml.pipe(PyprojectSchema);
export const PixiToml = Toml.pipe(PixiConfigSchema);

export const LockfileYaml = Yaml.pipe(
  z.object({
    version: z.number(),
  }),
);

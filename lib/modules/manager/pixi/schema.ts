import { z } from 'zod';
import { Toml, Yaml } from '../../../util/schema-utils';
import { PackageDependency } from '../types';

import { id as pep440VersionID } from '../../versioning/pep440/';
import { id as gitRefVersionID } from '../../versioning/git';
import { PypiDatasource } from '../../datasource/pypi';

/**
 * config of `pixi.toml` of `tool.pixi` of `pyproject.toml`
 */
export const PixiConfigSchema = z.union([z.object({}), z.null()]).default(null);

const pypiDependencies = z.record(
  z.string(),
  z.union([
    z.string().transform((version) => {
      return {
        currentValue: version,
        versioning: pep440VersionID,
        datasource: PypiDatasource.id,
      } satisfies PackageDependency;
    }),
    z.object({ version: z.string() }).transform(({ version }) => {
      return {
        currentValue: version,
        versioning: pep440VersionID,
        datasource: PypiDatasource.id,
      } satisfies PackageDependency;
    }),
    z
      .object({ git: z.string(), ref: z.optional(z.string()) })
      .transform(({ git, ref }) => {
        // empty ref default to HEAD, so do we not need to do anything
        if (!ref) {
          return null;
        }

        return {
          currentValue: ref,
          sourceUrl: git,
          gitRef: true,
          versioning: gitRefVersionID,
        } satisfies PackageDependency;
      }),
    z.object({ url: z.string() }).transform(() => null),
    z.any().transform(() => null),
  ]),
);

export const PyprojectSchema = z
  .object({
    tool: z.object({ pixi: PixiConfigSchema }),
  })
  .transform(({ tool: { pixi } }) => {
    return pixi;
  });

export const PyprojectToml = Toml.pipe(PyprojectSchema);
export const PixiToml = Toml.pipe(PixiConfigSchema);

export const LockfileYaml = Yaml.pipe(
  z.object({
    version: z.number(),
  }),
);

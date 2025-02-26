import is from '@sindresorhus/is';
import { z } from 'zod';
import { isNotNullOrUndefined } from '../../../util/array';
import { LooseRecord, Toml, Yaml } from '../../../util/schema-utils';
import { CondaDatasource } from '../../datasource/conda/';
import { defaultRegistryUrl as defaultCondaRegistryAPi } from '../../datasource/conda/common';
import { PypiDatasource } from '../../datasource/pypi';
import * as condaVersion from '../../versioning/conda/';
import { id as gitRefVersionID } from '../../versioning/git';
import { id as pep440VersionID } from '../../versioning/pep440/';
import type { PackageDependency } from '../types';

export interface PixiManagerData {
  /**
   * object path to version string
   */
  path: (string | number)[];
}

type Channel = string | { channel: string; priority: number };
type Channels = Channel[];

export interface PixiPackageDependency extends PackageDependency {
  channel?: string;
  channels?: (string | { channel: string; priority: number })[];
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

const condaDependencies = z
  .record(
    z.string(),
    z.union([
      z.string().transform((version) => {
        return {
          currentValue: version,
          versioning: condaVersion.id,
          datasource: CondaDatasource.id,
          depType: 'dependencies',
          managerData: { path: [] },
        } satisfies PixiPackageDependency;
      }),
      z
        .object({ version: z.string(), channel: z.optional(z.string()) })
        .transform(({ version, channel }) => {
          return {
            currentValue: version,
            versioning: condaVersion.id,
            datasource: CondaDatasource.id,
            managerData: { path: ['version'] },
            depType: 'dependencies',
            channel,
          } satisfies PixiPackageDependency;
        }),
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
    dependencies: z
      .optional(condaDependencies)
      .default({})
      .transform((val) => {
        return val.map((item) => prependObjectPath(item, ['dependencies']));
      }),
    'pypi-dependencies': z.optional(pypiDependencies).transform((val) => {
      return (
        val?.map((item) => prependObjectPath(item, ['pypi-dependencies'])) ?? []
      );
    }),
  }),
).transform((val) => {
  const conda: PixiPackageDependency[] = [];
  const pypi: PixiPackageDependency[] = [];
  for (const [key, value] of Object.entries(val)) {
    pypi.push(
      ...value['pypi-dependencies'].map((item) =>
        prependObjectPath(item, [key]),
      ),
    );

    conda.push(
      ...value.dependencies.map((item) => prependObjectPath(item, [key])),
    );
  }

  return { pypi, conda };
});

const projectSchema = z.object({
  channels: z.array(z.string()).default([]),
});

const DependencieSchemaMixin = z
  .object({
    dependencies: z
      .optional(condaDependencies)
      .default({})
      .transform((val) => {
        return val.map((item) => prependObjectPath(item, ['dependencies']));
      }),
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
      .transform(({ pypi, conda }) => {
        return {
          conda: conda.map((item) => prependObjectPath(item, ['target'])),
          pypi: pypi.map((item) => prependObjectPath(item, ['target'])),
        };
      }),
  })
  .transform(
    (
      val,
    ): { pypi: PixiPackageDependency[]; conda: PixiPackageDependency[] } => {
      return {
        conda: [...val.dependencies, ...val.target.conda],
        pypi: [...val['pypi-dependencies'], ...val.target.pypi],
      };
    },
  );

/**
 * config of `pixi.toml` of `tool.pixi` of `pyproject.toml`
 */
export const PixiConfigSchema = z
  .object({
    project: projectSchema,

    feature: LooseRecord(
      z.string(),
      z
        .object({
          channels: z
            .array(
              z.union([
                z.string(),
                z.object({ channel: z.string(), priority: z.number() }),
              ]),
            )
            .optional(),
        })
        .and(DependencieSchemaMixin),
    )
      .default({})
      .transform(
        (
          features,
        ): {
          conda: PixiPackageDependency[];
          pypi: PixiPackageDependency[];
        } => {
          const pypi: PixiPackageDependency[] = [];
          const conda: PixiPackageDependency[] = [];

          for (const [name, feature] of Object.entries(features)) {
            conda.push(
              ...feature.conda.map((item) => {
                return {
                  ...prependObjectPath(item, ['feature', name]),
                  channels: feature.channels,
                };
              }),
            );

            pypi.push(
              ...feature.pypi.map((item) => {
                return {
                  ...prependObjectPath(item, ['feature', name]),
                };
              }),
            );
          }

          return { pypi, conda };
        },
      ),
  })
  .and(DependencieSchemaMixin)
  .transform(
    (
      val,
    ): {
      conda: PixiPackageDependency[];
      pypi: PixiPackageDependency[];
    } => {
      const project = val.project;
      const channels: Channels = structuredClone(project.channels);

      // resolve channels and build registry urls for each channel with order
      const conda: PixiPackageDependency[] = val.conda
        .map((item) => {
          return { ...item, channels } as PixiPackageDependency;
        })
        .concat(
          val.feature.conda.map(
            (item: PixiPackageDependency): PixiPackageDependency => {
              return {
                ...item,
                channels: [...(item.channels ?? []), ...project.channels],
              };
            },
          ),
        )
        .map((item) => {
          const channels = item.channels ? orderChannels(item.channels) : [];
          if (item.channel) {
            // there is no reliable get versions from non-official channel except parse a huge repodata.json
            // We will not do that, so just skip it.
            if (looksLikeUrl(item.channel)) {
              return {
                ...item,
                channels,
                skipStage: 'extract',
                skipReason: 'unsupported-datasource',
              };
            }

            return {
              ...item,
              channels,
              registryUrls: [channelToRegistryUrl(item.channel)],
            };
          }

          if (channels.length === 0) {
            return {
              ...item,
              channels,
              skipStage: 'extract',
              skipReason: 'unknown-registry',
            };
          }

          return {
            ...item,
            channels,

            registryUrls: channels
              .filter((c) => !looksLikeUrl(c))
              .map(channelToRegistryUrl),
            warnings: channels.some((c) => looksLikeUrl(c))
              ? [
                  {
                    topic: 'conda',
                    message:
                      'using third part channel is not support by renovatebot and it will be ignored. This may cause renovatebot try to use package from channel with low priority',
                  },
                ]
              : undefined,
          } satisfies PixiPackageDependency;
        });

      return {
        conda,
        pypi: val.pypi.concat(val.feature.pypi),
      };
    },
  );

function channelToRegistryUrl(channel: string) {
  if (channel.startsWith('http://') || channel.startsWith('https://')) {
    return channel;
  }

  return defaultCondaRegistryAPi + channel + '/';
}

function orderChannels(channels: Channels): string[] {
  return channels
    .map((channel, index) => {
      if (is.string(channel)) {
        return { channel, priority: 0, index };
      }

      return { ...channel, index: 0 };
    })
    .toSorted((a, b) => {
      // frist based on priority then based on index
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      return a.index - b.index;
    })
    .map((c) => c.channel);
}

function looksLikeUrl(s: string): boolean {
  return s.startsWith('https://') || s.startsWith('http://');
}

export const PyprojectSchema = z
  .object({
    tool: z.object({ pixi: PixiConfigSchema.optional() }).optional(),
  })
  .default({})
  .transform(({ tool: { pixi } = {} }) => {
    if (!pixi) {
      return null;
    }

    return {
      conda: pixi.conda.map((item) =>
        prependObjectPath(item, ['tool', 'pixi']),
      ),
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

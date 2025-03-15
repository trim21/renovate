import is from '@sindresorhus/is';
import { z } from 'zod';
import { GlobalConfig } from '../../../config/global';
import { logger } from '../../../logger';
import { coerceArray, isNotNullOrUndefined } from '../../../util/array';
import { detectPlatform } from '../../../util/common';
import { newlineRegex, regEx } from '../../../util/regex';
import { Result } from '../../../util/result';
import { parseSingleYaml } from '../../../util/yaml';
import { GiteaTagsDatasource } from '../../datasource/gitea-tags';
import { GithubReleasesDatasource } from '../../datasource/github-releases';
import { GithubRunnersDatasource } from '../../datasource/github-runners';
import { GithubTagsDatasource } from '../../datasource/github-tags';
import { NpmDatasource } from '../../datasource/npm';
import { PypiDatasource } from '../../datasource/pypi';
import * as dockerVersioning from '../../versioning/docker';
import * as nodeVersioning from '../../versioning/node';
import * as npmVersioning from '../../versioning/npm';
import * as pep440versioning from '../../versioning/pep440';
import { getDep } from '../dockerfile/extract';
import type {
  ExtractConfig,
  PackageDependency,
  PackageFileContent,
} from '../types';
import type { Workflow } from './types';

const dockerActionRe = regEx(/^\s+uses\s*: ['"]?docker:\/\/([^'"]+)\s*$/);
const actionRe = regEx(
  /^\s+-?\s+?uses\s*: (?<replaceString>['"]?(?<depName>(?<registryUrl>https:\/\/[.\w-]+\/)?(?<packageName>[\w-]+\/[.\w-]+))(?<path>\/.*)?@(?<currentValue>[^\s'"]+)['"]?(?:(?<commentWhiteSpaces>\s+)#\s*(((?:renovate\s*:\s*)?(?:pin\s+|tag\s*=\s*)?|(?:ratchet:[\w-]+\/[.\w-]+)?)@?(?<tag>([\w-]*-)?v?\d+(?:\.\d+(?:\.\d+)?)?)|(?:ratchet:exclude)))?)/,
);

// SHA1 or SHA256, see https://github.blog/2020-10-19-git-2-29-released/
const shaRe = regEx(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const shaShortRe = regEx(/^[a-f0-9]{6,7}$/);

// detects if we run against a Github Enterprise Server and adds the URL to the beginning of the registryURLs for looking up Actions
// This reflects the behavior of how GitHub looks up Actions
// First on the Enterprise Server, then on GitHub.com
function detectCustomGitHubRegistryUrlsForActions(): PackageDependency {
  const endpoint = GlobalConfig.get('endpoint');
  const registryUrls = ['https://github.com'];
  if (endpoint && GlobalConfig.get('platform') === 'github') {
    const parsedEndpoint = new URL(endpoint);

    if (
      parsedEndpoint.host !== 'github.com' &&
      parsedEndpoint.host !== 'api.github.com'
    ) {
      registryUrls.unshift(
        `${parsedEndpoint.protocol}//${parsedEndpoint.host}`,
      );
      return { registryUrls };
    }
  }
  return {};
}

function extractWithRegex(
  content: string,
  config: ExtractConfig,
): PackageDependency[] {
  const customRegistryUrlsPackageDependency =
    detectCustomGitHubRegistryUrlsForActions();
  logger.trace('github-actions.extractWithRegex()');
  const deps: PackageDependency[] = [];
  for (const line of content.split(newlineRegex)) {
    if (line.trim().startsWith('#')) {
      continue;
    }

    const dockerMatch = dockerActionRe.exec(line);
    if (dockerMatch) {
      const [, currentFrom] = dockerMatch;
      const dep = getDep(currentFrom, true, config.registryAliases);
      dep.depType = 'docker';
      deps.push(dep);
      continue;
    }

    const tagMatch = actionRe.exec(line);
    if (tagMatch?.groups) {
      const {
        depName,
        packageName,
        currentValue,
        path = '',
        tag,
        replaceString,
        registryUrl = '',
        commentWhiteSpaces = ' ',
      } = tagMatch.groups;
      let quotes = '';
      if (replaceString.includes("'")) {
        quotes = "'";
      }
      if (replaceString.includes('"')) {
        quotes = '"';
      }
      const dep: PackageDependency = {
        depName,
        ...(packageName !== depName && { packageName }),
        commitMessageTopic: '{{{depName}}} action',
        datasource: GithubTagsDatasource.id,
        versioning: dockerVersioning.id,
        depType: 'action',
        replaceString,
        autoReplaceStringTemplate: `${quotes}{{depName}}${path}@{{#if newDigest}}{{newDigest}}${quotes}{{#if newValue}}${commentWhiteSpaces}# {{newValue}}{{/if}}{{/if}}{{#unless newDigest}}{{newValue}}${quotes}{{/unless}}`,
        ...(registryUrl
          ? detectDatasource(registryUrl)
          : customRegistryUrlsPackageDependency),
      };
      if (shaRe.test(currentValue)) {
        dep.currentValue = tag;
        dep.currentDigest = currentValue;
      } else if (shaShortRe.test(currentValue)) {
        dep.currentValue = tag;
        dep.currentDigestShort = currentValue;
      } else {
        dep.currentValue = currentValue;
      }
      deps.push(dep);
    }
  }
  return deps;
}

function detectDatasource(registryUrl: string): PackageDependency {
  const platform = detectPlatform(registryUrl);

  switch (platform) {
    case 'github':
      return { registryUrls: [registryUrl] };
    case 'gitea':
      return {
        registryUrls: [registryUrl],
        datasource: GiteaTagsDatasource.id,
      };
  }

  return {
    skipReason: 'unsupported-url',
  };
}

function extractContainer(
  container: unknown,
  registryAliases: Record<string, string> | undefined,
): PackageDependency | undefined {
  if (is.string(container)) {
    return getDep(container, true, registryAliases);
  } else if (is.plainObject(container) && is.string(container.image)) {
    return getDep(container.image, true, registryAliases);
  }
  return undefined;
}

const runnerVersionRegex = regEx(
  /^\s*(?<depName>[a-zA-Z]+)-(?<currentValue>[^\s]+)/,
);

function extractRunner(runner: string): PackageDependency | null {
  const runnerVersionGroups = runnerVersionRegex.exec(runner)?.groups;
  if (!runnerVersionGroups) {
    return null;
  }

  const { depName, currentValue } = runnerVersionGroups;

  if (!GithubRunnersDatasource.isValidRunner(depName, currentValue)) {
    return null;
  }

  const dependency: PackageDependency = {
    depName,
    currentValue,
    replaceString: `${depName}-${currentValue}`,
    depType: 'github-runner',
    datasource: GithubRunnersDatasource.id,
    autoReplaceStringTemplate: '{{depName}}-{{newValue}}',
  };

  if (!dockerVersioning.api.isValid(currentValue)) {
    dependency.skipReason = 'invalid-version';
  }

  return dependency;
}

function extractRunners(runner: unknown): PackageDependency[] {
  const runners: string[] = [];
  if (is.string(runner)) {
    runners.push(runner);
  } else if (is.array(runner, is.string)) {
    runners.push(...runner);
  }

  return runners.map(extractRunner).filter(isNotNullOrUndefined);
}

const communityActions = z.union([
  z
    .object({
      // https://github.com/jaxxstorm/action-install-gh-release
      uses: z
        .string()
        .regex(
          /^(https:\/\/github\.com\/)?jaxxstorm\/action-install-gh-release@.*$/,
        ),
      with: z.object({ repo: z.string(), tag: z.string() }),
    })
    .transform(({ with: val }): PackageDependency => {
      return {
        datasource: GithubReleasesDatasource.id,
        depName: val.repo,
        packageName: val.repo,
        currentValue: val.tag,
        depType: 'uses-with',
      };
    }),
  z
    .object({
      // https://github.com/astral-sh/setup-uv
      uses: z
        .string()
        .regex(/^(https:\/\/github\.com\/)?astral-sh\/setup-uv@.*$/),
      with: z.object({ version: z.string() }),
    })
    .transform(({ with: val }): PackageDependency | undefined => {
      if (val.version === 'latest') {
        return;
      }

      return {
        datasource: GithubReleasesDatasource.id,
        depName: 'astral-sh/uv',
        versioning: npmVersioning.id,
        packageName: 'astral-sh/uv',
        currentValue: val.version,
        depType: 'uses-with',
      };
    }),
  z
    .object({
      // https://github.com/pnpm/action-setup
      uses: z
        .string()
        .regex(/^(https:\/\/github\.com\/)?pnpm\/action-setup@.*$/),
      with: z.object({
        version: z.union([
          z.string(),
          z.number().transform((s) => s.toString()),
        ]),
      }),
    })
    .transform(({ with: val }): PackageDependency | undefined => {
      if (val.version === 'latest') {
        return;
      }

      return {
        datasource: NpmDatasource.id,
        depName: 'pnpm',
        versioning: npmVersioning.id,
        packageName: 'pnpm',
        currentValue: val.version,
        depType: 'uses-with',
      };
    }),
  z
    .object({
      // https://github.com/astral-sh/setup-uv
      uses: z
        .string()
        .regex(/^(https:\/\/github\.com\/)?pdm-project\/setup-pdm@.*$/),
      with: z.object({ version: z.string().refine((s) => s !== 'head') }),
    })
    .transform(({ with: val }): PackageDependency | undefined => {
      return {
        datasource: PypiDatasource.id,
        depName: 'pdm',
        versioning: pep440versioning.id,
        packageName: 'pdm',
        currentValue: val.version,
        depType: 'uses-with',
      };
    }),
]);

function extractWithYAMLParser(
  content: string,
  packageFile: string,
  config: ExtractConfig,
): PackageDependency[] {
  logger.trace('github-actions.extractWithYAMLParser()');
  const deps: PackageDependency[] = [];

  let pkg: Workflow;
  try {
    // TODO: use schema (#9610)
    pkg = parseSingleYaml(content);
  } catch (err) {
    logger.debug(
      { packageFile, err },
      'Failed to parse GitHub Actions Workflow YAML',
    );
    return [];
  }

  for (const job of Object.values(pkg?.jobs ?? {})) {
    const dep = extractContainer(job?.container, config.registryAliases);
    if (dep) {
      dep.depType = 'container';
      deps.push(dep);
    }

    for (const service of Object.values(job?.services ?? {})) {
      const dep = extractContainer(service, config.registryAliases);
      if (dep) {
        dep.depType = 'service';
        deps.push(dep);
      }
    }

    deps.push(...extractRunners(job?.['runs-on']));

    const actionsWithVersions: Record<string, Partial<PackageDependency>> = {
      go: {
        versioning: npmVersioning.id,
      },
      node: {
        versioning: nodeVersioning.id,
      },
      python: {
        versioning: npmVersioning.id,
      },
      // Not covered yet because they use different datasources/packageNames:
      // - dotnet
      // - java
    };

    for (const step of coerceArray(job?.steps)) {
      if (step.uses) {
        const val = Result.parse(step, communityActions).unwrapOrNull();
        if (val) {
          deps.push(val);
        }
      }

      for (const [action, actionData] of Object.entries(actionsWithVersions)) {
        const actionName = `actions/setup-${action}`;
        if (
          step.uses === actionName ||
          step.uses?.startsWith(`${actionName}@`)
        ) {
          const fieldName = `${action}-version`;
          const currentValue = step.with?.[fieldName];
          if (currentValue) {
            deps.push({
              datasource: GithubReleasesDatasource.id,
              depName: action,
              packageName: `actions/${action}-versions`,
              ...actionData,
              extractVersion: '^(?<version>\\d+\\.\\d+\\.\\d+)(-\\d+)?$', // Actions release tags are like 1.24.1-13667719799
              currentValue,
              depType: 'uses-with',
            });
          }
        }
      }
    }
  }

  return deps;
}

export function extractPackageFile(
  content: string,
  packageFile: string,
  config: ExtractConfig = {}, // TODO: enforce ExtractConfig
): PackageFileContent | null {
  logger.trace(`github-actions.extractPackageFile(${packageFile})`);
  const deps = [
    ...extractWithRegex(content, config),
    ...extractWithYAMLParser(content, packageFile, config),
  ];
  if (!deps.length) {
    return null;
  }
  return { deps };
}

import is from '@sindresorhus/is';
import type { z } from 'zod';
import { logger } from '../../../logger';
import { getSiblingFileName, localPathExists } from '../../../util/fs';
import { Result } from '../../../util/result';
import * as toml from '../../../util/toml';
import type { PackageFileContent } from '../types';
import { type PixiConfigSchema, PixiToml, PyprojectSchema } from './schema';

function getUserPixiConfig(
  content: string,
  packageFile: string,
): null | z.infer<typeof PixiConfigSchema> {
  if (packageFile.endsWith('pyproject.toml')) {
    let uncheckedValue: undefined | { tool?: { pixi?: any } };
    try {
      uncheckedValue = toml.parse(content) as any;
    } catch (err) {
      logger.debug({ packageFile, err }, `pixi: error parsing pyproject.toml`);
      return null;
    }
    if (is.nullOrUndefined(uncheckedValue?.tool?.pixi)) {
      return null;
    }

    const { val, err } = Result.parse(uncheckedValue, PyprojectSchema).unwrap();
    if (err) {
      logger.debug(
        { packageFile, err },
        `pixi: error parsing pyproject.toml data as pixi config`,
      );
      return null;
    }

    return val;
  }

  if (packageFile.endsWith('pixi.toml')) {
    const { val, err } = Result.parse(content, PixiToml).unwrap();
    if (err) {
      logger.debug({ packageFile, err }, `pixi: error parsing pixi.toml`);
      return null;
    }

    return val;
  }

  /* v8 ignore next 2 */
  return null;
}

export async function extractPackageFile(
  content: string,
  packageFile: string,
): Promise<PackageFileContent | null> {
  logger.trace(`pixi.extractPackageFile(${packageFile})`);

  const config = getUserPixiConfig(content, packageFile);
  if (!config) {
    return null;
  }

  const lockfileName = getSiblingFileName(packageFile, 'pixi.lock');
  const lockFiles = [];
  if (await localPathExists(lockfileName)) {
    lockFiles.push(lockfileName);
  }

  return {
    lockFiles,
    deps: [...config.conda, ...config.pypi],
  };
}

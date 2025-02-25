import type { UpdateDependencyConfig } from '../types';
import { PixiManagerData } from './schema';
import { replaceString as replaceTomlString } from '../../../util/toml';
import is from '@sindresorhus/is';

type PixiUpgrade = UpdateDependencyConfig<PixiManagerData>;

export function updateDependency({
  fileContent,
  upgrade,
}: PixiUpgrade): string | null {
  if (is.nullOrUndefined(upgrade.managerData)) {
    return fileContent;
  }

  return replaceTomlString(
    fileContent,
    upgrade.managerData.path,
    () => upgrade.newValue!,
  );
}

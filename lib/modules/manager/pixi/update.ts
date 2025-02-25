import is from '@sindresorhus/is';
import { replaceString as replaceTomlString } from '../../../util/toml';
import type { UpdateDependencyConfig } from '../types';
import type { PixiManagerData } from './schema';

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

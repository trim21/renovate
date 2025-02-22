import { Version, VersionSpec } from '@trim21/rattler';
import type { SemVer } from 'semver';

import type { RangeStrategy } from '../../../types/versioning';
import pep440 from '../pep440';
import type { NewValueConfig, VersioningApi } from '../types';

function parse(v: string): Version | null {
  try {
    return new Version(v);
  } catch {
    return null;
  }
}

export const id = 'conda';
export const displayName = 'conda';
export const urls = [
  'https://docs.conda.io/projects/conda-build/en/stable/resources/package-spec.html#package-match-specifications',
];
export const supportsRanges = true;
export const supportedRangeStrategies: RangeStrategy[] = [
  // 'bump',
  'pin',
  // 'replace',
];

const unstableComponents = ['alpha', 'beta', 'dev', 'rc', 'a', 'b'];

function isValidVersion(s: string): boolean {
  try {
    new Version(s);
    return true;
  } catch {
    return false;
  }
}

function isValidVersionSpec(s: string): boolean {
  try {
    new VersionSpec(s);
    return true;
  } catch {
    return false;
  }
}

function isValid(input: string): boolean {
  return isValidVersion(input) || isValidVersionSpec(input);
}

function isVersion(input: string | undefined | null): boolean {
  if (!input) {
    return false;
  }

  return isValidVersion(input);
}

function matches(version: string, range: string): boolean {
  try {
    return new VersionSpec(range).matches(new Version(version));
  } catch {
    return false;
  }
}

function isSingleVersion(input: string): boolean {
  if (!input.startsWith('=')) {
    return false;
  }

  return isValidVersion(input.replace(/^==/, '').trimStart());
}

function getNewValue({
  currentValue,
  rangeStrategy,
  currentVersion,
  newVersion,
  isReplacement,
}: NewValueConfig): string | null {
  if (rangeStrategy === 'pin') {
    if (!currentValue.trim()) {
      return '==' + newVersion;
    }
    // already pin
    if (isSingleVersion(currentValue)) {
      return '==' + newVersion;
    }

    if (matches(newVersion, currentValue)) {
      return '==' + newVersion;
    }

    return null;
  }

  throw new Error(
    'conda versioning for non-pin strategy is not implemented yet.',
  );
}

export const api: VersioningApi = {
  isValid,
  isVersion,
  isSingleVersion,

  isStable(version: string): boolean {
    if (!parse(version)) {
      return false;
    }

    for (const element of unstableComponents) {
      if (version.includes(element)) {
        return false;
      }
    }

    return true;
  },

  isCompatible(version: string, current?: string): boolean {
    return true;
  },

  getMajor(version: string | SemVer): null | number {
    return parse(version as string)?.asMajorMinor?.()?.[0] ?? null;
  },
  getMinor(version: string | SemVer): null | number {
    return parse(version as string)?.asMajorMinor?.()?.[1] ?? null;
  },
  // sadly conda version doesn't have a concept of patch version
  // so we try to use pep440 get a patch version.
  getPatch(version: string | SemVer): null | number {
    return pep440.getPatch(version);
  },
  equals(version: string, other: string): boolean {
    return parse(version)?.equals(new Version(other)) ?? false;
  },
  isGreaterThan(version: string, other: string): boolean {
    return new Version(version).compare(new Version(other)) > 0;
  },
  getSatisfyingVersion(versions: string[], range: string): string | null {
    const spec = new VersionSpec(range);
    const satisfiedVersions = versions
      .map((v, index) => {
        return [new Version(v), index] as [Version, number];
      })
      .filter(([v]) => {
        return spec.matches(v);
      });

    satisfiedVersions.sort(([a], [b]) => a.compare(b));
    if (satisfiedVersions.length === 0) {
      return null;
    }

    return versions[satisfiedVersions.pop()![1]] ?? null;
  },
  minSatisfyingVersion(versions: string[], range: string): string | null {
    const spec = new VersionSpec(range);
    const satisfiedVersions = versions
      .map((v, index) => {
        return [new Version(v), index] as [Version, number];
      })
      .filter(([v, index]) => {
        return spec.matches(v);
      });

    satisfiedVersions.sort(([a, index1], [b, index2]) => -a.compare(b));
    if (satisfiedVersions.length === 0) {
      return null;
    }

    return versions[satisfiedVersions.pop()![1]] ?? null;
  },
  getNewValue,
  sortVersions(version: string, other: string): number {
    return new Version(version).compare(new Version(other));
  },
  matches,
};

export default api;

/**
 * Small semver evaluator for extension compatibility. The supported grammar is
 * intentionally narrow and documented: exact versions, *, ^, ~, comparator
 * sets, and || alternatives. Avoiding a general dependency keeps this kernel
 * deterministic and makes the accepted compatibility policy explicit.
 */

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const comparatorPattern = /^(<=|>=|<|>)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== null;
}

export function isValidVersionRange(range: string): boolean {
  try {
    parseRange(range);
    return true;
  } catch {
    return false;
  }
}

export function satisfiesVersion(version: string, range: string): boolean {
  const candidate = parseVersion(version);
  if (!candidate) {
    return false;
  }

  try {
    return parseRange(range).some((alternative) => alternative.every((predicate) => predicate(candidate)));
  } catch {
    return false;
  }
}

function parseVersion(version: string): SemVer | null {
  const match = semverPattern.exec(version);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

type VersionPredicate = (candidate: SemVer) => boolean;

function parseRange(range: string): VersionPredicate[][] {
  const alternatives = range.trim().split(/\s*\|\|\s*/);
  if (alternatives.length === 0 || alternatives.some((alternative) => alternative.length === 0)) {
    throw new Error('Empty semantic-version range');
  }

  return alternatives.map((alternative) => {
    if (alternative === '*') {
      return [() => true];
    }

    const terms = alternative.trim().split(/\s+/);
    if (terms.some((term) => term.length === 0)) {
      throw new Error('Empty semantic-version comparator');
    }
    return terms.flatMap(parseRangeTerm);
  });
}

function parseRangeTerm(term: string): VersionPredicate[] {
  const modifier = term.charAt(0);
  if (modifier === '^' || modifier === '~') {
    const base = parseVersion(term.slice(1));
    if (!base) {
      throw new Error(`Invalid semantic-version range ${term}`);
    }
    const upper = modifier === '^' ? caretUpperBound(base) : tildeUpperBound(base);
    return [
      (candidate) => compareVersions(candidate, base) >= 0,
      (candidate) => compareVersions(candidate, upper) < 0,
    ];
  }

  const match = comparatorPattern.exec(term);
  if (!match) {
    throw new Error(`Invalid semantic-version comparator ${term}`);
  }
  const comparator = match[1] ?? '';
  const compared = parseVersion(match[2]);
  if (!compared) {
    throw new Error(`Invalid semantic version ${match[2]}`);
  }

  switch (comparator) {
    case '':
      return [(candidate) => compareVersions(candidate, compared) === 0];
    case '>':
      return [(candidate) => compareVersions(candidate, compared) > 0];
    case '>=':
      return [(candidate) => compareVersions(candidate, compared) >= 0];
    case '<':
      return [(candidate) => compareVersions(candidate, compared) < 0];
    case '<=':
      return [(candidate) => compareVersions(candidate, compared) <= 0];
    default:
      throw new Error(`Unsupported semantic-version comparator ${comparator}`);
  }
}

function caretUpperBound(base: SemVer): SemVer {
  if (base.major > 0) {
    return { major: base.major + 1, minor: 0, patch: 0, prerelease: null };
  }
  if (base.minor > 0) {
    return { major: 0, minor: base.minor + 1, patch: 0, prerelease: null };
  }
  return { major: 0, minor: 0, patch: base.patch + 1, prerelease: null };
}

function tildeUpperBound(base: SemVer): SemVer {
  return { major: base.major, minor: base.minor + 1, patch: 0, prerelease: null };
}

function compareVersions(left: SemVer, right: SemVer): number {
  const numbers: Array<keyof Pick<SemVer, 'major' | 'minor' | 'patch'>> = [
    'major',
    'minor',
    'patch',
  ];
  for (const field of numbers) {
    if (left[field] !== right[field]) {
      return left[field] > right[field] ? 1 : -1;
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (left.prerelease === null) {
    return 1;
  }
  if (right.prerelease === null) {
    return -1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function comparePrerelease(left: string, right: string): number {
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = /^\d+$/.test(leftPart);
    const rightNumber = /^\d+$/.test(rightPart);
    if (leftNumber && rightNumber) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumber) return -1;
    if (rightNumber) return 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

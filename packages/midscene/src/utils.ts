import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path, { basename, dirname, join } from 'node:path';
import type { Rect, ReportDumpWithAttributes } from './types';

interface PkgInfo {
  name: string;
  version: string;
  dir: string;
}

let pkg: PkgInfo | undefined;
export function getPkgInfo(): PkgInfo {
  if (pkg) {
    return pkg;
  }

  const pkgDir = findNearestPackageJson(__dirname);
  assert(pkgDir, 'package.json not found');
  const pkgJsonFile = join(pkgDir, 'package.json');

  if (pkgJsonFile) {
    const { name, version } = JSON.parse(readFileSync(pkgJsonFile, 'utf-8'));
    pkg = { name, version, dir: pkgDir };
    return pkg;
  }
  return {
    name: 'midscene-unknown-page-name',
    version: '0.0.0',
    dir: pkgDir,
  };
}

let logDir = join(process.cwd(), './midscene_run/');
let logEnvReady = false;
export const insightDumpFileExt = 'insight-dump.json';
export const groupedActionDumpFileExt = 'web-dump.json';

export function getLogDir() {
  return logDir;
}

export function setLogDir(dir: string) {
  logDir = dir;
}

export function getLogDirByType(type: 'dump' | 'cache' | 'report') {
  const dir = join(getLogDir(), type);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function writeDumpReport(
  fileName: string,
  dumpData: string | ReportDumpWithAttributes[],
) {
  const { dir } = getPkgInfo();
  const reportTplPath = join(dir, './report/index.html');
  existsSync(reportTplPath) ||
    assert(false, `report template not found: ${reportTplPath}`);
  const reportPath = join(getLogDirByType('report'), `${fileName}.html`);
  const tpl = readFileSync(reportTplPath, 'utf-8');
  let reportContent: string;
  if (typeof dumpData === 'string') {
    reportContent = tpl.replace(
      '{{dump}}',
      `<script type="midscene_web_dump" type="application/json">${dumpData}</script>`,
    );
  } else {
    const dumps = dumpData.map(({ dumpString, attributes }) => {
      const attributesArr = Object.keys(attributes || {}).map((key) => {
        return `${key}="${encodeURIComponent(attributes![key])}"`;
      });
      return `<script type="midscene_web_dump" type="application/json" ${attributesArr.join(' ')}>${dumpString}</script>`;
    });
    reportContent = tpl.replace('{{dump}}', dumps.join('\n'));
  }
  writeFileSync(reportPath, reportContent);

  return reportPath;
}

export function writeLogFile(opts: {
  fileName: string;
  fileExt: string;
  fileContent: string;
  type: 'dump' | 'cache' | 'report';
  generateReport?: boolean;
}) {
  const { fileName, fileExt, fileContent, type = 'dump' } = opts;
  const targetDir = getLogDirByType(type);
  // Ensure directory exists
  if (!logEnvReady) {
    assert(targetDir, 'logDir should be set before writing dump file');

    // gitIgnore in the parent directory
    const gitIgnorePath = join(targetDir, '../../.gitignore');
    let gitIgnoreContent = '';
    if (existsSync(gitIgnorePath)) {
      gitIgnoreContent = readFileSync(gitIgnorePath, 'utf-8');
    }

    // ignore the log folder
    const logDirName = basename(logDir);
    if (!gitIgnoreContent.includes(`${logDirName}/`)) {
      writeFileSync(
        gitIgnorePath,
        `${gitIgnoreContent}\n# Midscene.js dump files\n${logDirName}/report\n${logDirName}/dump\n`,
        'utf-8',
      );
    }
    logEnvReady = true;
  }

  const filePath = join(targetDir, `${fileName}.${fileExt}`);

  const outputResourceDir = dirname(filePath);
  if (!existsSync(outputResourceDir)) {
    mkdirSync(outputResourceDir, { recursive: true });
  }

  writeFileSync(filePath, fileContent);

  if (opts?.generateReport) {
    return writeDumpReport(fileName, fileContent);
  }

  return filePath;
}

export function getTmpDir() {
  const path = join(tmpdir(), getPkgInfo().name);
  mkdirSync(path, { recursive: true });
  return path;
}

export function getTmpFile(fileExtWithoutDot: string) {
  const filename = `${randomUUID()}.${fileExtWithoutDot}`;
  return join(getTmpDir(), filename);
}

export function overlapped(container: Rect, target: Rect) {
  // container and the target have some part overlapped
  return (
    container.left < target.left + target.width &&
    container.left + container.width > target.left &&
    container.top < target.top + target.height &&
    container.top + container.height > target.top
  );
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const commonScreenshotParam = { type: 'jpeg', quality: 75 } as any;

export function replacerForPageObject(key: string, value: any) {
  if (value && value.constructor?.name === 'Page') {
    return '[Page object]';
  }
  if (value && value.constructor?.name === 'Browser') {
    return '[Browser object]';
  }
  return value;
}

export function stringifyDumpData(data: any, indents?: number) {
  return JSON.stringify(data, replacerForPageObject, indents);
}

/**
 * Find the nearest package.json file recursively
 * @param {string} dir - Home directory
 * @returns {string|null} - The most recent package.json file path or null
 */
export function findNearestPackageJson(dir: string): string | null {
  const packageJsonPath = path.join(dir, 'package.json');

  if (existsSync(packageJsonPath)) {
    return dir;
  }

  const parentDir = path.dirname(dir);

  // Return null if the root directory has been reached
  if (parentDir === dir) {
    return null;
  }

  return findNearestPackageJson(parentDir);
}

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

function git(args, options = {}) {
  try {
    const output = execFileSync('git', args, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    return options.inherit ? '' : output.trim();
  } catch (error) {
    const stderr = error?.stderr?.toString().trim();
    const detail = stderr ? `：${stderr}` : '';
    throw new Error(`git ${args.join(' ')} 执行失败${detail}`);
  }
}

function fail(message) {
  console.error(`发布 tag 未创建：${message}`);
  process.exitCode = 1;
}

function parseVersion(value) {
  const normalized = value.startsWith('v') ? value.slice(1) : value;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(normalized);
  if (!match) {
    throw new Error(`版本必须是 X.Y.Z 格式，例如 1.0.3；收到 ${value}`);
  }

  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`版本号过大，无法安全递增：${value}`);
  }

  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
    tag: `v${parts.join('.')}`,
    version: parts.join('.'),
  };
}

function compareVersions(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function readReleaseTags() {
  const tags = git(['tag', '--list', 'v*'])
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const versions = [];

  for (const tag of tags) {
    try {
      versions.push(parseVersion(tag));
    } catch {
      // 非 vX.Y.Z 标签不参与发布版本递增，但不影响其他 tag 使用。
    }
  }

  return { names: new Set(tags), versions };
}

function assertReleasePointIsSafe() {
  const branch = git(['branch', '--show-current']);
  if (branch !== 'main') {
    throw new Error(`当前分支是 ${branch || 'detached HEAD'}，发布 tag 只能从 main 创建`);
  }

  const statusLines = git(['status', '--porcelain=v1', '--untracked-files=all'])
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    // 本项目约定 deploy/secrets/ 只保存本地未跟踪凭证，不属于发布内容。
    .filter((line) => !(line.startsWith('?? ') && line.slice(3).startsWith('deploy/secrets/')));
  if (statusLines.length > 0) {
    throw new Error(`工作区不干净，请先提交或处理以下变更：\n${statusLines.join('\n')}`);
  }

  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'refs/remotes/origin/main']);
  if (head !== originMain) {
    throw new Error('当前 HEAD 与 origin/main 不一致，请先推送 main 并重新运行发布命令');
  }

  return { head, shortHead: git(['rev-parse', '--short', 'HEAD']) };
}

function usage() {
  console.log(`用法：
  npm run release              根据最新 vX.Y.Z 自动递增 patch 并创建 tag
  npm run release -- 1.0.0     手动指定版本并创建 v1.0.0
  npm run release -- --dry-run 只检查并显示将创建的 tag，不实际创建

说明：命令只在本地创建 annotated tag，不会自动推送。`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const dryRun = args.includes('--dry-run');
  const versionArgs = args.filter((arg) => arg !== '--dry-run');
  if (versionArgs.length > 1) {
    throw new Error('只能提供一个版本号');
  }

  // 先同步远端 tag 和 main，防止在本地 tag 不完整时递增出重复版本。
  git(['fetch', '--quiet', '--tags', 'origin', 'main'], { inherit: true });
  const releasePoint = assertReleasePointIsSafe();
  const releaseTags = readReleaseTags();
  const latest = releaseTags.versions.sort(compareVersions).at(-1);

  let target;
  let source;
  if (versionArgs.length === 1) {
    target = parseVersion(versionArgs[0]);
    source = `手动指定 ${target.version}`;
    if (latest && compareVersions(target, latest) <= 0) {
      throw new Error(`版本必须高于现有最高 tag ${latest.tag}`);
    }
  } else {
    if (!latest) {
      throw new Error('当前没有合法的发布 tag；首次发布请显式指定版本，例如 npm run release -- 1.0.0');
    }
    if (latest.patch === Number.MAX_SAFE_INTEGER) {
      throw new Error(`无法递增 ${latest.tag} 的 patch 版本`);
    }
    target = parseVersion(`${latest.major}.${latest.minor}.${latest.patch + 1}`);
    source = `由最新 tag ${latest.tag} 自动递增 patch`;
  }

  if (releaseTags.names.has(target.tag)) {
    throw new Error(`${target.tag} 已存在，不能覆盖已有 tag`);
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}准备创建 ${target.tag}（${source}）`);
  console.log(`目标提交：${releasePoint.head}（${releasePoint.shortHead}）`);
  console.log(`小程序上传版本：${target.version}`);
  console.log('云托管服务内部版本号仍由微信云托管平台生成，发布备注会记录 tag 和 Git SHA。');

  if (dryRun) {
    console.log(`后续手动推送：git push origin ${target.tag}`);
    return;
  }

  git(['tag', '-a', target.tag, '-m', `Release ${target.tag}`], { inherit: true });
  console.log(`已创建本地 tag ${target.tag}`);
  console.log(`请确认微信后台当前版本后，再执行：git push origin ${target.tag}`);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

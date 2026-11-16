import { access, mkdir, readFile, rename, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile as execute } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const execFile = promisify(execute);
export const root = fileURLToPath(new URL('../', import.meta.url));
export const dataDirectory = path.resolve(process.env.LOCAL_MAP_DATA || path.join(root, 'map-data/wuhan'));
export async function exists(file) { try { await access(file); return true; } catch { return false; } }

// 使用 curl 以支持系统代理；临时文件断点续传，成功后原子替换最终文件。
export async function download(url, destination) {
  if (await exists(destination)) return;
  await mkdir(path.dirname(destination), { recursive: true });
  console.log(`下载 ${url}`);
  await execFile('curl', ['--fail', '--location', '--show-error', '--silent', '--retry', '3',
    '--retry-all-errors', '--connect-timeout', '20', '--max-time', '1800',
    '--continue-at', '-', '--output', destination + '.part', url]);
  await rename(destination + '.part', destination);
}

export async function pmtilesBinary({ install = false } = {}) {
  if (process.env.PMTILES_BIN) return process.env.PMTILES_BIN;
  const version = '1.31.2';
  const architecture = { x64: ['x86_64', '3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f'],
    arm64: ['arm64', 'f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1'] }[process.arch];
  if (process.platform !== 'linux' || !architecture) {
    throw new Error('自动安装支持 Linux/WSL x64、arm64；其他系统请安装 pmtiles 并设置 PMTILES_BIN 为可执行文件路径。');
  }
  const directory = path.join(root, '.tools', `pmtiles-${version}-${architecture[0]}`);
  const binary = path.join(directory, 'pmtiles');
  if (await exists(binary)) return binary;
  if (!install) throw new Error('缺少 PMTiles 工具，请先运行 pnpm maps:download');
  await mkdir(directory, { recursive: true });
  const name = `go-pmtiles_${version}_Linux_${architecture[0]}.tar.gz`;
  const archive = path.join(directory, name);
  await download(`https://github.com/protomaps/go-pmtiles/releases/download/v${version}/${name}`, archive);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  if (digest !== architecture[1]) {
    await rm(archive, { force: true });
    throw new Error('PMTiles 工具校验失败，请重新运行下载命令');
  }
  await execFile('tar', ['-xzf', archive, '-C', directory, 'pmtiles']);
  await chmod(binary, 0o755);
  return binary;
}

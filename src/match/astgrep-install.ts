import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'

export const PINNED_VERSION = '0.45.3'

// ast-grep releases ship no checksum file, so these are computed when the
// version is pinned. Bump both together.
const CHECKSUMS: Record<string, string> = {
  'app-aarch64-apple-darwin.zip': '6d2279dea5bea2ad79c66ea93f5fe54ba926e398a8a26de76c56db68fe59eac6',
  'app-x86_64-apple-darwin.zip': 'b2ffd26f42810340326a9e8a084bdc3647a8795c1a3f21fc06bd7bef3c7c5b2c',
  'app-aarch64-unknown-linux-gnu.zip': 'b39cfbc58da4b869a88b8a4bc57bd5deb0d24541e704cf7c257da7b53ec81c8f',
  'app-x86_64-unknown-linux-gnu.zip': 'f8ac830881339d1edee6b2652f54798c0f4da5a827f2db38a08ee31117783ce8',
  'app-aarch64-pc-windows-msvc.zip': '5da748848c4cad2a1e7f41e27b58871714dd2c0908632f9874cc2833b92a21ca',
  'app-x86_64-pc-windows-msvc.zip': '3751b7d6be7fd39a80df1180ffe7e053903dcf92d3190e5a8336ff1746af9059',
}

export function assetName(platform: NodeJS.Platform, arch: string): string {
  const cpu = { x64: 'x86_64', arm64: 'aarch64' }[arch]
  const os = { linux: 'unknown-linux-gnu', darwin: 'apple-darwin', win32: 'pc-windows-msvc' }[platform as string]
  if (!cpu || !os) throw new Error(`ast-grep has no release binary for ${platform}/${arch}`)
  return `app-${cpu}-${os}.zip`
}

export async function installAstGrep(version: string): Promise<string> {
  const exe = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep'
  const cached = tc.find('ast-grep', version)
  if (cached) return join(cached, exe)

  const asset = assetName(process.platform, process.arch)
  const url = `https://github.com/ast-grep/ast-grep/releases/download/${version}/${asset}`
  core.info(`Downloading ast-grep ${version} from ${url}`)
  const zip = await tc.downloadTool(url)

  if (version === PINNED_VERSION) {
    const sum = createHash('sha256').update(await readFile(zip)).digest('hex')
    if (sum !== CHECKSUMS[asset]) {
      throw new Error(`ast-grep ${asset} checksum mismatch: expected ${CHECKSUMS[asset]}, got ${sum}`)
    }
  } else {
    core.warning(`ast-grep ${version} is not the pinned ${PINNED_VERSION}, so its checksum is not verified`)
  }

  const dir = await tc.extractZip(zip)
  return join(await tc.cacheDir(dir, 'ast-grep', version), exe)
}

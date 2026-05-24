import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'src', 'assets', 'brand', 'app-icon.svg')
const outDir = path.join(root, 'build-assets')
const pngPath = path.join(outDir, 'app-icon.png')
const icoPath = path.join(outDir, 'app-icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]

await fs.mkdir(outDir, { recursive: true })

await sharp(source)
  .resize(512, 512)
  .png()
  .toFile(pngPath)

const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(source)
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
)

const icoBuffer = await pngToIco(pngBuffers)
await fs.writeFile(icoPath, icoBuffer)

console.log(`Icones gerados em ${outDir}`)

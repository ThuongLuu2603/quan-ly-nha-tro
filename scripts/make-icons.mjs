import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      raw[offset++] = pixels[i]
      raw[offset++] = pixels[i + 1]
      raw[offset++] = pixels[i + 2]
      raw[offset++] = pixels[i + 3]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Bieu tuong: nen xanh bo tron, mai nha va than nha mau trang. */
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4)
  const bg = [13, 148, 136]
  const fg = [255, 255, 255]
  const radius = size * 0.22
  const s = (v) => v * size

  const inRoundedSquare = (x, y) => {
    const rx = Math.min(x, size - 1 - x)
    const ry = Math.min(y, size - 1 - y)
    if (rx >= radius || ry >= radius) return true
    const dx = radius - rx
    const dy = radius - ry
    return dx * dx + dy * dy <= radius * radius
  }

  const roofApex = { x: 0.5, y: 0.2 }
  const roofLeft = { x: 0.14, y: 0.5 }
  const roofRight = { x: 0.86, y: 0.5 }

  const inTriangle = (px, py) => {
    const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)
    const d1 = sign(px, py, roofApex.x, roofApex.y, roofLeft.x, roofLeft.y)
    const d2 = sign(px, py, roofLeft.x, roofLeft.y, roofRight.x, roofRight.y)
    const d3 = sign(px, py, roofRight.x, roofRight.y, roofApex.x, roofApex.y)
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0
    return !(hasNeg && hasPos)
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (!inRoundedSquare(x, y)) {
        pixels[i + 3] = 0
        continue
      }

      const nx = x / size
      const ny = y / size

      let color = bg
      const inBody = nx > 0.24 && nx < 0.76 && ny > 0.46 && ny < 0.82
      const inDoor = nx > 0.43 && nx < 0.57 && ny > 0.6 && ny < 0.82
      if ((inTriangle(nx, ny) || inBody) && !inDoor) color = fg

      pixels[i] = color[0]
      pixels[i + 1] = color[1]
      pixels[i + 2] = color[2]
      pixels[i + 3] = 255
    }
  }

  // vien duoi mai nha cho gon
  for (let y = Math.floor(s(0.82)); y < Math.floor(s(0.84)); y++) {
    for (let x = Math.floor(s(0.24)); x < Math.floor(s(0.76)); x++) {
      const i = (y * size + x) * 4
      pixels[i] = fg[0]
      pixels[i + 1] = fg[1]
      pixels[i + 2] = fg[2]
      pixels[i + 3] = 255
    }
  }

  return encodePng(size, size, pixels)
}

mkdirSync(publicDir, { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(resolve(publicDir, `icon-${size}.png`), drawIcon(size))
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0d9488"/>
  <path d="M32 13 L55 32 L48 32 L48 52 L36 52 L36 39 L28 39 L28 52 L16 52 L16 32 L9 32 Z" fill="#fff"/>
</svg>
`
writeFileSync(resolve(publicDir, 'favicon.svg'), favicon)

console.log('Đã tạo icon trong public/')

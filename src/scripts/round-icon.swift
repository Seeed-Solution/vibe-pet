import AppKit
import Foundation

guard CommandLine.arguments.count >= 4 else {
  fputs("usage: round-icon.swift <input> <output> <size> [contentScale]\n", stderr)
  exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let pixelSize = Int(CommandLine.arguments[3]) ?? 512
let contentScale = CommandLine.arguments.count >= 5
  ? max(1.0, Double(CommandLine.arguments[4]) ?? 1.0)
  : 1.0

guard let source = NSImage(contentsOfFile: inputPath) else {
  fputs("failed to load input image\n", stderr)
  exit(1)
}

guard let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: pixelSize,
  pixelsHigh: pixelSize,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else {
  fputs("failed to create bitmap\n", stderr)
  exit(1)
}

NSGraphicsContext.saveGraphicsState()
guard let context = NSGraphicsContext(bitmapImageRep: rep) else {
  fputs("failed to create graphics context\n", stderr)
  exit(1)
}
NSGraphicsContext.current = context

let length = CGFloat(pixelSize)
NSColor.clear.set()
NSRect(x: 0, y: 0, width: length, height: length).fill()

let cornerRadius = length * 0.2237
let frame = NSRect(x: 0, y: 0, width: length, height: length)
let clip = NSBezierPath(roundedRect: frame, xRadius: cornerRadius, yRadius: cornerRadius)
clip.addClip()

let drawLength = length * CGFloat(contentScale)
let drawOrigin = (length - drawLength) / 2
let drawRect = NSRect(x: drawOrigin, y: drawOrigin, width: drawLength, height: drawLength)

source.draw(
  in: drawRect,
  from: NSRect(origin: .zero, size: source.size),
  operation: .copy,
  fraction: 1.0
)

NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: NSBitmapImageRep.FileType.png, properties: [:]) else {
  fputs("failed to encode rounded png\n", stderr)
  exit(1)
}

do {
  try png.write(to: URL(fileURLWithPath: outputPath))
} catch {
  fputs("failed to write output image\n", stderr)
  exit(1)
}

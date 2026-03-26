declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: number[] | Uint8Array; delay?: number },
    ): void
    finish(): void
    bytesView(): Uint8Array
  }

  export function quantize(
    pixels: Uint8ClampedArray,
    maxColors: number,
  ): number[] | Uint8Array

  export function applyPalette(
    pixels: Uint8ClampedArray,
    palette: number[] | Uint8Array,
  ): Uint8Array
}

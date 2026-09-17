import { describe, expect, it } from "vitest";
import { compareDocumentPixels, readComparisonImageDimensions, type PixelRaster } from "../src/lib/detector/documentComparison";

type Color = [number, number, number, number];

function blank(width = 192, height = 160): PixelRaster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}

function rectangle(image: PixelRaster, x: number, y: number, width: number, height: number, color: Color = [0, 0, 0, 255]) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      image.data.set(color, (row * image.width + column) * 4);
    }
  }
}

// Deliberately irregular glyphs keep registration from matching a periodic grid.
function documentRaster(): PixelRaster {
  const image = blank();
  for (let line = 0; line < 5; line++) {
    for (let glyph = 0; glyph < 10; glyph++) {
      const x = 19 + glyph * 15 + (line % 3);
      const y = 20 + line * 25 + (glyph % 3);
      const height = 8 + ((glyph + line) % 5);
      rectangle(image, x, y, 2, height);
      rectangle(image, x, y, 5 + ((glyph * 3 + line) % 6), 2);
      if ((glyph + line) % 2) rectangle(image, x + 3, y + height - 2, 5, 2);
    }
  }
  return image;
}

function clone(image: PixelRaster): PixelRaster {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

function translate(image: PixelRaster, dx: number, dy: number): PixelRaster {
  const shifted = blank(image.width, image.height);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < image.width && ny >= 0 && ny < image.height) {
      const offset = (y * image.width + x) * 4;
      shifted.data.set(image.data.subarray(offset, offset + 4), (ny * image.width + nx) * 4);
    }
  }
  return shifted;
}

describe("compareDocumentPixels", () => {
  it("reports identical document pixels without implying human authorship", () => {
    const reference = documentRaster();
    const result = compareDocumentPixels(reference, clone(reference));
    expect(result.status).toBe("no-significant-difference");
    expect(result.changedPixelRatio).toBe(0);
    expect(result.regions).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/không xác định.*AI/);
  });

  it("locates a small added stroke in candidate coordinates", () => {
    const reference = documentRaster();
    const candidate = clone(reference);
    rectangle(candidate, 90, 86, 10, 5);
    const result = compareDocumentPixels(reference, candidate);
    expect(result.status).toBe("differences-found");
    expect(result.changedPixelRatio).toBeGreaterThan(0);
    expect(result.changedPixelRatio).toBeLessThan(0.01);
    expect(result.regions.some((region) => region.x <= 90 && region.y <= 86 && region.x + region.width >= 100 && region.y + region.height >= 91)).toBe(true);
    for (const region of result.regions) {
      expect(region.x + region.width).toBeLessThanOrEqual(candidate.width);
      expect(region.y + region.height).toBeLessThanOrEqual(candidate.height);
    }
  });

  it("aligns a small translation and discloses the unexamined border", () => {
    const reference = documentRaster();
    const result = compareDocumentPixels(reference, translate(reference, 3, -2));
    expect(result.status).toBe("no-significant-difference");
    expect(result.alignment.offsetX).toBe(3);
    expect(result.alignment.offsetY).toBe(-2);
    expect(result.changedPixelRatio).toBe(0);
    expect(result.warnings.join(" ")).toContain("dải biên");
  });

  it("keeps edit regions in candidate space after alignment", () => {
    const reference = documentRaster();
    const candidate = translate(reference, 3, -2);
    rectangle(candidate, 90, 86, 10, 5);
    const result = compareDocumentPixels(reference, candidate);
    expect(result.status).toBe("differences-found");
    expect(result.alignment.offsetX).toBe(3);
    expect(result.alignment.offsetY).toBe(-2);
    expect(result.regions.some((region) => region.x <= 90 && region.y <= 86 && region.x + region.width >= 100 && region.y + region.height >= 91)).toBe(true);
  });

  it("returns inconclusive for broadly mismatched images", () => {
    const reference = documentRaster();
    const candidate = clone(reference);
    rectangle(candidate, 0, 0, candidate.width, candidate.height, [90, 90, 90, 255]);
    const result = compareDocumentPixels(reference, candidate);
    expect(result.status).toBe("inconclusive");
    expect(result.warnings.join(" ")).toContain("không đủ tương đồng");
  });

  it("returns inconclusive when flat images provide no registration evidence", () => {
    const reference = blank();
    const candidate = blank();
    rectangle(candidate, 0, 0, candidate.width, candidate.height, [240, 240, 240, 255]);
    expect(compareDocumentPixels(reference, candidate).status).toBe("inconclusive");
  });

  it("returns inconclusive for an image too small to assess", () => {
    expect(compareDocumentPixels(blank(32, 32), blank(32, 32)).status).toBe("inconclusive");
  });

  it("treats equivalent transparent and opaque pixels as the same over white", () => {
    const reference = documentRaster();
    const candidate = clone(reference);
    rectangle(reference, 90, 86, 10, 5, [0, 0, 0, 128]);
    rectangle(candidate, 90, 86, 10, 5, [127, 127, 127, 255]);
    const result = compareDocumentPixels(reference, candidate);
    expect(result.status).toBe("no-significant-difference");
    expect(result.changedPixelRatio).toBe(0);
  });

  it("detects chromatic edits even when luminance is almost unchanged", () => {
    const reference = documentRaster();
    const candidate = clone(reference);
    rectangle(reference, 90, 86, 10, 5, [255, 0, 0, 255]);
    rectangle(candidate, 90, 86, 10, 5, [0, 130, 0, 255]);
    const result = compareDocumentPixels(reference, candidate);
    expect(result.status).toBe("differences-found");
    expect(result.changedPixelRatio).toBeGreaterThan(0);
    expect(result.regions.length).toBeGreaterThan(0);
  });

  it("rejects mismatched dimensions instead of silently comparing different rows", () => {
    expect(() => compareDocumentPixels(blank(128, 128), blank(129, 128))).toThrow(/cùng kích thước/);
  });

  it.each([
    { width: 0, height: 128, data: new Uint8ClampedArray() },
    { width: 128.5, height: 128, data: new Uint8ClampedArray() },
    { width: 1601, height: 128, data: new Uint8ClampedArray() },
    { width: 128, height: 128, data: new Uint8ClampedArray(5) },
  ])("rejects malformed raster dimensions/data: $width × $height", (invalid) => {
    expect(() => compareDocumentPixels(invalid, blank())).toThrow(/không hợp lệ/);
  });
});

function pngHeader(width: number, height: number, animated = false) {
  const bytes = new Uint8Array(animated ? 53 : 33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  if (animated) {
    view.setUint32(33, 8);
    bytes.set(new TextEncoder().encode("acTL"), 37);
  }
  return bytes;
}

function webpHeader(type: "VP8 " | "VP8L" | "VP8X", animated = false) {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"));
  view.setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode(`WEBP${type}`), 8);
  view.setUint32(16, 10, true);
  if (type === "VP8X") {
    bytes[20] = animated ? 2 : 0;
    bytes[24] = 191;
    bytes[27] = 159;
  } else if (type === "VP8 ") {
    bytes.set([0x9d, 1, 0x2a], 23);
    view.setUint16(26, 192, true);
    view.setUint16(28, 160, true);
  } else {
    bytes[20] = 0x2f;
    bytes[21] = 191;
    bytes[22] = (159 & 3) << 6;
    bytes[23] = 159 >> 2;
  }
  return bytes;
}

describe("readComparisonImageDimensions before decoding", () => {
  it("reads PNG dimensions without allocating its decoded pixels", () => {
    expect(readComparisonImageDimensions(pngHeader(192, 160))).toEqual({ width: 192, height: 160 });
  });

  it("reads JPEG SOF dimensions after another marker", () => {
    const jpeg = new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 8, 8, 0, 160, 0, 192, 1]);
    expect(readComparisonImageDimensions(jpeg)).toEqual({ width: 192, height: 160 });
  });

  it.each(["VP8 ", "VP8L", "VP8X"] as const)("reads static WebP %s dimensions", (type) => {
    expect(readComparisonImageDimensions(webpHeader(type))).toEqual({ width: 192, height: 160 });
  });

  it.each([[16001, 100], [100, 16001], [10000, 5000]])("rejects a %s × %s header before bitmap decoding", (width, height) => {
    expect(() => readComparisonImageDimensions(pngHeader(width, height))).toThrow(/vượt giới hạn/);
  });

  it("rejects animated PNG and WebP", () => {
    expect(() => readComparisonImageDimensions(pngHeader(192, 160, true))).toThrow(/ảnh động/);
    expect(() => readComparisonImageDimensions(webpHeader("VP8X", true))).toThrow(/WebP động/);
  });

  it.each([
    new Uint8Array(),
    new Uint8Array([255, 216, 255, 192, 0, 8, 8]),
    pngHeader(192, 160).slice(0, 23),
    webpHeader("VP8X").slice(0, 29),
    pngHeader(0, 160),
    new TextEncoder().encode("This is a text file, not an image."),
  ])("rejects malformed or truncated headers", (bytes) => {
    expect(() => readComparisonImageDimensions(bytes)).toThrow(/Không đọc được kích thước/);
  });
});

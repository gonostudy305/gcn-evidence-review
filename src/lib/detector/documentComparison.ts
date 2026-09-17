/** Local reference comparison. Differences cannot identify which editing tool was used. */
export const COMPARISON_VERSION = "reference-pixel-diff/1.0.0";
export const MAX_COMPARISON_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 1600;
const TILE = 16;
const PIXEL_THRESHOLD = 28;

export interface PixelRaster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DifferenceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  changedPixels: number;
}

export interface PixelComparisonResult {
  status: "no-significant-difference" | "differences-found" | "inconclusive";
  width: number;
  height: number;
  regions: DifferenceRegion[];
  changedPixelRatio: number;
  alignment: { offsetX: number; offsetY: number; meanError: number };
  warnings: string[];
  methodVersion: string;
}

export interface DocumentComparisonResult extends PixelComparisonResult {
  referenceSha256: string;
  candidateSha256: string;
  overlayDataUrl: string;
  sourceDimensions: { reference: { width: number; height: number }; candidate: { width: number; height: number } };
  parameters: { pixelThreshold: number; tileSize: number; minimumChangedPixelsPerTile: number; maxAnalysisEdge: number };
}

function validateRaster(raster: PixelRaster) {
  if (!Number.isInteger(raster.width) || !Number.isInteger(raster.height) ||
      raster.width < 1 || raster.height < 1 || raster.width > MAX_EDGE || raster.height > MAX_EDGE ||
      raster.data.length !== raster.width * raster.height * 4) {
    throw new Error("Kích thước dữ liệu ảnh đối chiếu không hợp lệ.");
  }
}

function grayscale(raster: PixelRaster): Float32Array {
  const result = new Float32Array(raster.width * raster.height);
  for (let i = 0; i < result.length; i++) {
    const p = i * 4;
    const alpha = raster.data[p + 3] / 255;
    result[i] = (raster.data[p] * 0.299 + raster.data[p + 1] * 0.587 + raster.data[p + 2] * 0.114) * alpha + 255 * (1 - alpha);
  }
  return result;
}

/** Integer translation only; cropped, rotated and perspective photos require manual review. */
function align(reference: Float32Array, candidate: Float32Array, width: number, height: number) {
  const radius = Math.min(12, Math.floor(Math.min(width, height) / 12));
  const stride = Math.max(1, Math.floor(Math.sqrt(width * height / 6000)));
  const samples: number[] = [];
  for (let y = radius + 1; y < height - radius - 1; y += stride) {
    for (let x = radius + 1; x < width - radius - 1; x += stride) {
      const i = y * width + x;
      if (Math.abs(reference[i - 1] - reference[i + 1]) +
          Math.abs(reference[i - width] - reference[i + width]) > 25) samples.push(i);
    }
  }
  // Too few edges cannot support registration (e.g. a blank template).
  if (samples.length < 12) return { offsetX: 0, offsetY: 0, meanError: 0, reliable: false };
  let best = Infinity;
  let offsetX = 0;
  let offsetY = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      let error = 0;
      for (const i of samples) error += Math.min(80, Math.abs(reference[i] - candidate[i + dy * width + dx]));
      error /= samples.length;
      if (error < best || (error === best && Math.abs(dx) + Math.abs(dy) < Math.abs(offsetX) + Math.abs(offsetY))) {
        best = error;
        offsetX = dx;
        offsetY = dy;
      }
    }
  }
  return { offsetX, offsetY, meanError: best, reliable: best < 28 && Math.abs(offsetX) < radius && Math.abs(offsetY) < radius };
}

function collectRegions(counts: Uint32Array, columns: number, rows: number, width: number, height: number): DifferenceRegion[] {
  const visited = new Uint8Array(counts.length);
  const regions: DifferenceRegion[] = [];
  for (let start = 0; start < counts.length; start++) {
    if (visited[start] || counts[start] < 4) continue;
    const queue = [start];
    visited[start] = 1;
    let minX = columns, minY = rows, maxX = 0, maxY = 0, changedPixels = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const i = queue[cursor], x = i % columns, y = Math.floor(i / columns);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      changedPixels += counts[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * columns + nx;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows || visited[next] || counts[next] < 4) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    regions.push({ x: minX * TILE, y: minY * TILE,
      width: Math.min(width, (maxX + 1) * TILE) - minX * TILE,
      height: Math.min(height, (maxY + 1) * TILE) - minY * TILE, changedPixels });
  }
  return regions.sort((a, b) => b.changedPixels - a.changedPixels);
}

/** Inputs must use the same raster dimensions. Coordinates are in candidate raster space. */
export function compareDocumentPixels(reference: PixelRaster, candidate: PixelRaster): PixelComparisonResult {
  validateRaster(reference);
  validateRaster(candidate);
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error("Hai ảnh phải được chuẩn hóa cùng kích thước trước khi so sánh.");
  }
  const { width, height } = candidate;
  const a = grayscale(reference), b = grayscale(candidate);
  const registration = align(a, b, width, height);
  const { offsetX, offsetY, meanError } = registration;
  const columns = Math.ceil(width / TILE), rows = Math.ceil(height / TILE);
  const counts = new Uint32Array(columns * rows);
  let changed = 0, compared = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rx = x - offsetX, ry = y - offsetY;
    if (rx < 0 || ry < 0 || rx >= width || ry >= height) continue;
    compared++;
    // Compare RGB as well as luminance to preserve differently colored text edits.
    const ai = (ry * width + rx) * 4, bi = (y * width + x) * 4;
    let difference = 0;
    for (let c = 0; c < 3; c++) {
      const ac = reference.data[ai + c] * reference.data[ai + 3] / 255 + 255 - reference.data[ai + 3];
      const bc = candidate.data[bi + c] * candidate.data[bi + 3] / 255 + 255 - candidate.data[bi + 3];
      difference = Math.max(difference, Math.abs(ac - bc));
    }
    if (difference > PIXEL_THRESHOLD) {
      changed++;
      counts[Math.floor(y / TILE) * columns + Math.floor(x / TILE)]++;
    }
  }
  const regions = collectRegions(counts, columns, rows, width, height);
  const changedPixelRatio = changed / Math.max(1, compared);
  const occupiedRatio = counts.filter((count) => count >= 4).length / counts.length;
  const identical = a.every((value, i) => value === b[i]) && changed === 0;
  const warnings = [
    "Đối chiếu pixel không xác định thao tác sửa bằng AI hay bằng công cụ thủ công; chưa chạy OCR hoặc mô hình nhận diện AI.",
    "Dùng bản gốc đáng tin cậy của cùng giấy chứng nhận đã cấp, không dùng mẫu trắng hoặc giấy của người khác.",
    "Ngưỡng sai khác là heuristic chưa được benchmark trên GCN; nén, đổi màu hoặc nét chữ rất nhỏ có thể làm sai lệch kết quả.",
  ];
  const inconclusive = Math.min(width, height) < 64 || (!identical && !registration.reliable) || changedPixelRatio > 0.2 || occupiedRatio > 0.5;
  if (inconclusive) warnings.push("Ảnh không đủ tương đồng hoặc không đủ chi tiết để đối chiếu tin cậy. Cần ảnh thẳng, cùng khung và đủ độ phân giải; chưa hỗ trợ xoay, phối cảnh hoặc cắt khung.");
  if (offsetX || offsetY) warnings.push("Đã bù dịch chuyển nhỏ; dải biên ngoài phần giao nhau không được kiểm tra.");
  return { status: inconclusive ? "inconclusive" : regions.length ? "differences-found" : "no-significant-difference",
    width, height, regions, changedPixelRatio, alignment: { offsetX, offsetY, meanError }, warnings, methodVersion: COMPARISON_VERSION };
}

/** Read declared dimensions before decoding to bound compressed-image allocations. */
export function readComparisonImageDimensions(b: Uint8Array): { width: number; height: number } {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (offset: number, length: number) => String.fromCharCode(...b.subarray(offset, offset + length));
  let width = 0, height = 0;
  if (b.length >= 24 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") {
    width = view.getUint32(16); height = view.getUint32(20);
    for (let offset = 8; offset + 12 <= b.length;) {
      const size = view.getUint32(offset);
      if (ascii(offset + 4, 4) === "acTL") throw new Error("Chưa hỗ trợ ảnh động. Hãy xuất một khung ảnh tĩnh để đối chiếu.");
      if (size > b.length - offset - 12) break;
      offset += size + 12;
    }
  } else if (b[0] === 255 && b[1] === 216) {
    for (let offset = 2; offset + 1 < b.length;) {
      if (b[offset++] !== 255) break;
      while (b[offset] === 255) offset++;
      const marker = b[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > b.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > b.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += size;
    }
  } else if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const type = ascii(12, 4);
    if (type === "VP8X") {
      if (b[20] & 2) throw new Error("Chưa hỗ trợ WebP động. Hãy xuất một khung ảnh tĩnh để đối chiếu.");
      width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
      height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
    } else if (type === "VP8 " && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (type === "VP8L" && b[20] === 0x2f) {
      width = 1 + (b[21] | ((b[22] & 0x3f) << 8));
      height = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0xf) << 10));
    }
  }
  if (!width || !height) throw new Error("Không đọc được kích thước ảnh. File có thể hỏng hoặc không được hỗ trợ.");
  if (width * height > 40_000_000 || width > 16000 || height > 16000) {
    throw new Error("Ảnh vượt giới hạn 40 megapixel hoặc cạnh 16.000 pixel. Hãy dùng bản xuất nhỏ hơn.");
  }
  return { width, height };
}

export async function validateDocumentImage(file: File) {
  if (!file.size || file.size > MAX_COMPARISON_FILE_BYTES) throw new Error("Ảnh phải có dung lượng từ 1 byte đến 20 MB.");
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp = String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : null;
  if (!mime || (file.type && file.type !== mime)) throw new Error("Chỉ nhận ảnh JPEG, PNG hoặc WebP có nội dung file hợp lệ.");
  readComparisonImageDimensions(new Uint8Array(await file.arrayBuffer()));
}

function rasterize(bitmap: ImageBitmap, width: number, height: number): PixelRaster {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh Canvas.");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function sha256(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function compareDocumentFiles(reference: File, candidate: File): Promise<DocumentComparisonResult> {
  await validateDocumentImage(reference);
  await validateDocumentImage(candidate);
  if (typeof createImageBitmap !== "function") throw new Error("Trình duyệt chưa hỗ trợ đối chiếu ảnh. Hãy dùng phiên bản Chrome, Edge hoặc Firefox mới.");
  let a: ImageBitmap | undefined, b: ImageBitmap | undefined;
  try {
    a = await createImageBitmap(reference);
    b = await createImageBitmap(candidate);
    if ([a, b].some((bitmap) => bitmap.width * bitmap.height > 40_000_000 || bitmap.width > 16000 || bitmap.height > 16000)) {
      throw new Error("Ảnh vượt giới hạn 40 megapixel hoặc cạnh 16.000 pixel. Hãy dùng bản xuất nhỏ hơn.");
    }
    const scale = Math.min(1, MAX_EDGE / b.width, MAX_EDGE / b.height, a.width / b.width, a.height / b.height);
    const width = Math.max(1, Math.round(b.width * scale)), height = Math.max(1, Math.round(b.height * scale));
    const candidateRaster = rasterize(b, width, height);
    const result = compareDocumentPixels(rasterize(a, width, height), candidateRaster);
    if (Math.abs((a.width / a.height) / (b.width / b.height) - 1) > 0.02) {
      result.status = "inconclusive";
      result.warnings.push("Tỷ lệ khung hình khác nhau quá 2%; ảnh có thể đã cắt hoặc chụp lệch. Các vùng tô chỉ dùng tham khảo.");
    }
    if (scale < 1) result.warnings.push(`Phân tích ở ${width} × ${height} pixel; thay đổi chữ quá nhỏ có thể bị mất khi thu nhỏ.`);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không thể tạo ảnh đánh dấu vùng thay đổi.");
    context.putImageData(new ImageData(new Uint8ClampedArray(candidateRaster.data), width, height), 0, 0);
    context.strokeStyle = "#ef4444";
    context.fillStyle = "rgba(239, 68, 68, 0.18)";
    context.lineWidth = 2;
    for (const region of result.regions) {
      context.fillRect(region.x, region.y, region.width, region.height);
      context.strokeRect(region.x + 1, region.y + 1, Math.max(1, region.width - 2), Math.max(1, region.height - 2));
    }
    return { ...result, referenceSha256: await sha256(reference), candidateSha256: await sha256(candidate), overlayDataUrl: canvas.toDataURL("image/png"),
      sourceDimensions: { reference: { width: a.width, height: a.height }, candidate: { width: b.width, height: b.height } },
      parameters: { pixelThreshold: PIXEL_THRESHOLD, tileSize: TILE, minimumChangedPixelsPerTile: 4, maxAnalysisEdge: MAX_EDGE } };
  } catch (error) {
    if (error instanceof DOMException) throw new Error("Không thể giải mã hoặc xử lý ảnh này. Hãy kiểm tra file và dùng kết nối HTTPS/localhost.");
    throw error;
  } finally {
    a?.close();
    b?.close();
  }
}

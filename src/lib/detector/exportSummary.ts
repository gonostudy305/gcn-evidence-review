import type { DetectorBatchItem } from "@/store/detectorBatchStore";
import { NO_SIGNAL_CAVEAT, HAS_SIGNAL_CAVEAT, provenanceProviderLabel } from "./provenanceSignal";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function formatDateForFileName(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}${m}${d}_${h}${min}`;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Độ tin cậy cao",
  medium: "Độ tin cậy trung bình",
  low: "Độ tin cậy thấp",
  unknown: "Chưa xác định",
};

/**
 * Builds a clean, auditable Markdown report of the batch verification.
 * Follows this repository's evidence and language guardrails:
 * never concludes an image is human-made, never makes absolute claims.
 */
export function buildBatchSummaryText(
  items: DetectorBatchItem[],
  generatedAt: Date = new Date(),
): string {
  const total = items.length;
  const aiSignalCount = items.filter((i) => i.result?.hasAiSignal).length;
  const noSignalCount = items.filter((i) => i.status === "done" && !i.result?.hasAiSignal).length;
  const errorCount = items.filter((i) => i.status === "error").length;

  const lines: string[] = [
    "# BÁO CÁO RÀ SOÁT METADATA ẢNH MINH CHỨNG / GIẤY CHỨNG NHẬN",
    "",
    `- **Thời gian xuất báo cáo**: ${formatDate(generatedAt)}`,
    `- **Phạm vi kiểm tra**: C2PA và metadata của ảnh minh chứng / Giấy Chứng Nhận`,
    `- **Tổng số file thẩm định**: ${total}`,
    `- **Số file phát hiện tín hiệu AI**: ${aiSignalCount}`,
    `- **Số file không tìm thấy tín hiệu AI trong metadata**: ${noSignalCount}`,
    `- **Số file gặp lỗi xử lý**: ${errorCount}`,
    "",
    "---",
    "",
    "## CHI TIẾT TỪNG FILE",
    "",
  ];

  if (items.length === 0) {
    lines.push("_Không có file nào trong danh sách thẩm định._", "");
  }

  items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.fileName} (${formatBytes(item.fileSize)})`);

    if (item.status === "checking") {
      lines.push("- **Trạng thái**: Đang trong tiến trình kiểm tra...", "");
      return;
    }

    if (item.status === "error") {
      lines.push("- **Trạng thái**: Gặp lỗi khi đọc file ảnh");
      lines.push(`- **Chi tiết lỗi**: ${item.errorMessage || "Không xác định"}`);
      lines.push("");
      return;
    }

    if (!item.result) {
      lines.push("- **Trạng thái**: Chưa có kết quả phân tích", "");
      return;
    }

    const { result, raw } = item;
    const resultLabel = result.hasAiSignal
      ? "Phát hiện tín hiệu nguồn gốc AI qua metadata"
      : "Không tìm thấy tín hiệu nguồn gốc AI trong metadata";

    lines.push(`- **Kết quả sơ bộ**: ${resultLabel}`);
    lines.push(`- **Mức độ tin cậy tín hiệu**: ${CONFIDENCE_LABEL[result.confidence] || result.confidence}`);

    if (raw) {
      lines.push("- **Dữ liệu kỹ thuật số (Raw Manifest / Metadata)**:");
      lines.push(`  - Phần mềm / Model khai báo: ${provenanceProviderLabel(raw)}`);
      lines.push(`  - Phần mềm / Generator: ${raw.generator || "Không có"}`);
      lines.push(`  - Chuỗi model (chưa xác minh): ${raw.model || "Không có"}`);
      lines.push(`  - IPTC DigitalSourceType: ${raw.digitalSourceType || "Không có"}`);
      lines.push(`  - Dấu vết C2PA: ${raw.hasC2pa ? "Có (chưa xác minh chữ ký/hash)" : "Không phát hiện"}`);
      lines.push(
        `  - Hành động ghi nhận (Actions): ${raw.actions.length ? raw.actions.join(", ") : "Không có"}`,
      );
      lines.push(
        `  - Vùng dữ liệu chứa tín hiệu: ${raw.signals.length ? raw.signals.join(", ") : "Không có"}`,
      );
    }

    if (result.evidence.length > 0) {
      lines.push("- **Minh chứng chi tiết**:");
      result.evidence.forEach((ev) => {
        lines.push(`  - [${ev.source}] ${ev.label}`);
        if (ev.detail) lines.push(`    - Chi tiết: ${ev.detail}`);
      });
    }

    lines.push(`- **Khuyến cáo áp dụng**: ${result.caveat || (result.hasAiSignal ? HAS_SIGNAL_CAVEAT : NO_SIGNAL_CAVEAT)}`);
    lines.push("");
  });

  lines.push("---", "");
  lines.push("## QUY TẮC PHÁP LÝ & KHUYẾN CÁO SỬ DỤNG");
  lines.push("");
  lines.push(
    "1. **Kiểm tra trực tiếp trên thiết bị**: Toàn bộ quá trình kiểm tra metadata (C2PA/JUMBF, EXIF, XMP, IPTC) diễn ra ngay trên trình duyệt của người dùng — ảnh không được tải lên máy chủ nào trong quá trình này.",
  );
  lines.push(
    "2. **Tính chất tham khảo**: Kết quả này nhằm mục đích hỗ trợ Hội đồng / Ban Thường vụ / Liên chi hội trong công tác thẩm định hồ sơ minh chứng phong trào, **không thay thế quyết định của con người**.",
  );
  lines.push(
    "3. **Lưu ý về ảnh không có tín hiệu**: Việc một ảnh không tìm thấy tín hiệu AI trong metadata **KHÔNG CHỨNG MINH** ảnh đó do con người tạo ra, bởi vì metadata hoàn toàn có thể đã bị xóa sạch khi người nộp chụp lại màn hình, nén qua mạng xã hội (Facebook, Zalo), hoặc chỉnh sửa lại.",
  );
  lines.push("");

  return lines.join("\n");
}

export function downloadBatchSummaryMarkdown(items: DetectorBatchItem[]): void {
  if (typeof window === "undefined") return;

  const text = buildBatchSummaryText(items);
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `bao-cao-kiem-tra-gcn_${formatDateForFileName(new Date())}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

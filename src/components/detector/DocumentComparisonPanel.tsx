"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Files, Loader2 } from "lucide-react";
import {
  compareDocumentFiles,
  validateDocumentImage,
  type DocumentComparisonResult,
} from "@/lib/detector/documentComparison";

// Uploaded files stay in the browser; revoke each preview when its file changes.
function FilePreview({ file, label }: { file: File; label: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <figure className="min-w-0 space-y-1">
      <figcaption className="font-semibold text-[#003366]">{label}</figcaption>
      {/* Local blob previews cannot use the server image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} alt={`${label}: ${file.name}`} className="h-32 sm:h-36 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" />
      <p className="break-all text-slate-600">{file.name}</p>
    </figure>
  );
}

const statusLabels: Record<DocumentComparisonResult["status"], string> = {
  "differences-found": "Có vùng khác biệt cần đối chiếu",
  "no-significant-difference": "Chưa thấy khác biệt vượt ngưỡng",
  inconclusive: "Chưa đủ điều kiện kết luận đối chiếu",
};

export function DocumentComparisonPanel({ candidate }: { candidate: File }) {
  const inputId = useId();
  const runToken = useRef(0);
  const [reference, setReference] = useState<File | null>(null);
  const [result, setResult] = useState<DocumentComparisonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { runToken.current += 1; }, []);

  async function selectReference(file: File | undefined) {
    const token = ++runToken.current;
    setResult(null);
    setBusy(false);
    setError(null);
    setReference(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setError("Chọn ảnh gốc JPEG, PNG hoặc WebP, tối đa 20 MB.");
      return;
    }
    try {
      await validateDocumentImage(file);
      if (token === runToken.current) setReference(file);
    } catch (cause) {
      if (token === runToken.current) setError(cause instanceof Error ? cause.message : "Không đọc được ảnh gốc.");
    }
  }

  async function compare() {
    if (!reference || busy) return;
    const token = ++runToken.current;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const nextResult = await compareDocumentFiles(reference, candidate);
      if (token === runToken.current) setResult(nextResult);
    } catch (cause) {
      if (token === runToken.current) {
        setError(cause instanceof Error ? cause.message : "Không thể đối chiếu hai ảnh. Vui lòng chọn lại ảnh gốc.");
      }
    } finally {
      if (token === runToken.current) setBusy(false);
    }
  }

  function downloadReport() {
    if (!reference || !result) return;
    // Explicit allowlist: never include the overlay or uploaded image bytes.
    const report = {
      schemaVersion: 1,
      reportType: "gcn-reference-comparison",
      generatedAt: new Date().toISOString(),
      reference: { fileName: reference.name, sha256: result.referenceSha256 },
      candidate: { fileName: candidate.name, sha256: result.candidateSha256 },
      methodVersion: result.methodVersion,
      sourceDimensions: result.sourceDimensions,
      parameters: result.parameters,
      status: result.status,
      normalizedRaster: { width: result.width, height: result.height },
      regionCoordinateSystem: "normalized-candidate-raster-pixels",
      regions: result.regions,
      changedPixelRatio: result.changedPixelRatio,
      alignment: result.alignment,
      warnings: result.warnings,
      limitations: [
        "Tỷ lệ pixel khác biệt không phải xác suất AI.",
        "Khác biệt ảnh không chứng minh nội dung bị thay bằng AI hay chứng nhận là giả.",
        "Không thấy khác biệt vượt ngưỡng không chứng minh ảnh nguyên bản; thay đổi rất nhỏ có thể bị bỏ sót.",
        "Ảnh tham chiếu cần là bản gốc đáng tin cậy của cùng giấy chứng nhận đã cấp, không phải phôi mẫu.",
      ],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gono-gcn-comparison.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[#BCEBFA] bg-white p-3.5 text-xs leading-relaxed" aria-labelledby={`${inputId}-heading`}>
      <h3 id={`${inputId}-heading`} className="flex items-center gap-2 text-sm font-bold text-[#003366]">
        <Files className="h-4 w-4 shrink-0" aria-hidden="true" /> Đối chiếu với ảnh gốc
      </h3>
      <p className="text-slate-700">
        Chọn <strong>bản gốc đáng tin cậy của cùng giấy chứng nhận đã cấp</strong> để tìm vùng có thể đã đổi chữ. Không dùng phôi mẫu hoặc giấy của người khác.
      </p>
      <div className="space-y-1">
        <label htmlFor={inputId} className="block font-semibold text-[#003366]">Ảnh gốc để đối chiếu</label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={`${inputId}-help`}
          onChange={(event) => {
            void selectReference(event.target.files?.[0]);
            event.target.value = "";
          }}
          className="block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-sky-50 file:px-2 file:py-1 file:text-[#003366] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        />
        <p id={`${inputId}-help`} className="text-slate-600">JPEG, PNG, WebP · tối đa 20 MB. Đối chiếu chạy trên trình duyệt.</p>
      </div>
      {reference && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <FilePreview file={reference} label="Ảnh gốc tham chiếu" />
          <FilePreview file={candidate} label="Ảnh đang kiểm tra" />
        </div>
      )}
      <button type="button" onClick={() => void compare()} disabled={!reference || busy}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-3 py-2 font-semibold text-white hover:bg-[#004780] active:bg-[#00264d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
        {busy ? "Đang căn chỉnh và đối chiếu…" : "Đối chiếu hai ảnh"}
      </button>
      <div role="status" aria-live="polite" aria-atomic="true">
        {busy && <p className="text-slate-600">Đang xử lý hai ảnh trên thiết bị…</p>}
        {error && <p className="rounded-lg bg-red-50 p-2 text-red-800">{error}</p>}
        {result && <p className="font-semibold text-[#003366]">{statusLabels[result.status]}</p>}
      </div>
      {result && (
        <div className="space-y-3">
          <p className="text-slate-700">
            <strong>{(result.changedPixelRatio * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% pixel khác biệt</strong> trên ảnh chuẩn hóa · {result.regions.length} vùng được đánh dấu. Đây không phải xác suất AI.
          </p>
          {result.overlayDataUrl && (
            <figure className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.overlayDataUrl} alt={`Ảnh kiểm tra với ${result.regions.length} vùng khác biệt được đánh dấu`} width={result.width} height={result.height} className="h-auto w-full rounded-lg border border-slate-200" />
              <figcaption className="text-slate-600">Vùng đánh dấu là gợi ý xem xét thủ công, không xác nhận chữ đã bị AI thay.</figcaption>
            </figure>
          )}
          {result.status === "inconclusive" && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">Kiểm tra hai ảnh có cùng giấy chứng nhận, đủ khung và cùng góc chụp. Ảnh bị cắt, nghiêng hoặc khác bố cục cần căn chỉnh lại trước khi đối chiếu.</p>}
          {result.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-slate-700">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          <button type="button" onClick={downloadReport} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 font-semibold text-[#003366] hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
            <Download className="h-4 w-4" aria-hidden="true" /> Tải báo cáo đối chiếu (.json)
          </button>
          <p className="text-slate-600">Báo cáo chứa tên file, mã SHA-256 và vùng khác biệt; không chứa ảnh.</p>
        </div>
      )}
      <p className="rounded-lg bg-slate-50 p-2 text-slate-700">
        Đối chiếu pixel có ngưỡng lọc nhiễu; thay đổi rất nhỏ có thể bị bỏ sót. Nén, đổi kích thước hay góc chụp cũng có thể gây khác biệt. Kết quả không xác định AI hay người đã chỉnh sửa và không xác nhận tính hợp lệ của giấy chứng nhận.
      </p>
    </section>
  );
}

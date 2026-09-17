"use client";

import { useRef, useState, useEffect } from "react";
import { bytesFromBlob, detectAiProvenance } from "@/lib/aiProvenance";
import { buildDetectionResultFromProvenance, provenanceProviderLabel } from "@/lib/detector/provenanceSignal";
import { downloadBatchSummaryMarkdown } from "@/lib/detector/exportSummary";
import { validateDocumentImage } from "@/lib/detector/documentComparison";
import { useDetectorBatchStore, type DetectorBatchItem } from "@/store/detectorBatchStore";
import { DetectorDropzone } from "@/components/detector/DetectorDropzone";
import { DocumentComparisonPanel } from "@/components/detector/DocumentComparisonPanel";
import { DetectorResultRow } from "@/components/detector/DetectorResultRow";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  AlertCircle,
  FileText,
  Printer,
  PlusCircle,
  Trash2,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Upload,
  Loader2,
} from "lucide-react";

const MAX_BATCH_FILES = 20;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function KiemTraGcnPage() {
  const { items, addFiles, setItemResult, setItemError, removeItem, clearAll } =
    useDetectorBatchStore();

  const [notification, setNotification] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const intakeEpoch = useRef(0);

  useEffect(() => () => { intakeEpoch.current += 1; }, []);

  const clearFiles = () => {
    intakeEpoch.current += 1;
    clearAll();
    setSelectedId(null);
  };

  // Active item calculation
  const activeIndex = items.findIndex((i) => i.id === (selectedId || items[0]?.id));
  const activeItem = activeIndex !== -1 ? items[activeIndex] : items[0] || null;

  // Keyboard navigation for batch items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='slider']")) return;

      if ((e.key === "ArrowDown" || e.key === "ArrowRight") && activeIndex < items.length - 1) {
        setSelectedId(items[activeIndex + 1].id);
      } else if ((e.key === "ArrowUp" || e.key === "ArrowLeft") && activeIndex > 0) {
        setSelectedId(items[activeIndex - 1].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, items]);

  const checkItem = async (item: DetectorBatchItem) => {
    try {
      const bytes = await bytesFromBlob(item.file);
      const raw = detectAiProvenance(bytes);
      const result = buildDetectionResultFromProvenance(raw);
      setItemResult(item.id, result, raw);
    } catch (err) {
      console.error(`[BatchCheck] Error checking ${item.fileName}:`, err);
      setItemError(item.id, "Không thể trích xuất metadata từ file ảnh này.");
    }
  };

  const handleFilesAccepted = async (acceptedFiles: File[]) => {
    const epoch = intakeEpoch.current;
    setNotification(null);
    if (!acceptedFiles || acceptedFiles.length === 0) return;

    const availableSlots = MAX_BATCH_FILES - items.length;
    if (availableSlots <= 0) {
      setNotification(`Đã đạt giới hạn tối đa ${MAX_BATCH_FILES} ảnh trong danh sách.`);
      return;
    }

    let filesToProcess = acceptedFiles;
    if (acceptedFiles.length > availableSlots) {
      filesToProcess = acceptedFiles.slice(0, availableSlots);
      setNotification(
        `Chỉ nhận thêm ${availableSlots} ảnh đầu tiên (giới hạn ${MAX_BATCH_FILES} ảnh/lượt).`,
      );
    }

    const validatedFiles: File[] = [];
    for (const file of filesToProcess) {
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error("Ảnh cần kiểm tra vượt quá 10 MB.");
        await validateDocumentImage(file);
        validatedFiles.push(file);
      } catch (error) {
        if (epoch === intakeEpoch.current) setNotification(error instanceof Error ? error.message : "Không đọc được ảnh.");
      }
    }
    if (epoch !== intakeEpoch.current) return;
    // Re-read after validation so concurrent selections cannot overfill the batch.
    const remaining = Math.max(0, MAX_BATCH_FILES - useDetectorBatchStore.getState().items.length);
    if (validatedFiles.length > remaining) setNotification(`Giới hạn ${MAX_BATCH_FILES} ảnh/lượt; một số ảnh chưa được thêm.`);
    const newItems = addFiles(validatedFiles.slice(0, remaining));
    if (!selectedId && newItems[0]) {
      setSelectedId(newItems[0].id);
    }
    newItems.forEach((item) => {
      void checkItem(item);
    });
  };

  const handleExportMarkdown = () => {
    downloadBatchSummaryMarkdown(items);
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const aiSignalCount = items.filter((i) => i.result?.hasAiSignal).length;
  const noSignalCount = items.filter((i) => i.status === "done" && !i.result?.hasAiSignal).length;
  const errorCount = items.filter((i) => i.status === "error").length;

  const hasAi = activeItem?.result?.hasAiSignal;
  const isError = activeItem?.status === "error";
  const isChecking = activeItem?.status === "checking";

  // VIEW 1: WELCOME SCREEN (WHEN EMPTY)
  if (items.length === 0) {
    return (
      <div className="flex-1 w-full h-full overflow-y-auto">
        <div className="min-h-full px-4 py-8 sm:py-12 flex flex-col items-center justify-center max-w-3xl mx-auto space-y-6">
        {/* Page Title */}
        <div className="text-center space-y-2 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#003366] tracking-tight">
            Rà soát ảnh Giấy Chứng Nhận (GCN)
          </h1>
          <p className="text-[#64748B] text-sm leading-relaxed">
            Công cụ hỗ trợ hội đồng rà soát minh chứng: đọc dấu vết C2PA/metadata và so sánh ảnh
            với bản gốc đáng tin cậy. Kết quả chỉ hỗ trợ xem xét; công cụ chưa xác minh chữ ký C2PA
            và không kết luận ảnh do AI tạo hay có gian lận.
          </p>
        </div>

        {/* Privacy Scope Banner */}
        <div className="bg-[#E8F7FD] border border-[#BCEBFA] rounded-2xl p-4 text-xs sm:text-sm text-[#003B66] flex items-start gap-3 shadow-xs max-w-2xl w-full">
          <ShieldCheck className="w-5 h-5 text-[#00AEEF] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-[#0077B6] font-semibold">Kiểm tra trực tiếp trên thiết bị: </strong>
            Toàn bộ việc kiểm tra diễn ra ngay trên trình duyệt của bạn — ảnh không được tải lên bất kỳ
            máy chủ nào trong quá trình này.
          </div>
        </div>

        {/* Large Centered Dropzone */}
        {notification && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notification}</p>}
        <div className="w-full flex justify-center">
          <DetectorDropzone
            multiple={true}
            maxFiles={MAX_BATCH_FILES}
            onFilesAccepted={handleFilesAccepted}
            theme="light"
            compact={false}
          />
        </div>

        {/* Guidelines Box */}
        <div className="bg-white border border-[#E8EEF3] rounded-2xl p-5 space-y-2.5 text-xs text-[#64748B] max-w-2xl w-full shadow-2xs">
          <div className="flex items-center gap-2 text-[#003366] font-bold">
            <Info className="w-4 h-4 text-[#00AEEF]" />
            <span>Quy tắc thẩm định quan trọng dành cho cán bộ xét chọn:</span>
          </div>
          <p className="leading-relaxed">
            • <strong>Không chứng minh tuyệt đối:</strong> Việc thiếu metadata AI{" "}
            <strong className="text-[#B45309]">không chứng minh ảnh chắc chắn do người tạo</strong>, vì siêu dữ liệu dễ bị xóa khi chụp màn hình hoặc gửi qua Zalo, Messenger, Facebook.
          </p>
          <p className="leading-relaxed">
            • <strong>Đối chiếu thực tế:</strong> Khi phát hiện cờ AI hoặc có nghi vấn, cán bộ nên yêu cầu nộp file gốc xuất từ camera hoặc đối chiếu với văn bản quyết định ban hành thực tế.
          </p>
        </div>
      </div>
    </div>
    );
  }

  // VIEW 2: 3-COLUMN WORKSPACE (FULL-WIDTH, 100VH, ZERO PAGE SCROLL)
  return (
    <>
      {/* Hidden File Input */}
      <input
        ref={hiddenInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) {
            handleFilesAccepted(Array.from(e.target.files));
          }
          e.target.value = "";
        }}
      />

      {/* Notification banner if exists */}
      {notification && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="underline text-amber-700">
            Đóng
          </button>
        </div>
      )}

      {/* WORKSPACE 3 CỘT */}
      <div className="flex-1 w-full h-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#E8EEF3] print:hidden">
        {/* CỘT 1: DANH SÁCH HỒ SƠ (LEFT SIDEBAR - 280px / 300px) */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 max-h-72 lg:max-h-none lg:h-full flex flex-col bg-white overflow-hidden">
          {/* Sidebar Header */}
          <div className="p-3.5 border-b border-[#E8EEF3] flex items-center justify-between bg-[#F8FAFC]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#003366] uppercase tracking-wide">
                Hồ sơ thẩm định
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#E8F7FD] text-[#0077B6] border border-[#BCEBFA]">
                {items.length}/{MAX_BATCH_FILES}
              </span>
            </div>
            <button
              type="button"
              onClick={() => hiddenInputRef.current?.click()}
              disabled={items.length >= MAX_BATCH_FILES}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[#00AEEF] text-white hover:bg-[#0098D4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs"
              title="Thêm ảnh vào danh sách"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Thêm
            </button>
          </div>

          {/* Scrollable Items List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {items.map((item) => {
              const isSelected = item.id === activeItem?.id;
              const hasAiSignal = item.result?.hasAiSignal;
              const isItemError = item.status === "error";

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`group relative p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? "bg-[#E8F7FD]/60 border-[#00AEEF] ring-1 ring-[#00AEEF] shadow-xs"
                      : "bg-white border-[#E8EEF3] hover:border-[#BCEBFA] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {/* Thumbnail 3:4 */}
                  <div className="relative w-11 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-[#E8EEF3] flex items-center justify-center">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileText className="w-5 h-5 text-slate-400 stroke-1" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold truncate ${
                        isSelected ? "text-[#003366]" : "text-[#172033]"
                      }`}
                      title={item.fileName}
                    >
                      {item.fileName}
                    </p>
                    <p className="text-[11px] text-[#64748B]">{formatBytes(item.fileSize)}</p>

                    {/* Badge */}
                    <div className="mt-1 flex items-center gap-1">
                      {item.status === "checking" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#0077B6]">
                          <Loader2 className="w-3 h-3 animate-spin" /> Đang quét...
                        </span>
                      ) : isItemError ? (
                        <span className="text-[10px] text-red-600 font-semibold">Lỗi file</span>
                      ) : hasAiSignal ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FFF4E5] text-[#B45309] border border-[#FDE68A]">
                          <ShieldAlert className="w-3 h-3 text-[#D97706]" /> Có dấu hiệu AI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          <ShieldQuestion className="w-3 h-3 text-slate-600" /> Chưa thấy AI
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-opacity"
                    title="Xóa ảnh này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer: Dropzone strip & Clear All */}
          <div className="p-2.5 border-t border-[#E8EEF3] bg-[#F8FAFC] space-y-2">
            <div
              onClick={() => hiddenInputRef.current?.click()}
              className="border border-dashed border-[#BCEBFA] hover:border-[#00AEEF] hover:bg-white bg-[#E8F7FD]/30 rounded-xl p-2 text-center cursor-pointer transition-colors"
            >
              <p className="text-[11px] font-semibold text-[#0077B6] flex items-center justify-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Kéo thả thêm ảnh vào đây
              </p>
            </div>

            <button
              type="button"
              onClick={clearFiles}
              className="w-full text-center py-1 text-xs text-[#94A3B8] hover:text-red-600 transition-colors"
            >
              Xóa tất cả danh sách
            </button>
          </div>
        </div>

        {/* CỘT 2: CANVAS SOI ẢNH (CENTER WORKSPACE - FLEX-1) */}
        <div className="min-h-96 shrink-0 lg:min-h-0 lg:flex-1 lg:h-full flex flex-col justify-between bg-[#F8FAFC] overflow-hidden p-3 sm:p-5 relative">
          {activeItem ? (
            <>
              {/* Header bar of center canvas */}
              <div className="flex items-center justify-between pb-3 border-b border-[#E8EEF3]">
                <div className="min-w-0 flex-1 pr-4">
                  <h2
                    className="text-sm sm:text-base font-bold text-[#003366] truncate"
                    title={activeItem.fileName}
                  >
                    {activeItem.fileName}
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    {formatBytes(activeItem.fileSize)} · {activeItem.file.type || "image"}
                  </p>
                </div>

                {activeItem.previewUrl && (
                  <a
                    href={activeItem.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E8EEF3] text-xs font-semibold text-[#003366] hover:bg-[#F1F5F9] shadow-2xs transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#00AEEF]" /> Mở ảnh đang kiểm tra
                  </a>
                )}
              </div>

              {/* Large Image Canvas */}
              <div className="flex-1 flex items-center justify-center overflow-hidden my-3 rounded-2xl bg-white border border-[#E8EEF3] p-3 shadow-sm">
                {activeItem.previewUrl ? (
                  <img
                    src={activeItem.previewUrl}
                    alt={activeItem.fileName}
                    className="max-h-full max-w-full object-contain rounded-xl drop-shadow-md"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-[#94A3B8] p-8 text-center">
                    <FileText className="w-16 h-16 stroke-1 mb-2 text-[#CBD5E1]" />
                    <p className="text-sm font-medium">Không thể tạo ảnh xem trước</p>
                  </div>
                )}
              </div>

              {/* Bottom Floating Control Bar */}
              <div className="pt-2 flex items-center justify-between text-xs text-[#64748B]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => activeIndex > 0 && setSelectedId(items[activeIndex - 1].id)}
                    disabled={activeIndex <= 0}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#E8EEF3] text-[#003366] font-semibold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Trước
                  </button>
                  <span className="font-mono text-xs px-2 text-[#172033] font-bold">
                    {activeIndex + 1} / {items.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      activeIndex < items.length - 1 && setSelectedId(items[activeIndex + 1].id)
                    }
                    disabled={activeIndex >= items.length - 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#E8EEF3] text-[#003366] font-semibold hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs transition-colors"
                  >
                    Sau <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <span className="hidden sm:inline-block text-[11px] text-[#94A3B8]">
                  Phím tắt: dùng phím ↑ ↓ hoặc ← → để chuyển ảnh
                </span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              Chọn một ảnh để xem
            </div>
          )}
        </div>

        {/* CỘT 3: BẢNG KẾT LUẬN THẨM ĐỊNH (RIGHT SIDEBAR - 380px) */}
        <div className="w-full lg:w-96 xl:w-[400px] shrink-0 lg:h-full flex flex-col justify-between bg-white overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="space-y-4">
            {/* Top Compact KPI Badges */}
            <div className="grid grid-cols-4 gap-1.5 bg-[#F8FAFC] p-2 rounded-xl border border-[#E8EEF3] text-center">
              <div className="p-1">
                <span className="block text-[10px] text-[#64748B]">Tổng</span>
                <strong className="text-sm font-bold text-[#003366]">{items.length}</strong>
              </div>
              <div className="p-1 bg-[#FFF4E5] rounded-lg border border-[#FDE68A]">
                <span className="block text-[10px] text-[#B45309]">Dấu hiệu AI</span>
                <strong className="text-sm font-bold text-[#D97706]">{aiSignalCount}</strong>
              </div>
              <div className="p-1 bg-[#E8F7FD] rounded-lg border border-[#BCEBFA]">
                <span className="block text-[10px] text-[#0077B6]">Chưa thấy</span>
                <strong className="text-sm font-bold text-[#0077B6]">{noSignalCount}</strong>
              </div>
              <div className="p-1">
                <span className="block text-[10px] text-[#64748B]">Lỗi</span>
                <strong className="text-sm font-bold text-red-600">{errorCount}</strong>
              </div>
            </div>

            {/* Metadata evidence status: no uncalibrated probability or signature claim. */}
            <div className="space-y-2 rounded-2xl border border-[#E8EEF3] bg-[#F8FAFC] p-4" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-sm font-bold text-[#172033]">
                {isChecking ? <Loader2 className="h-5 w-5 text-[#0077B6] motion-safe:animate-spin" />
                  : isError ? <AlertCircle className="h-5 w-5 text-red-600" />
                  : hasAi ? <ShieldAlert className="h-5 w-5 text-amber-700" />
                  : <ShieldQuestion className="h-5 w-5 text-slate-600" />}
                <span>{isChecking ? "Đang quét metadata…" : isError ? "Lỗi đọc file" : hasAi ? "Có dấu hiệu AI trong metadata" : "Chưa thấy dấu hiệu AI trong metadata"}</span>
              </div>
              <p className="text-xs leading-relaxed text-[#64748B]">
                {isChecking ? "Chờ hoàn tất trước khi xem kết quả."
                  : isError ? activeItem?.errorMessage || "Không thể phân tích file này."
                  : hasAi ? "Metadata có thông tin liên quan đến công cụ AI; thông tin này chưa được xác minh bằng chữ ký số."
                  : "Thiếu metadata AI không chứng minh ảnh do người tạo hoặc chưa bị sửa chữ."}
              </p>
              <p className="text-xs leading-relaxed text-slate-600">Đây là kết quả đọc metadata, chưa phải xác suất ảnh do AI tạo.</p>
              {activeItem?.result?.evidence.map((evidence, index) => (
                <p key={index} className="text-xs leading-relaxed text-slate-700">{evidence.label}</p>
              ))}
            </div>

            {/* Bằng chứng kỹ thuật số */}
            <div className="rounded-2xl p-3.5 bg-white border border-[#E8EEF3] shadow-2xs space-y-2.5 text-xs">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#003366] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#00AEEF]" />
                Dấu vết metadata (C2PA/XMP)
              </h4>

              <div className="space-y-1.5 divide-y divide-[#F1F5F9]">
                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Nguồn / Phần mềm:</span>
                  <span className="font-semibold text-[#172033] font-mono text-right max-w-[200px] truncate">
                    {activeItem?.raw ? provenanceProviderLabel(activeItem.raw) : "Không xác định"}
                  </span>
                </div>

                {activeItem?.raw?.model && (
                  <div className="flex justify-between py-1">
                    <span className="text-[#64748B]">Chuỗi model:</span>
                    <span className="font-semibold text-[#172033] font-mono">
                      {activeItem.raw.model}
                    </span>
                  </div>
                )}

                <div className="flex justify-between py-1">
                  <span className="text-[#64748B]">Dấu vết C2PA:</span>
                  <span
                    className={`font-semibold ${
                      activeItem?.raw?.hasC2pa ? "text-[#0077B6]" : "text-[#94A3B8]"
                    }`}
                  >
                    {isChecking ? "Đang đọc…" : isError ? "Không đọc được" : activeItem?.raw?.hasC2pa ? "Có · chưa xác minh" : "Chưa thấy"}
                  </span>
                </div>

                {activeItem?.raw?.digitalSourceType && (
                  <div className="flex justify-between py-1">
                    <span className="text-[#64748B]">IPTC Source:</span>
                    <span className="font-mono text-[#172033]">
                      {activeItem.raw.digitalSourceType}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {activeItem && <DocumentComparisonPanel key={activeItem.id} candidate={activeItem.file} />}

            {/* Quy tắc đối chiếu cán bộ */}
            <div className="rounded-2xl p-3 bg-[#F0F9FF] border border-[#BAE6FD] text-[11px] text-[#0369A1] space-y-1">
              <div className="flex items-center gap-1 font-bold text-[#003366]">
                <Info className="w-3.5 h-3.5 text-[#00AEEF] shrink-0" />
                <span>Quy tắc đối chiếu:</span>
              </div>
              <p className="leading-relaxed text-[#334155]">
                {hasAi
                  ? "Phát hiện dấu hiệu AI: Cán bộ nên yêu cầu người nộp giải trình và cung cấp quyết định ban hành văn bản thực tế từ Ban Tổ chức."
                  : "Thiếu metadata AI không chứng minh ảnh do người tạo (do nén qua Zalo/Facebook). Cần đối chiếu số hiệu thực tế."}
              </p>
            </div>
          </div>

          {/* Bottom Action Buttons (Print & Export) */}
          <div className="pt-3 border-t border-[#E8EEF3] space-y-2">
            <button
              type="button"
              onClick={handlePrint}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold rounded-xl bg-[#00AEEF] text-white hover:bg-[#0098D4] shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" /> In biên bản / Lưu PDF
            </button>

            <button
              type="button"
              onClick={handleExportMarkdown}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold rounded-xl bg-white text-[#003366] hover:bg-[#F8FAFC] border border-[#E8EEF3] shadow-2xs transition-colors"
            >
              <FileText className="w-4 h-4 text-[#00AEEF]" /> Xuất báo cáo (.md)
            </button>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY VIEW: Beautiful table format for official document output */}
      <div className="hidden print:block p-8 space-y-6 bg-white text-black">
        <div className="border-b pb-4">
          <h1 className="text-xl font-bold">BIÊN BẢN RÀ SOÁT MINH CHỨNG GCN</h1>
          <p className="text-xs text-slate-600 mt-1">
            Phạm vi: kiểm tra C2PA và metadata của ảnh minh chứng
          </p>
          <p className="text-xs text-slate-600">
            Tổng số: {items.length} file | Có dấu hiệu AI: {aiSignalCount} file | Chưa thấy dấu hiệu AI:{" "}
            {noSignalCount} file
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Biên bản này chỉ ghi nhận quét metadata, chưa xác minh chữ ký C2PA. Đối chiếu ảnh gốc
            có báo cáo JSON riêng; kết quả đối chiếu không nằm trong biên bản này.
          </p>
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="border-b pb-4 break-inside-avoid">
              <DetectorResultRow item={item} theme="light" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

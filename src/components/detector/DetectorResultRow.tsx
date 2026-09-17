"use client";

import { useState } from "react";
import type { DetectorBatchItem } from "@/store/detectorBatchStore";
import { DetectionResultCard } from "@/components/detector/DetectionResultCard";
import { DetectorRawEvidence } from "@/components/detector/DetectorRawEvidence";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  Eye,
  FileText,
} from "lucide-react";

interface DetectorResultRowProps {
  item: DetectorBatchItem;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onInspect?: (id: string) => void;
  theme?: "dark" | "light";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DetectorResultRow({
  item,
  onRetry,
  onRemove,
  onInspect,
  theme = "dark",
}: DetectorResultRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLight = theme === "light";

  const renderStatusBadge = () => {
    if (item.status === "checking") {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isLight
              ? "bg-[#E8F7FD] text-[#0077B6] border border-[#BCEBFA]"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          }`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra...
        </span>
      );
    }

    if (item.status === "error") {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            isLight
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" /> Lỗi đọc file
        </span>
      );
    }

    if (item.result?.hasAiSignal) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isLight
                ? "bg-[#FFF4E5] text-[#B45309] border border-[#FDE68A]"
                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
            }`}
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${isLight ? "text-[#D97706]" : "text-amber-400"}`} />{" "}
            Phát hiện tín hiệu AI
          </span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded ${
              isLight
                ? "bg-white text-[#92400E] border border-[#FDE68A]"
                : "bg-slate-800 text-slate-300 border border-slate-700"
            }`}
          >
            {item.result.confidence === "high"
              ? "Tin cậy cao"
              : item.result.confidence === "medium"
                ? "Tin cậy trung bình"
                : "Tin cậy thấp"}
          </span>
        </div>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          isLight
            ? "bg-[#F7FAFC] text-[#475569] border border-[#E8EEF3]"
            : "bg-slate-800/80 text-slate-300 border border-slate-700"
        }`}
      >
        <ShieldQuestion className={`w-3.5 h-3.5 ${isLight ? "text-[#94A3B8]" : "text-slate-400"}`} />{" "}
        Không thấy tín hiệu AI
      </span>
    );
  };

  return (
    <div
      className={`w-full rounded-2xl p-4 transition-all print:bg-white print:border-slate-300 print:text-black print:break-inside-avoid ${
        isLight
          ? "bg-white border border-[#E8EEF3] hover:border-[#BCEBFA] shadow-[0_4px_20px_rgba(0,74,116,0.04)]"
          : "bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 shadow-sm"
      }`}
    >
      {/* Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Thumbnail & File Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Visual Thumbnail (Aspect 3:4) */}
          <div
            onClick={() => onInspect?.(item.id)}
            className={`relative w-12 h-16 sm:w-14 sm:h-18 rounded-xl overflow-hidden shrink-0 border cursor-pointer group shadow-sm transition-all print:border-slate-300 ${
              isLight
                ? "bg-[#F1F5F9] border-[#E8EEF3] hover:border-[#00AEEF] hover:shadow-md"
                : "bg-slate-800 border-slate-700 hover:border-blue-400"
            }`}
            title="Bấm để xem phóng to và đối chiếu hồ sơ"
          >
            {item.previewUrl ? (
              <img
                src={item.previewUrl}
                alt={item.fileName}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <FileText className="w-5 h-5 stroke-1" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity print:hidden">
              <Eye className="w-4 h-4 text-white drop-shadow" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                onClick={() => onInspect?.(item.id)}
                className={`text-sm font-semibold truncate cursor-pointer hover:underline print:text-black ${
                  isLight ? "text-[#172033] hover:text-[#0077B6]" : "text-white hover:text-blue-300"
                }`}
                title={`Bấm để soi ảnh: ${item.fileName}`}
              >
                {item.fileName}
              </h3>
              <span
                className={`text-xs shrink-0 print:text-slate-600 ${
                  isLight ? "text-[#64748B]" : "text-slate-400"
                }`}
              >
                ({formatBytes(item.fileSize)})
              </span>
            </div>
            {item.errorMessage && (
              <p className="text-xs text-red-500 mt-1">{item.errorMessage}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {renderStatusBadge()}

          {/* Action Buttons (Hidden on print) */}
          <div className="flex items-center gap-1.5 print:hidden ml-2">
            {item.status === "done" && onInspect && (
              <button
                type="button"
                onClick={() => onInspect(item.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  isLight
                    ? "bg-[#E8F7FD] text-[#0077B6] hover:bg-[#D0F0FB] border border-[#BCEBFA]"
                    : "bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30"
                }`}
                title="Mở màn hình soi ảnh đối chiếu 2 cột"
              >
                <Eye className="w-3.5 h-3.5" /> Soi ảnh
              </button>
            )}

            {item.status === "done" && (
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                  isLight
                    ? "bg-[#F7FAFC] text-[#003366] hover:bg-[#E8EEF3] border border-[#E8EEF3]"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
                title={isExpanded ? "Thu gọn chi tiết" : "Xem chi tiết manifest"}
              >
                {isExpanded ? (
                  <>
                    Thu gọn <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Chi tiết <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}

            {item.status === "error" && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  isLight
                    ? "bg-[#F7FAFC] text-[#0077B6] hover:bg-[#E8EEF3] border border-[#E8EEF3]"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
                title="Thử lại"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Thử lại
              </button>
            )}

            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isLight
                    ? "text-[#94A3B8] hover:text-red-500 hover:bg-red-50"
                    : "text-slate-400 hover:text-red-400 hover:bg-slate-800"
                }`}
                title="Xóa khỏi danh sách"
                aria-label="Xóa"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details & Print Full View */}
      {item.status === "done" && item.result && (
        <div
          className={`${
            isExpanded ? "block" : "hidden"
          } print:block mt-4 pt-4 border-t space-y-3 ${
            isLight ? "border-[#E8EEF3]" : "border-slate-800/80"
          } print:border-slate-300`}
        >
          <DetectionResultCard result={item.result} fileName={item.fileName} theme={theme} />
          <DetectorRawEvidence raw={item.raw} theme={theme} />
        </div>
      )}
    </div>
  );
}

"use client";

import { ShieldAlert, ShieldQuestion } from "lucide-react";
import type { DetectionResult } from "@/lib/detector/types";

const CONFIDENCE_LABEL: Record<DetectionResult["confidence"], string> = {
  high: "Độ tin cậy cao",
  medium: "Độ tin cậy trung bình",
  low: "Độ tin cậy thấp",
  unknown: "Chưa xác định",
};

const SOURCE_LABEL: Record<DetectionResult["evidence"][number]["source"], string> = {
  "metadata-provenance": "Metadata",
  "visual-pixel": "Visual",
};

interface DetectionResultCardProps {
  result: DetectionResult;
  fileName: string;
  theme?: "dark" | "light";
}

export function DetectionResultCard({
  result,
  fileName,
  theme = "dark",
}: DetectionResultCardProps) {
  const Icon = result.hasAiSignal ? ShieldAlert : ShieldQuestion;
  const isLight = theme === "light";

  return (
    <div
      className={`w-full max-w-2xl rounded-xl p-5 transition-all ${
        isLight
          ? "bg-[#F7FAFC] border border-[#E8EEF3] text-[#172033]"
          : "bg-slate-900/50 border border-slate-800 text-white"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <Icon
          className={`w-6 h-6 shrink-0 ${
            result.hasAiSignal
              ? isLight
                ? "text-amber-500"
                : "text-yellow-400"
              : isLight
                ? "text-[#64748B]"
                : "text-slate-500"
          }`}
        />
        <div className="min-w-0">
          <h3 className={`font-semibold ${isLight ? "text-[#172033]" : "text-white"}`}>
            {result.hasAiSignal
              ? "Phát hiện tín hiệu nguồn gốc AI"
              : "Không tìm thấy tín hiệu nguồn gốc AI"}
          </h3>
          <p className={`text-xs truncate ${isLight ? "text-[#64748B]" : "text-slate-500"}`}>
            {fileName}
          </p>
        </div>
      </div>

      {result.hasAiSignal && (
        <span
          className={`inline-block text-xs px-2.5 py-1 rounded-md font-medium mb-3 ${
            isLight
              ? "bg-amber-50 text-amber-800 border border-amber-200"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          {CONFIDENCE_LABEL[result.confidence]}
        </span>
      )}

      {result.evidence.length > 0 && (
        <ul className="space-y-2 mb-3">
          {result.evidence.map((e, i) => (
            <li key={i} className={`text-sm ${isLight ? "text-[#172033]" : "text-slate-300"}`}>
              <span
                className={`text-xs uppercase tracking-wide mr-2 ${
                  isLight ? "text-[#0077B6] font-semibold" : "text-slate-500"
                }`}
              >
                {SOURCE_LABEL[e.source]}
              </span>
              {e.label}
              {e.detail && (
                <div
                  className={`text-xs mt-0.5 ${
                    isLight ? "text-[#64748B] font-mono" : "text-slate-500"
                  }`}
                >
                  {e.detail}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p
        className={`text-xs border-t pt-3 ${
          isLight ? "border-[#E8EEF3] text-[#64748B]" : "border-slate-800 text-slate-500"
        }`}
      >
        {result.caveat}
      </p>
      <p className={`text-xs mt-2 ${isLight ? "text-[#94A3B8]" : "text-slate-600"}`}>
        Kết quả này hỗ trợ đánh giá, không thay thế quyết định của con người.
      </p>
    </div>
  );
}

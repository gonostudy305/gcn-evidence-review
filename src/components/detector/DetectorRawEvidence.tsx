"use client";

import type { AiProvenanceResult } from "@/lib/aiProvenance";
import { provenanceProviderLabel } from "@/lib/detector/provenanceSignal";
import { CheckCircle2, XCircle, Code, ShieldCheck } from "lucide-react";

interface DetectorRawEvidenceProps {
  raw: AiProvenanceResult | null;
  theme?: "dark" | "light";
}

export function DetectorRawEvidence({ raw, theme = "dark" }: DetectorRawEvidenceProps) {
  const isLight = theme === "light";

  if (!raw) {
    return (
      <div
        className={`rounded-lg p-3 text-xs ${
          isLight
            ? "bg-[#F7FAFC] border border-[#E8EEF3] text-[#64748B]"
            : "bg-slate-900/40 border border-slate-800 text-slate-400"
        }`}
      >
        Không có dữ liệu metadata bổ sung.
      </div>
    );
  }

  const items: Array<{ label: string; value: React.ReactNode; isCode?: boolean }> = [
    {
      label: "Dấu vết C2PA / Content Credentials",
      value: raw.hasC2pa ? (
        <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Có container; chưa xác minh chữ ký/hash
        </span>
      ) : (
        <span className={`inline-flex items-center gap-1.5 ${isLight ? "text-[#64748B]" : "text-slate-400"}`}>
          <XCircle className="w-3.5 h-3.5" /> Không phát hiện dấu vết C2PA
        </span>
      ),
    },
    {
      label: "Phần mềm / Model khai báo",
      value: provenanceProviderLabel(raw),
    },
    {
      label: "Phần mềm tạo (Claim Generator)",
      value: raw.generator || "Không ghi nhận",
      isCode: !!raw.generator,
    },
    {
      label: "Chuỗi model (chưa xác minh)",
      value: raw.model || "Không ghi nhận",
      isCode: !!raw.model,
    },
    {
      label: "IPTC digitalSourceType",
      value: raw.digitalSourceType || "Không ghi nhận",
      isCode: !!raw.digitalSourceType,
    },
    {
      label: "C2PA Actions ghi nhận",
      value: raw.actions.length > 0 ? raw.actions.join(", ") : "Không có",
      isCode: raw.actions.length > 0,
    },
    {
      label: "Vùng metadata phát hiện",
      value: raw.signals.length > 0 ? raw.signals.join(", ") : "Không có",
      isCode: raw.signals.length > 0,
    },
  ];

  return (
    <div
      className={`w-full rounded-xl p-3 sm:p-4 text-xs transition-all print:bg-white print:border-slate-300 print:text-black ${
        isLight
          ? "bg-[#F7FAFC] border border-[#E8EEF3] text-[#172033]"
          : "bg-slate-950/70 border border-slate-800/80 text-white"
      }`}
    >
      <div
        className={`flex items-center gap-2 mb-3 pb-2 border-b print:border-slate-300 ${
          isLight ? "border-[#E8EEF3]" : "border-slate-800"
        }`}
      >
        <Code className={`w-4 h-4 ${isLight ? "text-[#00AEEF]" : "text-indigo-400"} print:text-slate-700`} />
        <h4 className={`font-semibold print:text-black ${isLight ? "text-[#003366]" : "text-slate-200"}`}>
          Bằng chứng kỹ thuật chi tiết (Raw Provenance Manifest)
        </h4>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div
            key={idx}
            className={`flex flex-col sm:flex-row sm:items-baseline justify-between py-1 border-b last:border-b-0 print:border-slate-100 ${
              isLight ? "border-[#E8EEF3]/60" : "border-slate-900/60"
            }`}
          >
            <span
              className={`font-medium sm:w-5/12 print:text-slate-600 ${
                isLight ? "text-[#64748B]" : "text-slate-400"
              }`}
            >
              {it.label}:
            </span>
            <span
              className={`sm:w-7/12 text-right sm:text-left mt-0.5 sm:mt-0 ${
                it.isCode
                  ? isLight
                    ? "font-mono text-[11px] text-[#0077B6] bg-white px-1.5 py-0.5 rounded border border-[#E8EEF3] break-all print:bg-slate-100 print:border-slate-300 print:text-black"
                    : "font-mono text-[11px] text-slate-300 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 break-all print:bg-slate-100 print:border-slate-300 print:text-black"
                  : isLight
                    ? "text-[#172033] font-medium print:text-black"
                    : "text-slate-200 print:text-black"
              }`}
            >
              {it.value}
            </span>
          </div>
        ))}
      </div>

      <div
        className={`mt-3 pt-2 border-t text-[11px] flex items-center gap-1.5 print:text-slate-600 ${
          isLight ? "border-[#E8EEF3] text-[#64748B]" : "border-slate-800/70 text-slate-500"
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>
          Được trích xuất trực tiếp từ các khối byte metadata của file (C2PA/JUMBF, EXIF, XMP, IPTC).
        </span>
      </div>
    </div>
  );
}

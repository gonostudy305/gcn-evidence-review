import { detectAiProvenance, bytesFromBlob, type AiProvenanceResult } from "@/lib/aiProvenance";
import type { DetectionResult, SignalEvidence } from "./types";

/**
 * Wraps the existing metadata/provenance scanner (src/lib/aiProvenance.ts) as
 * ONE auxiliary detector signal — never the verdict on its own.
 *
 * Provenance context is supplementary
 * evidence, not a visual detector, and a missing signal is not proof an image
 * is human-made (metadata is dropped by screenshots, re-compression, and most
 * social apps). The copy below intentionally avoids every phrase banned in
 * repository's claim guardrails ("100% chính xác", "chắc chắn
 * AI", "không thể bị đánh lừa", "chống giả mạo") — this is a metadata string
 * match, not a cryptographic signature/timestamp verification.
 */

export const NO_SIGNAL_CAVEAT =
  "Không tìm thấy tín hiệu nguồn gốc AI trong metadata của ảnh này. Điều này KHÔNG chứng minh " +
  "ảnh do người tạo — metadata có thể đã bị xoá khi chụp màn hình, nén qua mạng xã hội, hoặc " +
  "chỉnh sửa lại.";

export const HAS_SIGNAL_CAVEAT =
  "Tín hiệu này đến từ metadata/provenance của file (C2PA/JUMBF, IPTC digitalSourceType, " +
  "EXIF/XMP generator) — một tín hiệu tham khảo dựa trên so khớp chuỗi, không phải xác thực " +
  "chữ ký số hay bằng chứng tuyệt đối. Metadata có thể bị thiếu, chỉnh sửa hoặc không đáng tin " +
  "trong một số trường hợp.";

/** Do not display the legacy parser's synthetic 'AI' fallback for camera metadata. */
export function provenanceProviderLabel(raw: AiProvenanceResult): string {
  if (raw.provider === "Canva" && !/magic media/i.test(raw.generator ?? "")) return "Canva (chưa xác định công cụ AI)";
  return raw.generator || raw.model || "Không xác định";
}

export function toEvidence(result: AiProvenanceResult): SignalEvidence {
  const detailParts = [
    result.model ? `Model: ${result.model}` : null,
    result.digitalSourceType ? `digitalSourceType: ${result.digitalSourceType}` : null,
    result.actions.length ? `Actions: ${result.actions.join(", ")}` : null,
    result.signals.length ? `Nguồn: ${result.signals.join(", ")}` : null,
  ].filter(Boolean);

  return {
    source: "metadata-provenance",
    label: `Phát hiện tín hiệu nguồn gốc AI qua metadata: ${result.providerLabel}`,
    detail: detailParts.length ? detailParts.join(" · ") : undefined,
  };
}

export function buildDetectionResultFromProvenance(raw: AiProvenanceResult): DetectionResult {
  // The legacy scanner deliberately casts a wide net for metadata cleanup.
  // Its isAiGenerated flag is NOT an AI verdict: camera C2PA, c2pa.created,
  // digitalCapture, generic composites and Canva also trigger that flag.
  // Only explicit trained-AI disclosures or specific generator markers count here.
  const sourceType = raw.digitalSourceType?.split("/").pop()?.toLowerCase();
  const generated = sourceType === "trainedalgorithmicmedia";
  const edited = sourceType === "compositewithtrainedalgorithmicmedia";
  // Provider detection in the cleanup parser also scans photographer credits
  // and generic words (Aurora, flux). Use explicit generator/model markers here.
  const specificGenerator = /openai|gpt-image|dall[\s._·-]?e|\bimagen\b|\bgemini\b|midjourney|firefly|stability ?ai|stable[\s-]?diffusion|\bsdxl\b|black forest labs|flux\.1|\bgrok\b|microsoft designer|bing image creator|magic media|leonardo\.?ai|ideogram|recraft/i
    .test([raw.generator, raw.model].filter(Boolean).join(" "));
  const hasAiSignal = generated || edited || specificGenerator;
  const provenance: NonNullable<DetectionResult["provenance"]> = {
    c2pa: raw.hasC2pa ? "present-unverified" : "not-found",
    signatureVerified: false,
    aiDisclosure: edited ? "edited" : generated ? "generated" : specificGenerator ? "unspecified" : "none",
  };
  if (!hasAiSignal) {
    return {
      hasAiSignal: false,
      confidence: "unknown",
      evidence: raw.hasC2pa ? [{ source: "metadata-provenance", label: "Có dấu vết C2PA; chưa xác minh chữ ký, hash nội dung hoặc bên ký. C2PA cũng có thể đi kèm ảnh chụp thật." }] : [],
      caveat: NO_SIGNAL_CAVEAT,
      signalsChecked: ["metadata-provenance"],
      provenance,
    };
  }

  return {
    hasAiSignal: true,
    // Confidence in an unverified metadata signal, never probability of AI use.
    confidence: generated || edited ? "medium" : "low",
    evidence: [{ ...toEvidence(raw), label: edited
      ? "Metadata khai báo ảnh có thành phần được AI tạo/chỉnh sửa (chưa xác minh)."
      : generated ? "Metadata khai báo ảnh được tạo bằng AI (chưa xác minh)."
      : `Có chuỗi nhận diện công cụ AI trong metadata: ${raw.providerLabel} (chưa xác minh).` }],
    caveat: HAS_SIGNAL_CAVEAT,
    signalsChecked: ["metadata-provenance"],
    provenance,
  };
}

export async function getProvenanceSignal(file: File | Blob): Promise<DetectionResult> {
  const bytes = await bytesFromBlob(file);
  const result = detectAiProvenance(bytes);
  return buildDetectionResultFromProvenance(result);
}

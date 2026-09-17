import { describe, it, expect } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import type { AiProvenanceResult } from "../src/lib/aiProvenance";
import { buildDetectionResultFromProvenance, getProvenanceSignal, provenanceProviderLabel } from "../src/lib/detector/provenanceSignal";

// Covers the metadata provenance acceptance criterion:
// "Có test cho ... metadata provenance có/không có". Reuses the same
// minimal-PNG-builder pattern as tests/aiProvenance.spec.ts, kept local here
// to avoid coupling the detector's tests to the metadata module's test file.

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function buildPng(chunks: Array<{ type: string; data: Uint8Array }>): Uint8Array {
  const parts: number[] = [...PNG_SIG];
  const pushChunk = (type: string, data: Uint8Array) => {
    const len = data.length;
    parts.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
    for (const ch of type) parts.push(ch.charCodeAt(0));
    parts.push(...data);
    parts.push(0, 0, 0, 0); // dummy CRC (parser does not validate it)
  };
  pushChunk("IHDR", new Uint8Array(13));
  for (const c of chunks) pushChunk(c.type, c.data);
  pushChunk("IEND", new Uint8Array(0));
  return new Uint8Array(parts);
}

function caBX(text: string): { type: string; data: Uint8Array } {
  return { type: "caBX", data: new TextEncoder().encode(text) };
}

function toBlob(bytes: Uint8Array): Blob {
  // jsdom's own Blob (vitest's `environment: 'jsdom'`) doesn't implement
  // .arrayBuffer(), which getProvenanceSignal -> bytesFromBlob relies on.
  // node:buffer's Blob does, and is structurally compatible with the DOM
  // Blob type consumed by getProvenanceSignal.
  return new NodeBlob([bytes], { type: "image/png" }) as unknown as Blob;
}

function legacyResult(overrides: Partial<AiProvenanceResult> = {}): AiProvenanceResult {
  return {
    isAiGenerated: true, // Legacy cleanup scanner intentionally flags broader markers.
    provider: null,
    providerLabel: "Không xác định",
    generator: null,
    model: null,
    digitalSourceType: null,
    actions: [],
    hasC2pa: true,
    signals: ["C2PA/caBX"],
    confidence: "high",
    ...overrides,
  };
}

describe("detector interpretation of unverified provenance", () => {
  it.each([
    ["generic C2PA", {}],
    ["created action", { actions: ["c2pa.created"] }],
    ["edited action", { actions: ["c2pa.edited"] }],
    ["camera capture", { digitalSourceType: "digitalCapture" }],
    ["generic composite", { digitalSourceType: "composite" }],
    ["generic Canva export", { provider: "Canva", generator: "Canva", providerLabel: "Canva" }],
    ["provider inferred from a credit", { provider: "OpenAI", providerLabel: "OpenAI" }],
    ["Aurora photographer credit", { provider: "xAI", providerLabel: "xAI / Grok", generator: "Aurora Photography" }],
    ["generic Flux software", { generator: "Flux Studio" }],
  ] satisfies Array<[string, Partial<AiProvenanceResult>]>)
  ("does not treat %s as AI disclosure", (_name, overrides) => {
    const result = buildDetectionResultFromProvenance(legacyResult(overrides));
    expect(result.hasAiSignal).toBe(false);
    expect(result.confidence).toBe("unknown");
    expect(result.provenance).toEqual({ c2pa: "present-unverified", signatureVerified: false, aiDisclosure: "none" });
    expect(result.evidence[0].label).toContain("chưa xác minh");
  });

  it.each([
    ["trainedAlgorithmicMedia", "generated"],
    ["http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia", "generated"],
    ["compositeWithTrainedAlgorithmicMedia", "edited"],
    ["http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia", "edited"],
  ])("distinguishes explicit %s disclosure", (digitalSourceType, disclosure) => {
    const result = buildDetectionResultFromProvenance(legacyResult({ digitalSourceType }));
    expect(result.hasAiSignal).toBe(true);
    expect(result.confidence).toBe("medium");
    expect(result.provenance?.aiDisclosure).toBe(disclosure);
    expect(result.provenance?.signatureVerified).toBe(false);
    expect(result.evidence[0].label).toContain("chưa xác minh");
    if (disclosure === "edited") expect(result.evidence[0].label).toContain("thành phần");
  });

  it("recognizes a specific Canva AI feature without labeling all Canva work AI", () => {
    const result = buildDetectionResultFromProvenance(legacyResult({ provider: "Canva", generator: "Canva Magic Media", hasC2pa: false }));
    expect(result.hasAiSignal).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.provenance?.aiDisclosure).toBe("unspecified");
    expect(result.provenance?.c2pa).toBe("not-found");
  });

  it.each([
    { generator: "OpenAI Media Service API" },
    { model: "gpt-image-1" },
    { model: "FLUX.1" },
  ])("recognizes explicit generator or model markers: %j", (overrides) => {
    const result = buildDetectionResultFromProvenance(legacyResult(overrides));
    expect(result.hasAiSignal).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.provenance?.aiDisclosure).toBe("unspecified");
  });

  it("does not display legacy AI provider fallback for a camera capture", () => {
    const raw = legacyResult({ digitalSourceType: "digitalCapture", providerLabel: "AI" });
    expect(buildDetectionResultFromProvenance(raw).hasAiSignal).toBe(false);
    expect(provenanceProviderLabel(raw)).toBe("Không xác định");
    expect(provenanceProviderLabel({ ...raw, generator: "Leica M11" })).toBe("Leica M11");
  });
});

describe("getProvenanceSignal", () => {
  it("reports hasAiSignal:false with the no-signal caveat when metadata carries no marker", async () => {
    const png = buildPng([]);
    const result = await getProvenanceSignal(toBlob(png));

    expect(result.hasAiSignal).toBe(false);
    expect(result.confidence).toBe("unknown");
    expect(result.evidence).toHaveLength(0);
    expect(result.signalsChecked).toEqual(["metadata-provenance"]);
    // Must never imply the image is human-made just because no signal was found.
    expect(result.caveat).toMatch(/KHÔNG chứng minh/);
  });

  it("reports an explicit AI disclosure with medium confidence because metadata is unverified", async () => {
    const png = buildPng([
      caBX(
        "jumdc2pa OpenAI Media Service API gpt-image version 2.0 " +
          "digitalsourcetype/trainedAlgorithmicMedia c2pa.created c2pa.watermarked.unbound",
      ),
    ]);
    const result = await getProvenanceSignal(toBlob(png));

    expect(result.hasAiSignal).toBe(true);
    expect(result.confidence).toBe("medium");
    expect(result.signalsChecked).toEqual(["metadata-provenance"]);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].source).toBe("metadata-provenance");
    expect(result.evidence[0].label).toMatch(/ảnh được tạo bằng AI.*chưa xác minh/);
    expect(result.provenance).toEqual({ c2pa: "present-unverified", signatureVerified: false, aiDisclosure: "generated" });
    expect(result.evidence[0].detail).toMatch(/digitalSourceType: trainedAlgorithmicMedia/);

    // Guardrail regression check: avoid unsupported absolute claims.
    // the wrapper must never introduce one of the banned absolute-claim
    // phrases verbatim, even though the underlying scanner reports "high"
    // confidence. Note: negated hedging like "không phải ... tuyệt đối" (i.e.
    // explicitly saying it is NOT absolute proof) is correct guardrail
    // language, not a violation — so this only matches the banned phrases
    // themselves, not the bare word "tuyệt đối".
    const allCopy = result.caveat + result.evidence.map((e) => e.label).join(" ");
    expect(allCopy).not.toMatch(
      /100% chính xác|chắc chắn AI|chắc chắn ảnh thật|không thể bị đánh lừa|100% không upload/i,
    );
  });
});

import { describe, it, expect } from "vitest";
import type { AiProvenanceResult } from "../src/lib/aiProvenance";
import {
  buildDetectionResultFromProvenance,
  NO_SIGNAL_CAVEAT,
  HAS_SIGNAL_CAVEAT,
} from "../src/lib/detector/provenanceSignal";
import { buildBatchSummaryText } from "../src/lib/detector/exportSummary";
import type { DetectorBatchItem } from "../src/store/detectorBatchStore";

describe("buildDetectionResultFromProvenance", () => {
  it("creates negative result when no AI provenance is detected", () => {
    const raw: AiProvenanceResult = {
      isAiGenerated: false,
      provider: null,
      providerLabel: "Không xác định",
      generator: null,
      model: null,
      digitalSourceType: null,
      actions: [],
      hasC2pa: false,
      signals: [],
      confidence: "low",
    };

    const result = buildDetectionResultFromProvenance(raw);
    expect(result.hasAiSignal).toBe(false);
    expect(result.confidence).toBe("unknown");
    expect(result.evidence).toHaveLength(0);
    expect(result.caveat).toBe(NO_SIGNAL_CAVEAT);
    expect(result.caveat).toMatch(/KHÔNG chứng minh/);
  });

  it("creates positive result when AI provenance marker is detected", () => {
    const raw: AiProvenanceResult = {
      isAiGenerated: true,
      provider: "OpenAI",
      providerLabel: "OpenAI (ChatGPT / DALL·E / gpt-image)",
      generator: "OpenAI Media Service API",
      model: "gpt-image 2.0",
      digitalSourceType: "trainedAlgorithmicMedia",
      actions: ["c2pa.created", "c2pa.watermarked.unbound"],
      hasC2pa: true,
      signals: ["C2PA/caBX", "XMP:CreatorTool"],
      confidence: "high",
    };

    const result = buildDetectionResultFromProvenance(raw);
    expect(result.hasAiSignal).toBe(true);
    expect(result.confidence).toBe("medium");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].source).toBe("metadata-provenance");
    expect(result.evidence[0].label).toContain("ảnh được tạo bằng AI (chưa xác minh)");
    expect(result.evidence[0].detail).toContain("gpt-image 2.0");
    expect(result.evidence[0].detail).toContain("trainedAlgorithmicMedia");
    expect(result.caveat).toBe(HAS_SIGNAL_CAVEAT);
  });
});
describe("buildBatchSummaryText", () => {
  it("does not repeat a legacy AI provider fallback for a camera-origin report", () => {
    const raw: AiProvenanceResult = {
      isAiGenerated: true,
      provider: null,
      providerLabel: "AI",
      generator: null,
      model: null,
      digitalSourceType: "digitalCapture",
      actions: ["c2pa.created"],
      hasC2pa: true,
      signals: ["C2PA/caBX"],
      confidence: "high",
    };
    const report = buildBatchSummaryText([{
      id: "camera",
      file: {} as File,
      fileName: "camera.jpg",
      fileSize: 100,
      status: "done",
      result: buildDetectionResultFromProvenance(raw),
      raw,
      errorMessage: null,
      checkedAt: Date.now(),
    }]);
    expect(report).toContain("Phần mềm / Model khai báo: Không xác định");
    expect(report).toContain("Dấu vết C2PA: Có (chưa xác minh chữ ký/hash)");
    expect(report).not.toContain("Phần mềm / Model khai báo: AI");
    expect(report).toContain("Số file phát hiện tín hiệu AI**: 0");
  });

  it("generates structured markdown report with all items and stats", () => {
    const mockFile = {} as File;
    const items: DetectorBatchItem[] = [
      {
        id: "item-1",
        file: mockFile,
        fileName: "gcn-hoat-dong-tinh-nguyen.png",
        fileSize: 1024 * 500,
        status: "done",
        result: {
          hasAiSignal: true,
          confidence: "high",
          evidence: [
            {
              source: "metadata-provenance",
              label: "Phát hiện tín hiệu nguồn gốc AI qua metadata: OpenAI",
              detail: "Model: gpt-image · digitalSourceType: trainedAlgorithmicMedia",
            },
          ],
          caveat: HAS_SIGNAL_CAVEAT,
          signalsChecked: ["metadata-provenance"],
        },
        raw: {
          isAiGenerated: true,
          provider: "OpenAI",
          providerLabel: "OpenAI (ChatGPT / DALL·E / gpt-image)",
          generator: "OpenAI Media Service API",
          model: "gpt-image",
          digitalSourceType: "trainedAlgorithmicMedia",
          actions: ["c2pa.created"],
          hasC2pa: true,
          signals: ["C2PA/caBX"],
          confidence: "high",
        },
        errorMessage: null,
        checkedAt: Date.now(),
      },
      {
        id: "item-2",
        file: mockFile,
        fileName: "chung-chi-anh-van.jpg",
        fileSize: 1024 * 1024 * 2,
        status: "done",
        result: {
          hasAiSignal: false,
          confidence: "unknown",
          evidence: [],
          caveat: NO_SIGNAL_CAVEAT,
          signalsChecked: ["metadata-provenance"],
        },
        raw: {
          isAiGenerated: false,
          provider: null,
          providerLabel: "Không xác định",
          generator: null,
          model: null,
          digitalSourceType: null,
          actions: [],
          hasC2pa: false,
          signals: [],
          confidence: "low",
        },
        errorMessage: null,
        checkedAt: Date.now(),
      },
      {
        id: "item-3",
        file: mockFile,
        fileName: "corrupt.png",
        fileSize: 100,
        status: "error",
        result: null,
        raw: null,
        errorMessage: "File hỏng hoặc không đúng định dạng",
        checkedAt: Date.now(),
      },
    ];

    const report = buildBatchSummaryText(items, new Date("2026-09-14T10:00:00Z"));

    expect(report).toContain("BÁO CÁO RÀ SOÁT METADATA");
    expect(report).toContain("Tổng số file thẩm định**: 3");
    expect(report).toContain("Số file phát hiện tín hiệu AI**: 1");
    expect(report).toContain("Số file không tìm thấy tín hiệu AI trong metadata**: 1");
    expect(report).toContain("Số file gặp lỗi xử lý**: 1");

    expect(report).toContain("gcn-hoat-dong-tinh-nguyen.png");
    expect(report).toContain("Dấu vết C2PA: Có (chưa xác minh chữ ký/hash)");
    expect(report).toContain("OpenAI Media Service API");

    expect(report).toContain("chung-chi-anh-van.jpg");
    expect(report).toContain("Không tìm thấy tín hiệu nguồn gốc AI trong metadata");

    expect(report).toContain("corrupt.png");
    expect(report).toContain("File hỏng hoặc không đúng định dạng");

    // Must never contain banned absolute claims or absolute privacy claim phrasing
    expect(report).not.toMatch(
      /100% chính xác|chắc chắn AI|chắc chắn ảnh thật|không thể bị đánh lừa|100% không upload|bảo mật tuyệt đối|dữ liệu tuyệt đối/i,
    );
  });
});

describe("useDetectorBatchStore with previewUrl", () => {
  it("generates and revokes previewUrl on add, remove, and clearAll", async () => {
    const { useDetectorBatchStore } = await import("../src/store/detectorBatchStore");

    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];

    const originalCreate = globalThis.URL.createObjectURL;
    const originalRevoke = globalThis.URL.revokeObjectURL;

    globalThis.URL.createObjectURL = () => {
      const url = `blob:http://localhost/${Math.random().toString(36).slice(2)}`;
      createdUrls.push(url);
      return url;
    };
    globalThis.URL.revokeObjectURL = (url: string) => {
      revokedUrls.push(url);
    };

    try {
      useDetectorBatchStore.getState().clearAll();

      const fakeFile1 = new File(["test1"], "gcn1.png", { type: "image/png" });
      const fakeFile2 = new File(["test2"], "gcn2.png", { type: "image/png" });

      const [item1, item2] = useDetectorBatchStore.getState().addFiles([fakeFile1, fakeFile2]);

      expect(item1.previewUrl).toBeDefined();
      expect(item1.previewUrl).toMatch(/^blob:/);
      expect(item2.previewUrl).toBeDefined();
      expect(useDetectorBatchStore.getState().items).toHaveLength(2);

      // Test removeItem revokes URL
      useDetectorBatchStore.getState().removeItem(item1.id);
      expect(useDetectorBatchStore.getState().items).toHaveLength(1);
      expect(revokedUrls).toContain(item1.previewUrl);

      // Test clearAll revokes remaining URLs
      useDetectorBatchStore.getState().clearAll();
      expect(useDetectorBatchStore.getState().items).toHaveLength(0);
      expect(revokedUrls).toContain(item2.previewUrl);
    } finally {
      globalThis.URL.createObjectURL = originalCreate;
      globalThis.URL.revokeObjectURL = originalRevoke;
    }
  });
});

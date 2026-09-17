// In-memory Zustand store for the standalone GCN evidence review app.
// Uploaded files and previews are not persisted to localStorage or a server.

import { create } from "zustand";
import type { DetectionResult } from "@/lib/detector/types";
import type { AiProvenanceResult } from "@/lib/aiProvenance";

export type BatchItemStatus = "checking" | "done" | "error";

export interface DetectorBatchItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  previewUrl?: string;
  status: BatchItemStatus;
  result: DetectionResult | null;
  raw: AiProvenanceResult | null;
  errorMessage: string | null;
  checkedAt: number | null;
}

interface DetectorBatchState {
  items: DetectorBatchItem[];
  addFiles: (files: File[]) => DetectorBatchItem[];
  setItemResult: (id: string, result: DetectionResult, raw: AiProvenanceResult) => void;
  setItemError: (id: string, errorMessage: string) => void;
  retryItem: (id: string) => DetectorBatchItem | null;
  removeItem: (id: string) => void;
  clearAll: () => void;
}

export const useDetectorBatchStore = create<DetectorBatchState>((set) => ({
  items: [],

  addFiles: (files: File[]) => {
    const newItems: DetectorBatchItem[] = files.map((file) => {
      let previewUrl: string | undefined = undefined;
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          previewUrl = undefined;
        }
      }

      return {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        fileName: file.name,
        fileSize: file.size,
        previewUrl,
        status: "checking",
        result: null,
        raw: null,
        errorMessage: null,
        checkedAt: null,
      };
    });

    set((state) => ({
      items: [...state.items, ...newItems],
    }));

    return newItems;
  },

  setItemResult: (id, result, raw) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "done",
              result,
              raw,
              errorMessage: null,
              checkedAt: Date.now(),
            }
          : item,
      ),
    }));
  },

  setItemError: (id, errorMessage) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "error",
              errorMessage,
              checkedAt: Date.now(),
            }
          : item,
      ),
    }));
  },

  retryItem: (id) => {
    let targetItem: DetectorBatchItem | null = null;
    set((state) => {
      const items = state.items.map((item) => {
        if (item.id === id) {
          targetItem = {
            ...item,
            status: "checking" as const,
            result: null,
            raw: null,
            errorMessage: null,
            checkedAt: null,
          };
          return targetItem;
        }
        return item;
      });
      return { items };
    });
    return targetItem;
  },

  removeItem: (id) => {
    set((state) => {
      const item = state.items.find((i) => i.id === id);
      if (item?.previewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // ignore revocation errors in testing
        }
      }
      return {
        items: state.items.filter((i) => i.id !== id),
      };
    });
  },

  clearAll: () => {
    set((state) => {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        state.items.forEach((item) => {
          if (item.previewUrl) {
            try {
              URL.revokeObjectURL(item.previewUrl);
            } catch {
              // ignore
            }
          }
        });
      }
      return { items: [] };
    });
  },
}));

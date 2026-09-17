"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

// Intentionally NOT imported from src/hooks/useImageUpload.ts: that hook is
// wired into useImageStore (SEO/metadata state) and cloud sync, which the
// This component stays independent from unrelated image metadata features.
// This is a small, self-contained duplicate of the magic-byte check.
const VALID_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE_MB = 10;

async function isValidImageFile(file: File): Promise<boolean> {
  if (!VALID_MIME_TYPES.includes(file.type)) return false;
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return false;

  const header = await file.slice(0, 12).arrayBuffer();
  const b = new Uint8Array(header);
  const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isWebp =
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return isJpeg || isPng || isWebp;
}

interface DetectorDropzoneProps {
  onFileAccepted?: (file: File) => void;
  onFilesAccepted?: (files: File[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  theme?: "dark" | "light";
  compact?: boolean;
}

export function DetectorDropzone({
  onFileAccepted,
  onFilesAccepted,
  multiple = false,
  maxFiles,
  disabled,
  theme = "dark",
  compact = false,
}: DetectorDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(
    async (fileList: FileList | File[] | null | undefined) => {
      setError(null);
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);
      const validFiles: File[] = [];
      let hasInvalid = false;

      for (const file of files) {
        const valid = await isValidImageFile(file);
        if (valid) {
          validFiles.push(file);
        } else {
          hasInvalid = true;
        }
      }

      if (hasInvalid) {
        setError("Một số file không hợp lệ hoặc vượt quá 10MB. Chỉ hỗ trợ JPG, PNG, WebP.");
      }

      if (validFiles.length > 0) {
        if (multiple) {
          onFilesAccepted?.(validFiles);
        } else {
          onFileAccepted?.(validFiles[0]);
        }
      }
    },
    [multiple, onFileAccepted, onFilesAccepted],
  );

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        void processFiles(e.dataTransfer.files);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label={multiple ? "Kiểm tra nhiều ảnh" : "Kiểm tra ảnh"}
      className={`w-full ${
        compact ? "h-20 sm:h-22 px-4 py-2" : "max-w-2xl h-72"
      } border-2 border-dashed rounded-2xl flex ${
        compact
          ? "flex-row items-center justify-center gap-3 text-left"
          : "flex-col items-center justify-center text-center"
      } transition-all ${
        theme === "light"
          ? disabled
            ? "opacity-50 cursor-not-allowed border-[#E8EEF3] bg-[#F7FAFC]"
            : `cursor-pointer border-[#BCEBFA] bg-white hover:border-[#00AEEF] hover:bg-[#E8F7FD]/30 shadow-[0_4px_20px_rgba(0,74,116,0.04)] ${
                dragOver ? "border-[#00AEEF] bg-[#E8F7FD]/50" : ""
              }`
          : disabled
            ? "opacity-50 cursor-not-allowed border-slate-800 bg-slate-900/50"
            : `cursor-pointer border-slate-700 hover:border-yellow-500/50 hover:bg-slate-900 bg-slate-900/50 ${
                dragOver ? "border-yellow-500/50 bg-slate-900" : ""
              }`
      }`}
    >
      {compact ? (
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              theme === "light" ? "bg-[#E8F7FD] text-[#00AEEF]" : "bg-slate-800 text-slate-400"
            }`}
          >
            <Upload className="w-5 h-5 text-[#00AEEF]" />
          </div>
          <div>
            <p
              className={`text-sm font-semibold ${
                theme === "light" ? "text-[#172033]" : "text-white"
              }`}
            >
              Kéo thả thêm ảnh vào đây hoặc{" "}
              <span className="text-[#00AEEF] underline">click chọn file</span>
            </p>
            <p className={`text-xs ${theme === "light" ? "text-[#64748B]" : "text-slate-400"}`}>
              Hỗ trợ JPG, PNG, WebP · tối đa 10MB/ảnh
              {maxFiles ? ` (tối đa ${maxFiles} ảnh)` : ""}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              theme === "light" ? "bg-[#E8F7FD] text-[#00AEEF]" : "bg-slate-800 text-slate-400"
            }`}
          >
            <Upload className={`w-8 h-8 ${theme === "light" ? "text-[#00AEEF]" : "text-slate-400"}`} />
          </div>
          <h2
            className={`text-lg font-semibold mb-1 ${
              theme === "light" ? "text-[#172033]" : "text-white"
            }`}
          >
            {multiple
              ? "Kéo thả một hoặc nhiều ảnh vào đây để kiểm tra"
              : "Kéo thả ảnh vào đây để kiểm tra"}
          </h2>
          <p className={`text-sm ${theme === "light" ? "text-[#64748B]" : "text-slate-400"}`}>
            {multiple
              ? `hoặc click để chọn các file ảnh${maxFiles ? ` (tối đa ${maxFiles} ảnh)` : ""}`
              : "hoặc click để chọn 1 ảnh"}
          </p>
          <p className={`text-xs mt-3 ${theme === "light" ? "text-[#94A3B8]" : "text-slate-500"}`}>
            JPG, PNG, WebP · tối đa 10MB mỗi ảnh
          </p>
        </>
      )}
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiple}
        hidden
        onChange={(e) => {
          void processFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

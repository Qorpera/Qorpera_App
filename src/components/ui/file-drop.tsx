"use client";

import { useState, useCallback, type DragEvent } from "react";

interface FileDropProps {
  onFile: (content: string, fileName: string) => void;
  accept?: string;
  label?: string;
}

export function FileDrop({ onFile, accept = ".csv,.json", label }: FileDropProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onFile(reader.result, file.name);
        }
      };
      reader.readAsText(file);
    },
    [onFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onFile(reader.result, file.name);
        }
      };
      reader.readAsText(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition ${
        dragging
          ? "border-purple-500/50 bg-purple-500/5"
          : "border-white/10 hover:border-white/20 bg-white/[0.02]"
      }`}
    >
      <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p className="text-sm text-white/50">
        {label || "Drop a CSV or JSON file here, or click to browse"}
      </p>
      <input
        type="file"
        accept={accept}
        onChange={handleFileInput}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </div>
  );
}

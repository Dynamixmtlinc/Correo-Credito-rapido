"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText, Loader2 } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";

interface FileUploadProps {
  onFile: (file: File) => void;
  accept?: string;
  maxSizeMb?: number;
  label?: string;
  className?: string;
}

export function FileUpload({
  onFile,
  accept = "application/pdf,image/*",
  maxSizeMb = 50,
  label = "Glissez-déposez un fichier ou cliquez pour sélectionner",
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`Fichier trop volumineux (max ${maxSizeMb} Mo)`);
      return;
    }
    onFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className={className}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors",
          dragging
            ? "border-csdm-blue bg-blue-50"
            : "border-gray-300 hover:border-csdm-blue hover:bg-gray-50"
        )}
      >
        <Upload className="w-8 h-8 text-gray-400" />
        <p className="text-sm text-gray-600 text-center">{label}</p>
        <p className="text-xs text-gray-400">Max {maxSizeMb} Mo</p>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface FileItemProps {
  file: { nombre: string; tamano: number; contentType?: string };
  onRemove?: () => void;
  loading?: boolean;
}

export function FileItem({ file, onRemove, loading }: FileItemProps) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2">
      {loading ? (
        <Loader2 className="w-4 h-4 text-csdm-blue animate-spin flex-shrink-0" />
      ) : (
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate font-medium">{file.nombre}</p>
        <p className="text-xs text-gray-400">{formatFileSize(file.tamano)}</p>
      </div>
      {onRemove && !loading && (
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      )}
    </div>
  );
}

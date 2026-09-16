"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FolderOpen, Upload, FileText, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { listMaterials, uploadMaterial, type Material } from "@/services/api";

function inferType(filename: string): Material["type"] | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  return null;
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(() => {
    listMaterials()
      .then(setMaterials)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load materials."));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doUpload = async (file: File) => {
    const type = inferType(file.name);
    if (!type) {
      setUploadError(`Unsupported file type: ${file.name}. Use PDF, DOCX, or PPTX.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await uploadMaterial({ title: file.name, type, file });
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const submitYoutube = async () => {
    if (!youtubeUrl.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadMaterial({ title: youtubeUrl, type: "youtube", externalUrl: youtubeUrl.trim() });
      setYoutubeUrl("");
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Transcript ingestion failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="border-b border-border pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-foreground flex items-center gap-2.5">
            <FolderOpen className="w-6 h-6 text-[#7C6EFA]" /> Teacher Materials & Knowledge Base
          </h1>
          <p className="text-sm text-muted mt-1">
            Upload PDFs, DOCX, PPTX, and YouTube URLs. Ground generated content in teacher-owned materials.
          </p>
        </div>
      </div>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) doUpload(file);
        }}
        className={`p-8 rounded-2xl border-2 border-dashed ${dragOver ? "border-[#7C6EFA] bg-[#7C6EFA]/5" : "border-border bg-card"} flex flex-col items-center justify-center text-center space-y-3 transition-colors`}
      >
        <div className="p-3 rounded-full bg-[#7C6EFA]/10 text-[#7C6EFA]">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
        </div>
        <div className="text-sm font-semibold text-foreground">
          {uploading ? "Processing material..." : "Drag and drop a PDF, DOCX, or PPTX here"}
        </div>
        <label className="text-xs text-[#4FC3F7] cursor-pointer hover:underline">
          or click to browse
          <input
            type="file"
            accept=".pdf,.docx,.pptx"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) doUpload(file);
              e.target.value = "";
            }}
          />
        </label>

        <div className="flex items-center gap-2 pt-2 w-full max-w-md">
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Or paste a YouTube URL for transcript ingestion"
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-foreground placeholder-[#55555F] focus:outline-none focus:border-[#7C6EFA]"
          />
          <button
            type="button"
            onClick={submitYoutube}
            disabled={uploading || !youtubeUrl.trim()}
            className="px-3 py-2 bg-[#7C6EFA] hover:bg-[#684af3] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {uploadError && <div className="text-xs text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {uploadError}</div>}
      </div>

      {/* Material List (Spec §18) */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-foreground font-display">Indexed Materials</div>

        {loadError && <div className="text-xs text-red-400">{loadError}</div>}
        {!loadError && materials === null && <div className="text-xs text-muted">Loading materials…</div>}
        {!loadError && materials?.length === 0 && (
          <div className="text-xs text-muted">No materials uploaded yet. Upload one above to ground AI-generated content.</div>
        )}

        <div className="space-y-2">
          {materials?.map((mat) => (
            <div
              key={mat.id}
              className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[#4FC3F7] shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">{mat.title}</div>
                  <div className="text-muted text-[11px] mt-0.5">
                    {mat.type.toUpperCase()}
                    {(mat.metadata?.chunk_count ?? mat.chunk_count) !== undefined
                      ? ` · ${mat.metadata?.chunk_count ?? mat.chunk_count} source chunks`
                      : ""}
                  </div>
                  {mat.metadata?.summary && (
                    <div className="text-muted/80 text-[11px] mt-1 leading-relaxed line-clamp-2">
                      {mat.metadata.summary}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {mat.processing_status === "READY" && (
                  <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
                    <CheckCircle2 className="w-3 h-3" /> READY
                  </span>
                )}
                {mat.processing_status === "PROCESSING" && (
                  <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
                    <Clock className="w-3 h-3 animate-spin" /> PROCESSING
                  </span>
                )}
                {mat.processing_status === "FAILED" && (
                  <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
                    <XCircle className="w-3 h-3" /> FAILED
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

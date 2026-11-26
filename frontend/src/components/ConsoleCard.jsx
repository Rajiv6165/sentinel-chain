import { useState, useRef } from 'react';

export default function ConsoleCard({ apiConfig, onFileSelected, onTrySample, onClearError }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sizeError, setSizeError] = useState(null);
  const [showZipHelp, setShowZipHelp] = useState(false);
  const fileInputRef = useRef(null);

  const maxUploadMb = apiConfig?.max_upload_mb ?? 15;
  const maxBytes = maxUploadMb * 1024 * 1024;
  const isSandboxEnabled = Boolean(apiConfig?.sandbox_enabled);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const processSelectedFile = (file) => {
    setSelectedFile(file);
    if (onClearError) onClearError();

    // Client-side file size check
    if (file.size > maxBytes) {
      const selectedMb = (file.size / (1024 * 1024)).toFixed(1);
      const err = `${selectedMb} MB selected, limit is ${maxUploadMb} MB`;
      setSizeError(err);
      if (onFileSelected) {
        onFileSelected(file);
      }
      return;
    }

    setSizeError(null);
    if (onFileSelected) {
      onFileSelected(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setSizeError(null);
    setShowZipHelp(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onClearError) onClearError();
  };

  const isOverSize = Boolean(selectedFile && selectedFile.size > maxBytes);

  const handleButtonClick = (e) => {
    e.stopPropagation();
    if (!selectedFile) {
      fileInputRef.current?.click();
    } else {
      if (isOverSize) return; // Do NOT send request if file is too big!
      if (onFileSelected) {
        onFileSelected(selectedFile);
      }
    }
  };

  return (
    <div
      className="anim-console coord-console rounded-[calc(22*var(--u))] p-0 box-border z-20 pointer-events-auto tablet-full-width compact-full-width"
      style={{
        backgroundColor: 'rgba(14, 22, 38, 0.78)',
        backdropFilter: 'blur(calc(18 * var(--u))) saturate(115%)',
        WebkitBackdropFilter: 'blur(calc(18 * var(--u))) saturate(115%)',
        border: '1px solid rgba(148, 170, 210, 0.16)',
        boxShadow: '0 calc(24 * var(--u)) calc(60 * var(--u)) rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept=".json,.txt,.zip"
        className="hidden"
        id="hero-file-input"
      />

      {/* Drop Zone: inset 14u from top/left/right, height 74u, radius 14u */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        tabIndex={0}
        role="button"
        aria-label="Drop package.json, requirements.txt, or a repository zip to scan"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`console-drop-zone absolute top-[calc(14*var(--u))] left-[calc(14*var(--u))] right-[calc(14*var(--u))] h-[calc(74*var(--u))] rounded-[calc(14*var(--u))] flex flex-col items-center justify-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#FFB547] focus:ring-offset-2 focus:ring-offset-[#070B14] ${
          isDragging
            ? 'border-solid border-[#FFB547] bg-[#FFB547]/[0.06]'
            : 'border border-dashed border-[rgba(148,170,210,0.28)] hover:border-[#FFB547]/50 hover:bg-[#0B1220]/40'
        }`}
      >
        <div className="flex items-center gap-[calc(10*var(--u))]">
          {/* Upload Icon (22u) */}
          <svg
            width="calc(22*var(--u))"
            height="calc(22*var(--u))"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#FFB547]"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>

          <span className="font-sans font-medium text-[calc(14*var(--u))] text-[#EAF0FA] tracking-tight">
            {selectedFile ? (
              <span className="flex items-center gap-[calc(6*var(--u))]">
                <span className={isOverSize ? 'text-[#FF5A5F]' : 'text-[#FFB547]'}>
                  Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="px-1.5 py-0.5 rounded text-[calc(10*var(--u))] font-mono bg-[#FF5A5F]/20 text-[#FF5A5F] hover:bg-[#FF5A5F]/35 transition-colors cursor-pointer"
                  title="Remove file"
                >
                  ✕
                </button>
              </span>
            ) : (
              'Drop package.json, requirements.txt, or a repo .zip'
            )}
          </span>
        </div>

        <span
          className={`font-mono text-[calc(11*var(--u))] ${
            sizeError ? 'text-[#FF5A5F] font-semibold' : 'text-[#7A89A3]'
          } mt-[calc(4*var(--u))] select-none`}
        >
          {sizeError || `max ${maxUploadMb} MB · limits from /api/config`}
        </span>
      </div>

      {/* Toolbar: bottom 14u, left/right 14u, height 34u, ONE row */}
      <div className="console-toolbar absolute bottom-[calc(14*var(--u))] left-[calc(14*var(--u))] right-[calc(14*var(--u))] h-[calc(34*var(--u))] flex items-center justify-between pointer-events-auto">
        {/* Left: Engine Chips */}
        <div className="flex items-center gap-[calc(8*var(--u))] overflow-x-auto no-scrollbar py-1">
          {/* Typosquat */}
          <div className="h-[calc(28*var(--u))] px-[calc(9*var(--u))] rounded-[calc(8*var(--u))] border border-[rgba(148,170,210,0.16)] bg-[#0B1220]/70 flex items-center gap-[calc(6*var(--u))] whitespace-nowrap select-none">
            <span className="w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full bg-[#FFB547]" />
            <span className="font-mono text-[calc(9.5*var(--u))] text-[#9AA7BD] font-medium tracking-[0.04em]">
              TYPOSQUAT
            </span>
          </div>

          {/* Reachability */}
          <div className="h-[calc(28*var(--u))] px-[calc(9*var(--u))] rounded-[calc(8*var(--u))] border border-[rgba(148,170,210,0.16)] bg-[#0B1220]/70 flex items-center gap-[calc(6*var(--u))] whitespace-nowrap select-none">
            <span className="w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full bg-[#4FE3C1]" />
            <span className="font-mono text-[calc(9.5*var(--u))] text-[#9AA7BD] font-medium tracking-[0.04em]">
              REACHABILITY
            </span>
          </div>

          {/* License */}
          <div className="h-[calc(28*var(--u))] px-[calc(9*var(--u))] rounded-[calc(8*var(--u))] border border-[rgba(148,170,210,0.16)] bg-[#0B1220]/70 flex items-center gap-[calc(6*var(--u))] whitespace-nowrap select-none">
            <span className="w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full bg-[#7AA2FF]" />
            <span className="font-mono text-[calc(9.5*var(--u))] text-[#9AA7BD] font-medium tracking-[0.04em]">
              LICENSE
            </span>
          </div>

          {/* SBOM+VEX */}
          <div className="h-[calc(28*var(--u))] px-[calc(9*var(--u))] rounded-[calc(8*var(--u))] border border-[rgba(148,170,210,0.16)] bg-[#0B1220]/70 flex items-center gap-[calc(6*var(--u))] whitespace-nowrap select-none">
            <span className="w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full bg-[#4FE3C1]" />
            <span className="font-mono text-[calc(9.5*var(--u))] text-[#9AA7BD] font-medium tracking-[0.04em]">
              SBOM+VEX
            </span>
          </div>

          {/* Sandbox State */}
          <div className="h-[calc(28*var(--u))] px-[calc(9*var(--u))] rounded-[calc(8*var(--u))] border border-[rgba(148,170,210,0.16)] bg-[#0B1220]/70 flex items-center gap-[calc(6*var(--u))] whitespace-nowrap select-none">
            <span
              className={`w-[calc(6*var(--u))] h-[calc(6*var(--u))] rounded-full ${
                isSandboxEnabled ? 'bg-[#4FE3C1]' : 'bg-[#7A89A3]'
              }`}
            />
            <span className="font-mono text-[calc(9.5*var(--u))] text-[#7A89A3] font-medium tracking-[0.04em]">
              {isSandboxEnabled ? 'SANDBOX·ON' : 'SANDBOX·OFF'}
            </span>
          </div>
        </div>

        {/* Right (<=220u wide): "Try sample" + Primary Button */}
        <div className="console-actions-row flex items-center gap-[calc(14*var(--u))] flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onTrySample) onTrySample();
            }}
            className="bg-transparent border-0 font-sans text-[calc(12*var(--u))] font-medium text-[#9AA7BD] hover:text-[#EAF0FA] transition-colors cursor-pointer p-0 underline-offset-4 hover:underline focus:outline-none focus:ring-1 focus:ring-[#FFB547]"
          >
            Try sample
          </button>

          <button
            type="button"
            disabled={isOverSize}
            onClick={handleButtonClick}
            className="w-[calc(104*var(--u))] h-[calc(34*var(--u))] rounded-[calc(10*var(--u))] font-sans font-semibold text-[calc(13*var(--u))] text-[#1A1206] flex items-center justify-center gap-[calc(6*var(--u))] transition-all cursor-pointer shadow-md hover:brightness-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#FFB547] focus:ring-offset-2 focus:ring-offset-[#070B14]"
            style={{
              background: 'linear-gradient(180deg, #FFC766 0%, #FF9F2E 100%)'
            }}
          >
            <span>{selectedFile ? (isOverSize ? 'Too large' : 'Run scan') : 'Choose file'}</span>
            <svg
              width="calc(12*var(--u))"
              height="calc(12*var(--u))"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

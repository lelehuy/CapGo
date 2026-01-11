import React, { useCallback } from 'react';
import { Upload, FileText, Image as ImageIcon, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface FileUploaderProps {
    onPdfSelect: (file: File) => void;
    onImageSelect: (file: File | string) => void;
    pdfFile: File | null;
    imageFile: File | string | null;
    onClearPdf: () => void;
    onClearImage: () => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
    onPdfSelect,
    onImageSelect,
    pdfFile,
    imageFile,
    onClearPdf,
    onClearImage,
}) => {
    const handlePdfDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            onPdfSelect(file);
        }
    }, [onPdfSelect]);

    const handleImageDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
            onImageSelect(file);
        }
    }, [onImageSelect]);

    return (
        <div className="flex flex-col gap-6 w-full max-w-sm">
            {/* PDF Upload Area */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 ml-1">Document (PDF)</label>
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handlePdfDrop}
                    className={cn(
                        "relative group border-2 border-dashed rounded-2xl p-6 transition-all duration-300 flex flex-col items-center justify-center text-center gap-3",
                        pdfFile
                            ? "border-indigo-500 bg-indigo-500/5"
                            : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900"
                    )}
                >
                    {pdfFile ? (
                        <>
                            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                <FileText className="text-white" size={24} />
                            </div>
                            <div>
                                <p className="text-zinc-100 font-medium truncate max-w-[200px]">{pdfFile.name}</p>
                                <p className="text-xs text-zinc-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onClearPdf(); }}
                                className="absolute top-3 right-3 p-1 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 bg-zinc-800 group-hover:bg-zinc-700 rounded-xl flex items-center justify-center transition-colors">
                                <Upload className="text-zinc-400 group-hover:text-zinc-200" size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-300 font-medium">Drop PDF here</p>
                                <p className="text-xs text-zinc-500 mt-1">or click to browse</p>
                            </div>
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={(e) => e.target.files?.[0] && onPdfSelect(e.target.files[0])}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Stamp/Signature Upload Area */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 ml-1">Stamp / Signature (PNG)</label>
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleImageDrop}
                    className={cn(
                        "relative group border-2 border-dashed rounded-2xl p-6 transition-all duration-300 flex flex-col items-center justify-center text-center gap-3",
                        imageFile
                            ? "border-emerald-500 bg-emerald-500/5"
                            : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900"
                    )}
                >
                    {imageFile ? (
                        <>
                            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 overflow-hidden">
                                {typeof imageFile === 'string' ? (
                                    <img src={imageFile} className="w-full h-full object-contain p-1 invert" alt="Signature" />
                                ) : (
                                    <ImageIcon className="text-white" size={24} />
                                )}
                            </div>
                            <div>
                                <p className="text-zinc-100 font-medium truncate max-w-[200px]">
                                    {typeof imageFile === 'string' ? "Signature Specimen" : imageFile.name}
                                </p>
                                <p className="text-xs text-zinc-500">Transparent PNG</p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onClearImage(); }}
                                className="absolute top-3 right-3 p-1 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 bg-zinc-800 group-hover:bg-zinc-700 rounded-xl flex items-center justify-center transition-colors">
                                <ImageIcon className="text-zinc-400 group-hover:text-zinc-200" size={24} />
                            </div>
                            <div>
                                <p className="text-sm text-zinc-300 font-medium">Drop Stamp Image</p>
                                <p className="text-xs text-zinc-500 mt-1">or click to browse</p>
                            </div>
                            <input
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={(e) => e.target.files?.[0] && onImageSelect(e.target.files[0])}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

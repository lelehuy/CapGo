import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import { Maximize2, Move, FileText, Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up worker using local public file
pdfjs.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.mjs';

import { GetFile } from '../../wailsjs/go/main/App';
import { LogInfo } from '../../wailsjs/runtime/runtime';
import { Stamp } from '../App';

interface CanvasPreviewProps {
    pdfPath: string | null;
    stamps: Stamp[];
    activeStampId: string | null;
    onUpdateStamp: (stamp: Stamp) => void;
    onSelectStamp: (id: string | null) => void;
    onEnvChange: (scale: number, pHeight: number) => void;
    onPageInView: (pageNum: number) => void;
    jumpToPage?: number | null;
    activePage: number;
}

// Sub-component to handle local drag state and prevent parent re-renders (Jitter Fix)
const DraggableStamp: React.FC<{
    stamp: Stamp;
    scale: number;
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (s: Stamp) => void;
}> = ({ stamp, scale, isSelected, onSelect, onUpdate }) => {
    // Local state determines position during drag
    const [pos, setPos] = useState({ x: stamp.x, y: stamp.y });

    // Sync local state if parent prop changes (e.g. alignment tools, or initial load)
    useEffect(() => {
        setPos({ x: stamp.x, y: stamp.y });
    }, [stamp.x, stamp.y]);

    return (
        <Rnd
            size={{ width: stamp.width * scale, height: stamp.height * scale }}
            position={{ x: pos.x * scale, y: pos.y * scale }}
            onDrag={(e, d) => {
                // Update ONLY local state during drag = 60fps smooth
                setPos({ x: d.x / scale, y: d.y / scale });
            }}
            onDragStop={(e, d) => {
                // Sync to parent on drop = Data consistency
                const newX = d.x / scale;
                const newY = d.y / scale;
                setPos({ x: newX, y: newY });
                onUpdate({ ...stamp, x: newX, y: newY });
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
                const newW = parseInt(ref.style.width) / scale;
                const newH = parseInt(ref.style.height) / scale;
                const newX = position.x / scale;
                const newY = position.y / scale;

                setPos({ x: newX, y: newY });
                onUpdate({ ...stamp, width: newW, height: newH, x: newX, y: newY });
            }}
            onMouseDown={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onSelect();
            }}
            bounds="parent"
            className="z-50 group"
            enableResizing={{
                top: false, right: false, bottom: false, left: false,
                topRight: false, bottomRight: true, bottomLeft: false, topLeft: false
            }}
        >
            <div className={`relative w-full h-full border-2 rounded transition-colors backdrop-blur-[0.5px] cursor-move ${isSelected ? 'border-indigo-500 bg-indigo-500/10' : 'border-transparent hover:border-indigo-500/30'}`}>
                <img
                    src={stamp.image}
                    className="w-full h-full object-contain pointer-events-none select-none"
                    alt="Stamp"
                />

                {/* Interaction Indicators */}
                <div className={`transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {/* Top-left move indicator (Visual only now, whole area is draggable) */}
                    <div className="absolute -top-3 -left-3 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg text-white pointer-events-none">
                        <Move size={12} />
                    </div>
                    {/* Bottom-right resize handle */}
                    <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg text-white cursor-nwse-resize hover:scale-110 transition-transform">
                        <Maximize2 size={12} />
                    </div>
                </div>
            </div>
        </Rnd>
    );
};


export const CanvasPreview: React.FC<CanvasPreviewProps & { jumpToPage?: number | null }> = ({
    pdfPath,
    stamps,
    activeStampId,
    onUpdateStamp,
    onSelectStamp,
    onEnvChange,
    onPageInView,
    jumpToPage,
    activePage
}) => {
    const [pdfData, setPdfData] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [pageWidth, setPageWidth] = useState<number>(0);
    const [pageHeight, setPageHeight] = useState<number>(0);
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        let activeUrl: string | null = null;

        const loadPdf = async () => {
            if (!pdfPath) {
                setPdfData(null);
                setNumPages(0);
                setPageWidth(0);
                setPageHeight(0);
                return;
            }
            LogInfo(`CanvasPreview: loadPdf ${pdfPath}`);
            setLoading(true);
            // Reset dimensions before loading new one
            setNumPages(0);
            setPageWidth(0);
            setPageHeight(0);
            try {
                const data: any = await GetFile(pdfPath);
                let bytes: Uint8Array | null = null;

                if (typeof data === 'string') {
                    const binaryString = window.atob(data);
                    bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                } else if (Array.isArray(data) || data instanceof Uint8Array) {
                    bytes = new Uint8Array(data);
                }

                if (bytes) {
                    const blob = new Blob([bytes as any], { type: 'application/pdf' });
                    activeUrl = URL.createObjectURL(blob);
                    setPdfData(activeUrl);
                }

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadPdf();
        return () => {
            if (activeUrl) URL.revokeObjectURL(activeUrl);
        };
    }, [pdfPath]);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Intersection Observer to track visible page
    useEffect(() => {
        if (!numPages || !scrollRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const pageNum = parseInt(entry.target.getAttribute('data-page-index') || '0') + 1;
                        if (pageNum > 0) {
                            LogInfo(`CanvasPreview: Page ${pageNum} in view`);
                            onPageInView(pageNum);
                        }
                    }
                });
            },
            {
                threshold: 0.5,
                root: scrollRef.current
            }
        );

        pageRefs.current.forEach((el) => {
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [numPages, onPageInView, pdfPath]);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const onPageLoadSuccess = (page: any) => {
        const viewport = page.getViewport({ scale: 1 });
        LogInfo(`CanvasPreview: Page loaded. Points: ${viewport.width}x${viewport.height}`);
        setPageWidth(viewport.width);
        setPageHeight(viewport.height);
    };

    const browserScale = (containerWidth && pageWidth) ? (containerWidth - 64 - 160) / pageWidth : 1;

    useEffect(() => {
        if (pageHeight > 0) {
            onEnvChange(browserScale, pageHeight);
        }
    }, [pageHeight, browserScale, onEnvChange]);

    useEffect(() => {
        if (typeof jumpToPage === 'number' && jumpToPage > 0 && jumpToPage <= numPages) {
            const pageEl = pageRefs.current[jumpToPage - 1];
            if (pageEl) {
                pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [jumpToPage, numPages]);

    const scrollToPage = (index: number) => {
        const pageEl = pageRefs.current[index];
        if (pageEl) {
            pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div ref={containerRef} className="flex h-full w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-900 shadow-2xl relative">
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500">
                    <Loader2 className="animate-spin text-indigo-500" size={40} />
                    <p className="text-sm font-medium animate-pulse tracking-widest uppercase">Initializing Canvas...</p>
                </div>
            ) : pdfData ? (
                <>
                    {/* Main Preview (Left) */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-12 flex flex-col items-center gap-16 custom-scrollbar scroll-smooth bg-[#080808] shadow-inner"
                        onClick={() => onSelectStamp(null)}
                    >
                        <Document
                            file={pdfData}
                            onLoadSuccess={onDocumentLoadSuccess}
                            className="flex flex-col items-center gap-16"
                            loading={null}
                        >
                            {Array.from(new Array(numPages), (el, index) => (
                                <div
                                    key={`page_${index + 1}`}
                                    ref={el => pageRefs.current[index] = el}
                                    data-page-index={index}
                                    className="relative shadow-[0_45px_100px_-20px_rgba(0,0,0,0.8)] bg-white w-fit mx-auto transition-all duration-500 hover:scale-[1.01]"
                                >
                                    <Page
                                        pageNumber={index + 1}
                                        width={pageWidth > 0 ? pageWidth * browserScale : 600}
                                        onLoadSuccess={index === 0 ? onPageLoadSuccess : undefined}
                                        renderAnnotationLayer={false}
                                        renderTextLayer={false}
                                        loading={null}
                                        className="block"
                                    />
                                    {/* Draggable Stamps FILTERED BY PAGE */}
                                    {pageWidth > 0 && stamps.filter(s => s.pageNum === index + 1).map(stamp => (
                                        <DraggableStamp
                                            key={stamp.id}
                                            stamp={stamp}
                                            scale={browserScale}
                                            isSelected={stamp.id === activeStampId}
                                            onSelect={() => onSelectStamp(stamp.id)}
                                            onUpdate={onUpdateStamp}
                                        />
                                    ))}
                                </div>
                            ))}
                        </Document>
                    </div>

                    {/* Page Thumbnails Sidebar (Right - Robust Highlight) */}
                    <aside className="w-40 border-l border-zinc-900 bg-zinc-950 flex flex-col overflow-hidden shrink-0">
                        <div className="p-4 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Navigation</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                            {Array.from(new Array(numPages), (el, index) => {
                                const isCurrent = (index + 1) === activePage;
                                return (
                                    <div
                                        key={`thumb_${index + 1}`}
                                        onClick={() => scrollToPage(index)}
                                        className="group relative cursor-pointer"
                                    >
                                        <div className={`relative bg-zinc-900 rounded-xl border-2 transition-all duration-300 shadow-xl overflow-hidden flex items-center justify-center min-h-[80px] ${isCurrent ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                                            <Document file={pdfData} loading={null}>
                                                <Page
                                                    pageNumber={index + 1}
                                                    width={120}
                                                    renderAnnotationLayer={false}
                                                    renderTextLayer={false}
                                                    loading={null}
                                                />
                                            </Document>
                                            <div className={`absolute inset-0 transition-opacity duration-300 ${isCurrent ? 'bg-indigo-600/5' : 'bg-transparent group-hover:bg-white/5'}`} />
                                        </div>
                                        <p className={`mt-3 text-center text-[10px] font-mono font-black transition-colors ${isCurrent ? 'text-indigo-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                                            {String(index + 1).padStart(2, '0')}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </aside>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-4">
                    <div className="w-20 h-20 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center bg-zinc-950/50 text-zinc-700">
                        <FileText size={32} />
                    </div>
                    <p className="text-sm font-medium">Select a PDF to begin editing</p>
                </div>
            )}
        </div>
    );
};

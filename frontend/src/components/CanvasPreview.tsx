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
    onViewportChange: (x: number, y: number) => void;
    jumpToPage?: number | null;
    activePage: number;
}

// Sub-component to handle local drag state and prevent parent re-renders (Jitter Fix)
const DraggableStamp: React.FC<{
    stamp: Stamp;
    layoutScale: number;
    zoom: number;
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (s: Stamp) => void;
    onDropCommit: (rect: DOMRect, s: Stamp) => void;
}> = ({ stamp, layoutScale, zoom, isSelected, onSelect, onUpdate, onDropCommit }) => {
    // Local state determines position during drag
    const [pos, setPos] = useState({ x: stamp.x, y: stamp.y });

    // Sync local state if parent prop changes (e.g. alignment tools, or initial load)
    useEffect(() => {
        setPos({ x: stamp.x, y: stamp.y });
    }, [stamp.x, stamp.y]);

    return (
        <Rnd
            size={{ width: stamp.width * layoutScale, height: stamp.height * layoutScale }}
            position={{ x: pos.x * layoutScale, y: pos.y * layoutScale }}
            scale={zoom}
            onDrag={(e, d) => {
                // Update ONLY local state during drag = 60fps smooth
                setPos({ x: d.x / layoutScale, y: d.y / layoutScale });
            }}
            onDragStop={(e, d) => {
                // Sync to parent on drop = Data consistency
                const node = d.node as HTMLElement;
                const rect = node.getBoundingClientRect();
                onDropCommit(rect, stamp);
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
                const newW = parseInt(ref.style.width) / layoutScale;
                const newH = parseInt(ref.style.height) / layoutScale;
                const newX = position.x / layoutScale;
                const newY = position.y / layoutScale;

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
            bounds={undefined} // Allow dragging between pages
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
    onViewportChange,
    jumpToPage,
    activePage
}) => {
    const [pdfData, setPdfData] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [pageWidth, setPageWidth] = useState<number>(0);
    const [pageHeight, setPageHeight] = useState<number>(0);
    const [containerWidth, setContainerWidth] = useState<number>(0);
    const [zoom, setZoom] = useState(1.0);
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


    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const onPageLoadSuccess = (page: any) => {
        const viewport = page.getViewport({ scale: 1 });
        LogInfo(`CanvasPreview: Page loaded. Points: ${viewport.width}x${viewport.height}`);
        setPageWidth(viewport.width);
        setPageHeight(viewport.height);
    };

    const scrollToPage = (index: number) => {
        const pageEl = pageRefs.current[index];
        if (pageEl) {
            pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    useEffect(() => {
        if (typeof jumpToPage === 'number' && jumpToPage > 0 && jumpToPage <= numPages) {
            scrollToPage(jumpToPage - 1);
        }
    }, [jumpToPage, numPages]);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const container = scrollRef.current;
                if (!container) return;

                const rect = container.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const offsetY = e.clientY - rect.top;
                const { scrollLeft, scrollTop } = container;

                // Smoother zoom sensitivity
                const delta = -e.deltaY * 0.002;
                const newZoom = Math.min(Math.max(zoom + delta, 0.5), 3.0);

                if (newZoom !== zoom) {
                    const scale = newZoom / zoom;
                    setZoom(newZoom);

                    // Zoom to mouse cursor position
                    requestAnimationFrame(() => {
                        if (container) {
                            container.scrollLeft = (scrollLeft + offsetX) * scale - offsetX;
                            container.scrollTop = (scrollTop + offsetY) * scale - offsetY;
                        }
                    });
                }
            }
        };

        const container = scrollRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
            }
        };
    }, [loading, pdfData, zoom]);

    const browserScale = (containerWidth && pageWidth) ? (containerWidth - 64 - 160) / pageWidth : 1;
    const effectiveScale = browserScale * zoom;

    useEffect(() => {
        if (pageHeight > 0) {
            onEnvChange(effectiveScale, pageHeight);
        }
    }, [pageHeight, effectiveScale, onEnvChange]);

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

    // Track Viewport Center for Stamp Placement
    useEffect(() => {
        const handleScroll = () => {
            if (!scrollRef.current || activePage <= 0) return;
            const pageEl = pageRefs.current[activePage - 1];
            if (!pageEl) return;

            const containerRect = scrollRef.current.getBoundingClientRect();
            const pageRect = pageEl.getBoundingClientRect();

            // Center of the container
            const cx = containerRect.left + containerRect.width / 2;
            const cy = containerRect.top + containerRect.height / 2;

            // Offset of center relative to the page top-left
            const offsetX = cx - pageRect.left;
            const offsetY = cy - pageRect.top;

            // Convert to PDF coordinates
            // effectiveScale = browserScale * zoom
            const pdfX = offsetX / effectiveScale;
            const pdfY = offsetY / effectiveScale;

            onViewportChange(pdfX, pdfY);
        };

        const container = scrollRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
            handleScroll();
        }

        return () => {
            if (container) container.removeEventListener('scroll', handleScroll);
        };
    }, [activePage, effectiveScale, onViewportChange]);

    const handleStampDrop = (rect: DOMRect, stamp: Stamp) => {
        // Find which page is under the center of the dropped stamp
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        // Use elementsFromPoint to find the page container
        const elements = document.elementsFromPoint(cx, cy);
        const targetPageDiv = elements.find(el => el.hasAttribute('data-page-index'));

        if (targetPageDiv) {
            const pageIndex = parseInt(targetPageDiv.getAttribute('data-page-index') || '0');
            const targetPageNum = pageIndex + 1;
            const targetRect = targetPageDiv.getBoundingClientRect();

            // Calculate new X, Y relative to the TARGET page
            // We use layoutScale because that defines the unzoomed Page coordinate system
            // rect.left is screen coordinate. targetRect.left is screen coordinate.
            // Difference is screen pixels.
            // We need to divide by (layoutScale * zoom) to get PDF Points?
            // Wait, DraggableStamp uses `width * layoutScale`. And `scale={zoom}`.
            // So visual size = width * layoutScale * zoom.
            // Visual diff = (x * layoutScale * zoom).
            // So x = visualDiff / (layoutScale * zoom).

            // However, we used CSS Zoom on the container.
            // The `targetRect` is affected by CSS Zoom?
            // Yes, getBoundingClientRect returns actual screen pixels.
            // So `targetRect` is zoomed. `rect` (stamp) is zoomed.
            // So `diff` is zoomed pixels.
            // We need to divide by `zoom` to get "Layout Pixels" (unzoomed screen pixels).
            // Then divide by `layoutScale` to get PDF Points.

            // Wait, does CSS Zoom affect getBoundingClientRect?
            // Yes.
            // So:
            // diffScreen = rect.left - targetRect.left
            // diffLayout = diffScreen / zoom
            // diffPdf = diffLayout / browserScale

            const diffX = rect.left - targetRect.left;
            const diffY = rect.top - targetRect.top;

            // Derive scale from actual DOM to ensure precision regardless of zoom state
            // targetRect.width = Visual width (zoomed and scaled)
            // pageWidth = Original PDF Point width
            const currentScale = targetRect.width / pageWidth;

            const newX = diffX / currentScale;
            const newY = diffY / currentScale;

            onUpdateStamp({
                ...stamp,
                pageNum: targetPageNum,
                x: newX,
                y: newY
            });
        }
    };



    // ...

    return (
        <div ref={containerRef} className="flex h-full w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-900 shadow-2xl relative">
            {/* Zoom Indicator */}
            <div className="absolute z-20 bottom-6 left-12 bg-zinc-900/80 backdrop-blur border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-zinc-400 select-none shadow-xl pointer-events-none">
                {Math.round(zoom * 100)}%
            </div>

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
                        className="flex-1 overflow-auto overscroll-none p-12 flex flex-col items-start gap-16 custom-scrollbar scroll-smooth bg-[#080808] shadow-inner"
                        onClick={() => onSelectStamp(null)}
                    >
                        <div className="mx-auto" style={{ zoom: zoom }}>
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
                                        // Removed transform: scale(zoom) as we use CSS zoom on container
                                        className="relative shadow-[0_45px_100px_-20px_rgba(0,0,0,0.8)] bg-white w-fit mx-auto transition-transform duration-75"
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
                                        {/* Draggable Stamps */}
                                        {pageWidth > 0 && stamps.filter(s => s.pageNum === index + 1).map(stamp => (
                                            <DraggableStamp
                                                key={stamp.id}
                                                stamp={stamp}
                                                layoutScale={browserScale}
                                                zoom={zoom}
                                                isSelected={stamp.id === activeStampId}
                                                onSelect={() => onSelectStamp(stamp.id)}
                                                onUpdate={onUpdateStamp}
                                                onDropCommit={handleStampDrop}
                                            />
                                        ))}
                                    </div>
                                ))}
                            </Document>
                        </div>
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

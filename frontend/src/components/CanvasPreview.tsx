import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import { Maximize2, Move, FileText, Loader2, Trash2, Clipboard, Copy, Layers, Plus, Minus } from 'lucide-react';
import { Reorder } from 'framer-motion';
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
    onUpdatePages: (newPageOrder: number[]) => void;
    jumpToPage?: number | null;
    activePage: number;
    toolbar?: React.ReactNode;
}

const ContextMenu: React.FC<{
    x: number;
    y: number;
    onClose: () => void;
    options: { label: string; onClick: () => void; destructive?: boolean; icon?: React.ReactNode }[];
}> = ({ x, y, onClose, options }) => {
    useEffect(() => {
        const handleClick = () => onClose();
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [onClose]);

    return (
        <div
            className="fixed z-[100] w-48 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden p-1.5 animate-in fade-in zoom-in-95 duration-200"
            style={{ top: y, left: x }}
            onClick={(e) => e.stopPropagation()}
        >
            {options.map((opt, i) => (
                <button
                    key={i}
                    onClick={() => { opt.onClick(); onClose(); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-[11px] font-bold transition-all ${opt.destructive ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-300 hover:bg-white/10 hover:text-white'}`}
                >
                    {opt.icon && <span className="opacity-50">{opt.icon}</span>}
                    {opt.label}
                </button>
            ))}
        </div>
    );
};

// Sub-component to handle local drag state and prevent parent re-renders (Jitter Fix)
const DraggableStamp: React.FC<{
    stamp: Stamp;
    scale: number;
    isSelected: boolean;
    onSelect: () => void;
    onUpdate: (s: Stamp) => void;
    onDropCommit: (rect: DOMRect, s: Stamp) => void;
}> = ({ stamp, scale, isSelected, onSelect, onUpdate, onDropCommit }) => {
    // Local state determines position during drag
    const [pos, setPos] = useState({ x: stamp.x, y: stamp.y });

    // Sync local state if parent prop changes
    useEffect(() => {
        setPos({ x: stamp.x, y: stamp.y });
    }, [stamp.x, stamp.y]);

    return (
        <Rnd
            size={{ width: stamp.width * scale, height: stamp.height * scale }}
            position={{ x: pos.x * scale, y: pos.y * scale }}
            onDrag={(e, d) => {
                setPos({ x: d.x / scale, y: d.y / scale });
            }}
            onDragStop={(e, d) => {
                const node = d.node as HTMLElement;
                const rect = node.getBoundingClientRect();
                onDropCommit(rect, stamp);
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
                const newW = parseInt(ref.style.width) / scale;
                const newH = parseInt(ref.style.height) / scale;
                const newX = position.x / scale;
                const newY = position.y / scale;

                const newPos = { x: newX, y: newY };
                setPos(newPos);
                onUpdate({ ...stamp, width: newW, height: newH, ...newPos });
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


export const CanvasPreview: React.FC<CanvasPreviewProps> = ({
    pdfPath,
    stamps,
    activeStampId,
    onUpdateStamp,
    onSelectStamp,
    onEnvChange,
    onPageInView,
    onViewportChange,
    onUpdatePages,
    jumpToPage,
    activePage,
    toolbar
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
    const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Sidebar Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(200);
    const isResizingRef = useRef(false);

    // Sync Sidebar Scroll
    useEffect(() => {
        if (activePage > 0) {
            const thumb = thumbRefs.current[activePage - 1];
            if (thumb) {
                thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [activePage]);

    // Context Menu State
    const [menu, setMenu] = useState<{ x: number, y: number, pageNum: number } | null>(null);
    const [copiedPage, setCopiedPage] = useState<number | null>(null);

    // Reorder State
    const [pageOrder, setPageOrder] = useState<number[]>([]);

    useEffect(() => {
        if (numPages > 0) {
            setPageOrder(Array.from({ length: numPages }, (_, i) => i + 1));
        }
    }, [numPages, pdfPath]);

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

    // Sidebar resize handlers
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingRef.current) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 120 && newWidth < 600) {
                setSidebarWidth(newWidth);
            }
        };
        const handleMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = 'default';
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const onPageLoadSuccess = (page: any) => {
        const viewport = page.getViewport({ scale: 1 });
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

    const zoomRef = useRef(zoom);
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        let startZoom = zoomRef.current;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const doc = container?.querySelector('.pdf-document-container');
                if (!doc) return;

                const docRect = doc.getBoundingClientRect();
                const mouseXInDoc = e.clientX - docRect.left;
                const mouseYInDoc = e.clientY - docRect.top;

                // Normalize delta for different input devices
                const delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002);
                const currentZoom = zoomRef.current;
                const newZoom = Math.min(Math.max(currentZoom + (currentZoom * delta), 0.4), 4.0);

                if (newZoom !== currentZoom) {
                    const ratio = newZoom / currentZoom;
                    setZoom(newZoom);
                    zoomRef.current = newZoom; // Immediate update

                    container.scrollLeft += mouseXInDoc * (ratio - 1);
                    container.scrollTop += mouseYInDoc * (ratio - 1);
                }
            }
        };

        const handleGestureStart = (e: any) => {
            e.preventDefault();
            startZoom = zoomRef.current;
        };

        const handleGestureChange = (e: any) => {
            e.preventDefault();
            const doc = container?.querySelector('.pdf-document-container');
            if (!doc) return;

            const newZoom = Math.min(Math.max(startZoom * e.scale, 0.4), 4.0);
            const currentZoom = zoomRef.current;

            if (newZoom !== currentZoom) {
                const ratio = newZoom / currentZoom;
                setZoom(newZoom);
                zoomRef.current = newZoom; // Immediate update

                const docRect = doc.getBoundingClientRect();
                const mouseXInDoc = e.clientX - docRect.left;
                const mouseYInDoc = e.clientY - docRect.top;

                container.scrollLeft += mouseXInDoc * (ratio - 1);
                container.scrollTop += mouseYInDoc * (ratio - 1);
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        // @ts-ignore
        container.addEventListener('gesturestart', handleGestureStart, { passive: false });
        // @ts-ignore
        container.addEventListener('gesturechange', handleGestureChange, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
            // @ts-ignore
            container.removeEventListener('gesturestart', handleGestureStart);
            // @ts-ignore
            container.removeEventListener('gesturechange', handleGestureChange);
        };
    }, [loading, pdfData]);

    const browserScale = (containerWidth && pageWidth) ? (containerWidth - sidebarWidth - 60) / pageWidth : 1;
    const effectiveScale = browserScale * zoom;

    const handleManualZoom = (delta: number) => {
        const container = scrollRef.current;
        if (!container) return;

        const currentZoom = zoomRef.current;
        const newZoom = Math.min(Math.max(currentZoom + delta, 0.4), 4.0);

        if (newZoom !== currentZoom) {
            const ratio = newZoom / currentZoom;

            // Zoom from the center of the viewport
            const centerX = container.scrollLeft + container.clientWidth / 2;
            const centerY = container.scrollTop + container.clientHeight / 2;

            setZoom(newZoom);
            zoomRef.current = newZoom;

            container.scrollLeft = centerX * ratio - container.clientWidth / 2;
            container.scrollTop = centerY * ratio - container.clientHeight / 2;
        }
    };

    useEffect(() => {
        if (pageHeight > 0) onEnvChange(effectiveScale, pageHeight);
    }, [pageHeight, effectiveScale, onEnvChange]);

    useEffect(() => {
        if (!numPages || !scrollRef.current) return;

        // Use a more robust detection: which page is in the middle of the viewport?
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.getAttribute('data-page-index') || '0') + 1;
                    if (pageNum > 0) {
                        onPageInView(pageNum);
                    }
                }
            });
        }, {
            threshold: 0, // Trigger even if 1px is visible
            root: scrollRef.current,
            // Only trigger if it enters the middle 20% of the screen
            rootMargin: '-40% 0px -40% 0px'
        });

        pageRefs.current.forEach((el) => { if (el) observer.observe(el); });
        return () => observer.disconnect();
    }, [numPages, onPageInView, pdfPath]);

    useEffect(() => {
        const handleScroll = () => {
            if (!scrollRef.current || activePage <= 0) return;
            const pageEl = pageRefs.current[activePage - 1];
            if (!pageEl) return;
            const containerRect = scrollRef.current.getBoundingClientRect();
            const pageRect = pageEl.getBoundingClientRect();
            const cx = containerRect.left + containerRect.width / 2;
            const cy = containerRect.top + containerRect.height / 2;
            const offsetX = cx - pageRect.left;
            const offsetY = cy - pageRect.top;
            onViewportChange(offsetX / effectiveScale, offsetY / effectiveScale);
        };
        const container = scrollRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll, { passive: true });
            handleScroll();
        }
        return () => container?.removeEventListener('scroll', handleScroll);
    }, [activePage, effectiveScale, onViewportChange]);

    const handleStampDrop = (rect: DOMRect, stamp: Stamp) => {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const targetPageDiv = document.elementsFromPoint(cx, cy).find(el => el.hasAttribute('data-page-index'));
        if (targetPageDiv) {
            const targetPageNum = parseInt(targetPageDiv.getAttribute('data-page-index') || '0') + 1;
            const targetRect = targetPageDiv.getBoundingClientRect();
            const currentScale = targetRect.width / pageWidth;
            onUpdateStamp({ ...stamp, pageNum: targetPageNum, x: (rect.left - targetRect.left) / currentScale, y: (rect.top - targetRect.top) / currentScale });
        }
    };

    // Keyboard Shortcuts for Page Manipulation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            // Only handle page shortcuts if NO stamp is selected
            if (activeStampId) return;

            if (isMod && (e.key === 'c' || e.code === 'KeyC')) {
                performPageAction('copy', activePage);
                e.preventDefault();
            }

            if (isMod && (e.key === 'v' || e.code === 'KeyV')) {
                if (copiedPage !== null) {
                    performPageAction('paste', activePage);
                    e.preventDefault();
                }
            }

            if ((e.code === 'Delete' || e.code === 'Backspace')) {
                // For now, let's keep delete to right-click only to avoid accidental deletions of pages
                // unless we want it. User explicitly asked for copy/paste.
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activePage, activeStampId, copiedPage, numPages]);

    // Page Actions
    const performPageAction = (type: 'delete' | 'duplicate' | 'copy' | 'paste', targetPage: number) => {
        if (type === 'copy') {
            setCopiedPage(targetPage);
            return;
        }

        const currentOrder = Array.from({ length: numPages }, (_, i) => i + 1);
        let newOrder: number[] = [];

        if (type === 'delete') {
            newOrder = currentOrder.filter(p => p !== targetPage);
        } else if (type === 'duplicate') {
            currentOrder.forEach(p => {
                newOrder.push(p);
                if (p === targetPage) newOrder.push(p);
            });
        } else if (type === 'paste' && copiedPage !== null) {
            currentOrder.forEach(p => {
                newOrder.push(p);
                if (p === targetPage) newOrder.push(copiedPage);
            });
        }

        if (newOrder.length > 0) onUpdatePages(newOrder);
    };

    return (
        <div ref={containerRef} className="flex h-full w-full bg-[var(--bg-main)] overflow-hidden relative">
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-zinc-500">
                    <Loader2 className="animate-spin text-indigo-500" size={32} />
                    <p className="text-[10px] font-black tracking-[0.2em] uppercase opacity-50">Loading Document...</p>
                </div>
            ) : pdfData ? (
                <>
                    {/* Main Preview Container (Centers floating UI to Document View) */}
                    <div className="flex-1 flex flex-col relative overflow-hidden">
                        {/* Top Floating Toolbar (Passed from App.tsx) */}
                        {toolbar && (
                            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[60] flex items-center justify-center w-full pointer-events-none px-4">
                                <div className="pointer-events-auto bg-[var(--bg-card)] shadow-[var(--shadow-soft)] rounded-3xl border border-[var(--border-main)] overflow-hidden">
                                    {toolbar}
                                </div>
                            </div>
                        )}

                        {/* Bottom Zoom Indicator */}
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-card)] border border-[var(--border-main)] pl-4 pr-6 py-2 rounded-full flex items-center gap-4 text-[11px] font-black text-[var(--text-main)] select-none shadow-[var(--shadow-soft)] pointer-events-auto uppercase tracking-[0.2em] whitespace-nowrap">
                            <div className="flex items-center gap-1 border-r border-[var(--border-main)] pr-4">
                                <button
                                    onClick={() => handleManualZoom(-0.2)}
                                    className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                                >
                                    <Minus size={14} />
                                </button>
                                <button
                                    onClick={() => handleManualZoom(0.2)}
                                    className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                            <div className="min-w-[80px]">
                                <span className="text-[var(--text-muted)] mr-2">Scale:</span> {Math.round(zoom * 100)}%
                            </div>
                        </div>

                        {/* Scrollable Viewport */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-auto overscroll-none py-16 flex flex-col items-center custom-scrollbar bg-[var(--bg-main)]"
                            onClick={() => { onSelectStamp(null); setMenu(null); }}
                        >
                            <div className="pdf-document-container flex-shrink-0" style={{ width: pageWidth * effectiveScale }}>
                                <Document
                                    file={pdfData}
                                    onLoadSuccess={onDocumentLoadSuccess}
                                    className="flex flex-col items-center gap-20"
                                    loading={null}
                                >
                                    {Array.from(new Array(numPages), (el, index) => (
                                        <div
                                            key={`page_${index + 1}`}
                                            ref={el => pageRefs.current[index] = el}
                                            data-page-index={index}
                                            className="relative shadow-[var(--shadow-soft)] border border-[var(--border-main)] bg-white w-fit mx-auto"
                                        >
                                            <Page
                                                pageNumber={index + 1}
                                                width={pageWidth > 0 ? pageWidth * effectiveScale : 600}
                                                onLoadSuccess={index === 0 ? onPageLoadSuccess : undefined}
                                                renderAnnotationLayer={false}
                                                renderTextLayer={false}
                                                loading={null}
                                                className="block"
                                            />
                                            {pageWidth > 0 && stamps.filter(s => s.pageNum === index + 1).map(stamp => (
                                                <DraggableStamp
                                                    key={stamp.id}
                                                    stamp={stamp}
                                                    scale={effectiveScale}
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
                    </div>

                    {/* Resize Handle */}
                    <div
                        className="w-1.5 hover:w-2 bg-transparent hover:bg-[var(--accent)]/20 cursor-col-resize transition-all active:bg-[var(--accent)]/40 z-40 mx-1 flex items-center justify-center group"
                        onMouseDown={(e) => {
                            isResizingRef.current = true;
                            document.body.style.cursor = 'col-resize';
                            e.preventDefault();
                        }}
                    >
                        <div className="w-0.5 h-8 bg-[var(--border-main)] group-hover:bg-[var(--accent)]/50 rounded-full transition-colors" />
                    </div>

                    {/* Page Thumbnails Sidebar (Right) */}
                    <aside
                        style={{ width: sidebarWidth }}
                        className="bg-[var(--bg-card)] m-4 ml-0 rounded-[var(--radius-bento)] shadow-[var(--shadow-soft)] border border-[var(--border-main)] flex flex-col overflow-hidden shrink-0 transition-all duration-300"
                    >
                        <div className="p-6">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--text-main)]">Pages</h3>
                        </div>
                        <Reorder.Group
                            axis="y"
                            values={pageOrder}
                            onReorder={setPageOrder}
                            className="flex-1 overflow-y-auto px-6 pb-20 space-y-6 custom-scrollbar"
                        >
                            {pageOrder.map((pNum, index) => {
                                const visualPageNum = index + 1;
                                const isCurrent = visualPageNum === activePage;
                                return (
                                    <Reorder.Item
                                        key={pNum}
                                        value={pNum}
                                        ref={(el: any) => thumbRefs.current[index] = el}
                                        whileDrag={{ scale: 1.05, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}
                                        onDragEnd={() => {
                                            const originalOrder = Array.from({ length: numPages }, (_, i) => i + 1);
                                            const hasChanged = pageOrder.some((val, i) => val !== originalOrder[i]);
                                            if (hasChanged) {
                                                onUpdatePages(pageOrder);
                                            }
                                        }}
                                        onClick={() => scrollToPage(index)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setMenu({ x: e.clientX, y: e.clientY, pageNum: pNum });
                                        }}
                                        className="group relative cursor-pointer"
                                    >
                                        <div className={`relative bg-[var(--bg-card)] rounded-2xl border-2 transition-all duration-300 shadow-2xl overflow-hidden flex items-center justify-center min-h-[80px] ${isCurrent ? 'border-[var(--accent)] ring-4 ring-[var(--accent)]/30' : 'border-[var(--border-main)] hover:border-blue-400/50 dark:hover:border-indigo-500/50'}`}>
                                            <Document file={pdfData} loading={null}>
                                                <Page pageNumber={pNum} width={sidebarWidth - 60} renderAnnotationLayer={false} renderTextLayer={false} loading={null} />
                                            </Document>

                                            {/* Selection Glow Overlay */}
                                            <div className={`absolute inset-0 transition-opacity duration-300 ${isCurrent ? 'bg-[var(--accent)]/10' : 'bg-transparent group-hover:bg-[var(--bg-hover)]'}`} />

                                            {/* Active Indicator Bar */}
                                            {isCurrent && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent)] shadow-[0_0_15px_var(--accent-glow)]" />
                                            )}
                                        </div>

                                        <div className={`absolute top-2 right-2 w-6 h-6 bg-[var(--accent)] backdrop-blur rounded-lg flex items-center justify-center text-[9px] font-black text-white transition-all border border-white/20 shadow-lg ${isCurrent ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100 group-hover:bg-black/50'}`}>
                                            {pNum}
                                        </div>

                                        {/* Drag Handle Overlay */}
                                        <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/0 group-active:bg-indigo-500/10 transition-colors pointer-events-none rounded-2xl" />
                                    </Reorder.Item>
                                );
                            })}
                        </Reorder.Group>
                    </aside>

                    {menu && (
                        <ContextMenu
                            x={menu.x}
                            y={menu.y}
                            onClose={() => setMenu(null)}
                            options={[
                                { label: 'Copy Page', icon: <Copy size={14} />, onClick: () => performPageAction('copy', menu.pageNum) },
                                { label: 'Paste Page After', icon: <Clipboard size={14} />, onClick: () => performPageAction('paste', menu.pageNum) },
                                { label: 'Duplicate', icon: <Layers size={14} />, onClick: () => performPageAction('duplicate', menu.pageNum) },
                                { label: 'Delete Page', destructive: true, icon: <Trash2 size={14} />, onClick: () => performPageAction('delete', menu.pageNum) },
                            ]}
                        />
                    )}
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-4">
                    <div className="w-20 h-20 border border-[var(--border-main)] rounded-[2rem] flex items-center justify-center bg-[var(--bg-card)]/50 text-[var(--text-muted)]">
                        <FileText size={32} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Select a PDF to begin</p>
                </div>
            )}
        </div>
    );
};

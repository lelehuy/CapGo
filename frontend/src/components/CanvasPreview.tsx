import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import { Maximize2, Move, FileText, Loader2, Trash2, Clipboard, Copy, Layers, Plus, Minus, CheckCircle2 } from 'lucide-react';
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
    // renderedZoom is the zoom level at which the PDF was last rendered
    const [renderedZoom, setRenderedZoom] = useState(1.0);
    // renderedBrowserScale is the browser scale at which the PDF was last rendered
    const [renderedBrowserScale, setRenderedBrowserScale] = useState(1.0); 

    const [loading, setLoading] = useState(false);
    const [isZooming, setIsZooming] = useState(false);
    const zoomTimeoutRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
    const thumbRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Sidebar Resizing State
    const [sidebarWidth, setSidebarWidth] = useState(200);
    const isResizingRef = useRef(false);

    // Sync Sidebar Scroll & Selection
    useEffect(() => {
        if (activePage > 0) {
            // Scroll sidebar thumbnail into view
            const thumb = thumbRefs.current[activePage - 1];
            if (thumb) {
                // Use 'nearest' to avoid unnecessary jumping if already in view
                thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            // Sync Selection with Scroll? 
            // NO, per user request: Blue highlight tracks ACTIVE view.
            // Selection is separate (Checkboxes).
            // So we do NOT update selectedPages on scroll. 
        }
    }, [activePage]);

    // Context Menu State
    const [menu, setMenu] = useState<{ x: number, y: number, pageNum: number } | null>(null);
    const [copiedPages, setCopiedPages] = useState<number[]>([]);
    const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

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
             // We just update container width immediately for visual calc
            if (containerRef.current) setContainerWidth(containerRef.current.offsetWidth);
        };
        // Initial set
        handleResize();
        
        // Add ResizeObserver specifically for container size changes (like sidebar resize)
        const resizeObserver = new ResizeObserver(() => {
             handleResize();
        });
        
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        window.addEventListener('resize', handleResize);
        return () => {
             window.removeEventListener('resize', handleResize);
             resizeObserver.disconnect();
        };
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
                // Using a logarithmic scale factor for smoother, more natural zoom
                const delta = -e.deltaY * 0.0015;
                const factor = Math.pow(1.1, delta);
                const currentZoom = zoomRef.current;
                const newZoom = Math.min(Math.max(currentZoom * factor, 0.4), 4.0);

                if (newZoom !== currentZoom) {
                    const ratio = newZoom / currentZoom;
                    setZoom(newZoom);
                    zoomRef.current = newZoom; // Immediate update

                    setIsZooming(true);
                    if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
                    zoomTimeoutRef.current = setTimeout(() => {
                        setRenderedZoom(newZoom);
                        setIsZooming(false);
                    }, 500);

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

                setIsZooming(true);
                if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
                zoomTimeoutRef.current = setTimeout(() => {
                    setRenderedZoom(newZoom);
                    setIsZooming(false);
                }, 500);

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

    // Current Target Scale (what we want to see)
    const browserScale = (containerWidth && pageWidth) ? (containerWidth - sidebarWidth - 60) / pageWidth : 1;
    const effectiveScale = browserScale * zoom;

    // We detect when browserScale changes significantly (sidebar resize or window resize)
    // AND DEBOUNCE rendering the PDF at that new scale.
    useEffect(() => {
        // If we have no rendered scale yet, set it immediately
        if (renderedBrowserScale === 1.0 && browserScale !== 1.0) {
            setRenderedBrowserScale(browserScale);
            return;
        }

        if (browserScale !== renderedBrowserScale) {
            setIsZooming(true); // Treat as zooming (visual scale only)
            
            if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
            zoomTimeoutRef.current = setTimeout(() => {
                setRenderedBrowserScale(browserScale);
                setIsZooming(false);
            }, 500); // 500ms debounce
        }
    }, [browserScale]); // We intentionally do NOT include renderedBrowserScale in deps to avoid loops, though logic handles it.

    // The scale used for the ACTUAL <Page /> component.
    // It only updates when we commit the zoom or browser scale.
    const finalRenderedScale = renderedBrowserScale * renderedZoom;

    // Visual Scale Factor for CSS Transform
    // effectiveScale (Target) / finalRenderedScale (Current Texture)
    const cssScale = effectiveScale / finalRenderedScale;

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
            // For manual buttons, we want instant crisp render usually, 
            // but consistency is better. Let the effect handle render update.
            // But to avoid blur on button click, maybe we update immediately?
            // Let's stick to the debounce pattern for consistency or users might see blink.
            // setRenderedZoom(newZoom); <-- Removed to use debounce path
            
            // Actually manual click is distinct, let's force it for better UX?
            // No, consistency prevents blinking.
             setIsZooming(true);
             if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
             zoomTimeoutRef.current = setTimeout(() => {
                 setRenderedZoom(newZoom);
                 setIsZooming(false);
             }, 500);

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
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            // Only handle page shortcuts if NO stamp is selected
            if (activeStampId) return;

            const isMod = e.metaKey || e.ctrlKey;

            if (isMod && (e.key === 'c' || e.code === 'KeyC')) {
                if (selectedPages.size > 0) {
                    performPageAction('copy');
                    e.preventDefault();
                }
            }

            if (isMod && (e.key === 'v' || e.code === 'KeyV')) {
                if (copiedPages.length > 0) {
                    performPageAction('paste');
                    e.preventDefault();
                }
            }

            if ((e.key === 'Delete' || e.key === 'Backspace')) {
                 if (selectedPages.size > 0) {
                     performPageAction('delete');
                     e.preventDefault();
                 }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activePage, activeStampId, copiedPages, selectedPages, numPages]);

    // Sidebar Click Handler
    const handleSidebarClick = (e: React.MouseEvent, pNum: number, index: number) => {
        if (e.shiftKey) {
            // Toggle selection (Checkboxes)
            const newSet = new Set(selectedPages);
            if (newSet.has(pNum)) {
                newSet.delete(pNum);
            } else {
                newSet.add(pNum);
            }
            setSelectedPages(newSet);
        } else {
            // Standard click: Navigation + Set as Active
            // Does NOT select (check) the page unless CMD is held?
            // Actually, usually click = jump to page.
            scrollToPage(index);
            // We can optionally clear selection on simple click?
            // setSelectedPages(new Set()); 
        }
    };

    // Page Actions
    const performPageAction = (type: 'delete' | 'duplicate' | 'copy' | 'paste', targetPageOverride?: number) => {
        // Determine the target pages: either the specific override (from right click on non-selected) or the selection set
        let targets = new Set(selectedPages);
        
        // If context menu was opened on a page not in selection, select only that page
        if (targetPageOverride && !selectedPages.has(targetPageOverride) && type !== 'paste') {
           targets = new Set([targetPageOverride]);
           setSelectedPages(targets);
        }
        
        // If nothing selected and no override (e.g. keyboard shortcut with empty selection), use active page or return?
        // Current UX: keyboard only works if selection exists. 

        if (type === 'copy') {
            setCopiedPages(Array.from(targets));
            return;
        }

        const currentOrder = Array.from({ length: numPages }, (_, i) => i + 1);
        let newOrder: number[] = [];

        if (type === 'delete') {
            newOrder = currentOrder.filter(p => !targets.has(p));
            // Should clear selection after delete
            setSelectedPages(new Set());
        } else if (type === 'duplicate') {
            currentOrder.forEach(p => {
                newOrder.push(p);
                if (targets.has(p)) {
                     // Find how many times this page is in targets (actually set has unique)
                     // Duplicate it once.
                     newOrder.push(p);
                }
            });
        } else if (type === 'paste') {
             // Paste after the LAST target page, or active page if no targets?
             // Usually paste adds after the "focused" item.
             // We'll insert after the last page in the targets list, or activePage.
             const insertAfter = targetPageOverride || Array.from(targets).pop() || activePage;
             
             currentOrder.forEach(p => {
                newOrder.push(p);
                if (p === insertAfter) {
                    copiedPages.forEach(cp => newOrder.push(cp));
                }
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
                            onClick={() => { 
                                onSelectStamp(null); 
                                setMenu(null);
                                // Optional: Clicking empty space clears page selection? 
                                // sticky selection is usually better for pro apps.
                            }}
                        >
                            <div className="pdf-document-container flex-shrink-0 origin-top" style={{
                                width: pageWidth * effectiveScale, // Maintains layout space
                                transform: `scale(${cssScale})`, // Visual scale
                                transformOrigin: 'top left' 
                            }}>
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
                                            className="relative shadow-[var(--shadow-soft)] border border-[var(--border-main)] bg-white w-fit mx-auto transition-none"
                                            style={{
                                                width: pageWidth * finalRenderedScale,
                                                height: pageHeight * finalRenderedScale,
                                                // We must counter-scale the individual pages? 
                                                // No, the container is scaled.
                                                // Wait, if container is scaled by cssScale, then the inner Page (rendered at finalRenderedScale)
                                                // will appear at size: finalRenderedScale * cssScale = effectiveScale. Correct.
                                            }}
                                        >
                                            <Page
                                                pageNumber={index + 1}
                                                width={pageWidth > 0 ? pageWidth * finalRenderedScale : 600}
                                                onLoadSuccess={index === 0 ? onPageLoadSuccess : undefined}
                                                renderAnnotationLayer={false}
                                                renderTextLayer={false}
                                                loading={null}
                                                className="block"
                                                devicePixelRatio={Math.max(window.devicePixelRatio || 1, 2)}
                                            />
                                            {pageWidth > 0 && stamps.filter(s => s.pageNum === index + 1).map(stamp => (
                                                <DraggableStamp
                                                    key={stamp.id}
                                                    stamp={stamp}
                                                    scale={finalRenderedScale}
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
                                const isVisible = visualPageNum === activePage;
                                const isSelected = selectedPages.has(pNum);

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
                                        onClick={(e) => handleSidebarClick(e, pNum, index)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            if (!isSelected) {
                                                setSelectedPages(new Set([pNum]));
                                                scrollToPage(index);
                                            }
                                            setMenu({ x: e.clientX, y: e.clientY, pageNum: pNum });
                                        }}
                                        className="group relative cursor-pointer"
                                    >
                                        <div className={`relative bg-[var(--bg-card)] rounded-2xl border-2 transition-all duration-300 shadow-2xl overflow-hidden flex items-center justify-center min-h-[80px] ${isVisible ? 'border-[var(--accent)] ring-4 ring-[var(--accent)]/20' : 'border-[var(--border-main)] hover:border-blue-400/50 dark:hover:border-indigo-500/50'}`}>
                                            <Document file={pdfData} loading={null}>
                                                <Page pageNumber={pNum} width={sidebarWidth - 60} renderAnnotationLayer={false} renderTextLayer={false} loading={null} />
                                            </Document>

                                            {/* Selection Overlay (Check) */}
                                            {isSelected && (
                                                <div className="absolute inset-0 bg-indigo-500/10 border-2 border-indigo-500 z-10 pointer-events-none rounded-xl" />
                                            )}
                                        </div>

                                        {/* Page Number Badge */}
                                        <div className={`absolute top-2 right-2 w-6 h-6 backdrop-blur rounded-lg flex items-center justify-center text-[9px] font-black transition-all border shadow-lg z-20 ${isVisible ? 'bg-[var(--accent)] text-white border-white/20' : 'bg-black/50 text-white border-white/10'}`}>
                                            {pNum}
                                        </div>

                                        {/* Selection Checkbox */}
                                        {isSelected && (
                                            <div className="absolute top-2 left-2 w-5 h-5 bg-indigo-500 rounded-md flex items-center justify-center shadow-lg z-20 animate-in zoom-in spin-in-90 duration-200">
                                                <CheckCircle2 size={12} className="text-white" strokeWidth={3} />
                                            </div>
                                        )}

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
                                { label: `Copy ${selectedPages.size > 1 ? `(${selectedPages.size})` : ''}`, icon: <Copy size={14} />, onClick: () => performPageAction('copy', menu.pageNum) },
                                { label: 'Paste Page After', icon: <Clipboard size={14} />, onClick: () => performPageAction('paste', menu.pageNum) },
                                { label: `Duplicate ${selectedPages.size > 1 ? `(${selectedPages.size})` : ''}`, icon: <Layers size={14} />, onClick: () => performPageAction('duplicate', menu.pageNum) },
                                { label: `Delete ${selectedPages.size > 1 ? `(${selectedPages.size})` : ''}`, destructive: true, icon: <Trash2 size={14} />, onClick: () => performPageAction('delete', menu.pageNum) },
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

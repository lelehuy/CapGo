import { useState, useCallback, useEffect, useRef } from 'react';
import { CanvasPreview } from './components/CanvasPreview';
import { SignaturePad } from './components/SignaturePad';
import logo from './assets/logo.png';
import {
    Layers,
    Paintbrush,
    CheckCircle2,
    Download,
    Copy,
    Trash2,
    FileText,
    Loader2,
    Check,
    Plus,
    Settings,
    Image as ImageIcon,
    PenTool,
    X,
    Play,
    AlertCircle,
    Info,
    Clipboard,
    Upload,
    Sun,
    Moon,
    FolderOpen,
    ExternalLink
} from 'lucide-react';
import { SelectFiles, SelectFile, StampPDF, GetFile, CheckForUpdates, BrowserOpenURL, DownloadUpdate, InstallUpdate } from '../wailsjs/go/main/App';
import { OnFileDrop, OnFileDropOff, LogInfo } from '../wailsjs/runtime/runtime';


interface PdfFileRecord {
    id: string;
    name: string;
    path: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    resultPath?: string;
    stamps: Stamp[];
    selected: boolean;
}

export interface Stamp {
    id: string;
    image: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pageNum: number;
}

interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

function App() {
    const [pdfFiles, setPdfFiles] = useState<PdfFileRecord[]>([]);
    const [activePdfIndex, setActivePdfIndex] = useState<number>(-1);

    // Left Sidebar Resize
    const [leftSidebarWidth, setLeftSidebarWidth] = useState(240);
    const isResizingLeft = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingLeft.current) return;
            // Nav (w-14 = 56px) + Margin (m-4 = 16px * 2 = 32px) = 88px offset
            const newWidth = e.clientX - 88;
            if (newWidth > 180 && newWidth < 500) {
                setLeftSidebarWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            isResizingLeft.current = false;
            document.body.style.cursor = 'default';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const [stampImage, setStampImage] = useState<string>('');
    const [stampPath, setStampPath] = useState<string>('');

    const [isDrawing, setIsDrawing] = useState(false);
    const [activeStampId, setActiveStampId] = useState<string | null>(null);
    const [browserScale, setBrowserScale] = useState(1);
    const [pageHeight, setPageHeight] = useState(0);
    const [jumpToPage, setJumpToPage] = useState<number | null>(null);
    const [activePage, setActivePage] = useState<number>(1);

    // Reset page to 1 when switching PDF files
    useEffect(() => {
        setActivePage(1);
        setActiveStampId(null);
    }, [activePdfIndex]);

    // Notifications
    const [notifications, setNotifications] = useState<Toast[]>([]);

    const notify = useCallback((type: 'success' | 'error' | 'info', message: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setNotifications(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 3000);
    }, []);

    // Clipboard
    const [clipboardStamp, setClipboardStamp] = useState<Stamp | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [viewportCenter, setViewportCenter] = useState({ x: 0, y: 0 });
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');

    const activePdf = activePdfIndex >= 0 ? pdfFiles[activePdfIndex] : null;

    // Undo/Redo History State
    const [past, setPast] = useState<PdfFileRecord[][]>([]);
    const [future, setFuture] = useState<PdfFileRecord[][]>([]);

    const addToHistory = () => {
        setPast(prev => [...prev, pdfFiles]);
        setFuture([]);
    };

    const undo = () => {
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        
        setFuture(prev => [pdfFiles, ...prev]);
        setPdfFiles(previous);
        setPast(newPast);
        notify('info', 'Undo');
    };

    const redo = () => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);

        setPast(prev => [...prev, pdfFiles]);
        setPdfFiles(next);
        setFuture(newFuture);
        notify('info', 'Redo');
    };

    // Global Undo/Redo Shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
             const isMod = e.metaKey || e.ctrlKey;
             if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

             if (isMod && e.key === 'z') {
                 if (e.shiftKey) {
                     e.preventDefault();
                     redo();
                 } else {
                     e.preventDefault();
                     undo();
                 }
             }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [past, future, pdfFiles, notify]); // Dependencies are crucial here


    // Theme Effect
    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.classList.toggle('dark', systemTheme === 'dark');
        } else {
            root.classList.toggle('dark', theme === 'dark');
        }
    }, [theme]);

    // Auto Update Check on Startup
    useEffect(() => {
        const checkAutoUpdate = async () => {
            try {
                const result = await CheckForUpdates();
                setUpdateResult(result);
                if (result.updateAvailable) {
                    setShowAbout(true);
                }
            } catch (err) {
                console.error("Auto-update check failed:", err);
            }
        };

        // Delay slightly for better UX (let the app load first)
        const timer = setTimeout(checkAutoUpdate, 2000);
        return () => clearTimeout(timer);
    }, []);

    const handleFilesAdded = useCallback((paths: string[]) => {
        if (!paths || paths.length === 0) return;

        // Check for duplicates
        const duplicates: string[] = [];
        const newPaths: string[] = [];

        paths.forEach(p => {
            // Check if path already exists in current list
            if (pdfFiles.some(f => f.path === p)) {
                duplicates.push(p);
            } else {
                newPaths.push(p);
            }
        });

        // Notify about duplicates
        if (duplicates.length > 0) {
            const name = duplicates[0].split(/[\\/]/).pop();
            // If we are adding just one file and it's duplicate
            if (duplicates.length === 1 && newPaths.length === 0) {
                notify('info', `File already open: ${name}`);
            } else {
                notify('info', `Skipped ${duplicates.length} duplicate file(s)`);
            }
        }

        if (newPaths.length === 0) return;

        const newRecords: PdfFileRecord[] = newPaths.map((p: string) => ({
            id: Math.random().toString(36).substr(2, 9),
            name: p.split(/[\\/]/).pop() || 'document.pdf',
            path: p,
            status: 'pending',
            stamps: [],
            selected: true
        }));

        setPdfFiles(prev => {
            const next = [...prev, ...newRecords];
            return next;
        });

        // Set active index if it was the first file added
        if (activePdfIndex === -1 && newPaths.length > 0) {
            setActivePdfIndex(0);
        }

        notify('success', `Added ${newPaths.length} file(s)`);
    }, [pdfFiles, activePdfIndex, notify]);

    const handleSelectFiles = async () => {
        try {
            const paths = await SelectFiles("PDF Files (*.pdf)", "*.pdf");
            handleFilesAdded(paths);
        } catch (err) {
            console.error(err);
            notify('error', `Failed to add files: ${err}`);
        }
    };

    const addStampToActive = (imgUrl: string) => {
        if (activePdfIndex === -1) return;
        const newStamp: Stamp = {
            id: Math.random().toString(36).substr(2, 9),
            image: imgUrl,
            x: viewportCenter.x > 0 ? viewportCenter.x : 50,
            y: viewportCenter.y > 0 ? viewportCenter.y : 50,
            width: 150 * 0.7, // Slightly smaller default
            height: 80 * 0.7,
            pageNum: activePage
        };

        setPdfFiles(prev => {
            const next = [...prev];
            next[activePdfIndex] = { ...next[activePdfIndex], stamps: [...next[activePdfIndex].stamps, newStamp] };
            return next;
        });
        setActiveStampId(newStamp.id);
    };

    const handleSaveSignature = (dataUrl: string) => {
        addStampToActive(dataUrl);
        setStampImage(dataUrl);
        setIsDrawing(false);
    };

    const handleSelectStampImage = async () => {
        const selectedPath = await SelectFile("Image Files (*.png;*.jpg;*.jpeg)", "*.png;*.jpg;*.jpeg");
        if (selectedPath) {
            try {
                const data = await GetFile(selectedPath);
                let base64: string;
                if (typeof data === 'string') {
                    const sData = data as string;
                    base64 = sData.startsWith('data:') ? sData : `data:image/png;base64,${sData}`;
                } else {
                    const blob = new Blob([new Uint8Array(data)]);
                    base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                }
                addStampToActive(base64);
                setStampPath(selectedPath);
                setStampImage(base64);
            } catch (err) {
                notify('error', `Error loading stamp image: ${err}`);
            }
        }
    };

    const handleUpdateStamp = useCallback((updatedStamp: Stamp) => {
        if (activePdfIndex === -1) return;
        setPdfFiles(prev => {
            const next = [...prev];
            const stamps = next[activePdfIndex].stamps.map(s => s.id === updatedStamp.id ? updatedStamp : s);
            next[activePdfIndex] = { ...next[activePdfIndex], stamps };
            return next;
        });
    }, [activePdfIndex]);

    const handleCanvasEnvChange = useCallback((scale: number, pHeight: number) => {
        setBrowserScale(scale);
        setPageHeight(pHeight);
    }, []);

    const handleViewportChange = useCallback((x: number, y: number) => {
        // Debounce or just set it? React batching should handle 60fps ok if simple.
        // Actually, we should probably check if meaningful change?
        setViewportCenter({ x, y });
    }, []);



    const doPaste = useCallback(() => {
        if (!clipboardStamp || activePdfIndex === -1) return;
        const newStamp: Stamp = {
            ...clipboardStamp,
            id: Math.random().toString(36).substr(2, 9),
            x: clipboardStamp.x + 20,
            y: clipboardStamp.y + 20,
            pageNum: activePage
        };
        
        addToHistory(); // Save before paste

        setPdfFiles(prev => {
            const next = [...prev];
            next[activePdfIndex] = { ...next[activePdfIndex], stamps: [...next[activePdfIndex].stamps, newStamp] };
            return next;
        });
        setActiveStampId(newStamp.id);
        notify('success', `Pasted stamp onto page ${activePage}`);
    }, [clipboardStamp, activePdfIndex, activePage, notify]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;

            // Prevent shortcuts when typing in inputs
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            // Copy: Cmd+C / Ctrl+C
            if (isMod && (e.key === 'c' || e.code === 'KeyC')) {
                if (!activeStampId) {
                    return;
                }
                if (!activePdf) {
                    return;
                }

                const stamp = activePdf.stamps.find(s => s.id === activeStampId);
                if (stamp) {
                    setClipboardStamp({ ...stamp });
                    notify('info', `Copied: ${stamp.id.substr(0, 4)}...`);
                }
            }

            // Paste: Cmd+V / Ctrl+V
            if (isMod && (e.key === 'v' || e.code === 'KeyV')) {
                if (!clipboardStamp) {
                    return;
                }
                if (activePdfIndex === -1) {
                    return;
                }
                e.preventDefault();
                doPaste();
            }

            // Delete
            if ((e.code === 'Delete' || e.code === 'Backspace') && activeStampId) {
                if (activePdfIndex !== -1) {
                    addToHistory(); // Save before delete
                    setPdfFiles(prev => {
                        const next = [...prev];
                        next[activePdfIndex] = {
                            ...next[activePdfIndex],
                            stamps: next[activePdfIndex].stamps.filter(s => s.id !== activeStampId)
                        };
                        return next;
                    });
                    setActiveStampId(null);
                    notify('info', 'Stamp deleted');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeStampId, activePdfIndex, clipboardStamp, activePdf, activePage, doPaste, notify]);

    // Handle Global File Drag and Drop
    useEffect(() => {
        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer?.types.includes('Files')) {
                setIsDraggingFile(true);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            // Check if we're actually leaving the window or just entering a child element
            if (e.relatedTarget === null || (e.relatedTarget as HTMLElement).nodeName === 'HTML') {
                setIsDraggingFile(false);
            }
        };

        // Prevent default browser behavior for dropped files
        const handleWindowDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingFile(false);
        };

        // Use Wails runtime for reliable file path extraction
        OnFileDrop((x, y, paths) => {
            setIsDraggingFile(false);

            LogInfo(`[Frontend] OnFileDrop triggered. Paths: ${JSON.stringify(paths)}`);

            // Normalize paths: trim whitespace and check extension
            const pdfPaths = paths.filter(p => p && p.trim().toLowerCase().endsWith('.pdf'));

            if (pdfPaths.length > 0) {
                LogInfo(`[Frontend] Accepted ${pdfPaths.length} PDF files`);
                handleFilesAdded(pdfPaths);
            } else if (paths.length > 0) {
                const firstFile = paths[0];
                const ext = firstFile ? (firstFile.split('.').pop() || 'no-ext') : 'unknown';
                LogInfo(`[Frontend] Rejected: ${firstFile} (${ext})`);
                notify('error', `Only PDF files are supported. Detected: ${firstFile ? firstFile.split(/[/\\]/).pop() : 'Unknown'} (${ext})`);
            }
        }, false);

        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleWindowDrop);

        return () => {
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleWindowDrop);
            OnFileDropOff();
        };
    }, [handleFilesAdded, notify]);


    const processFile = async (index: number) => {
        const file = pdfFiles[index];
        if (file.stamps.length === 0) return;

        setPdfFiles(prev => {
            const next = [...prev];
            next[index].status = 'processing';
            return next;
        });

        try {
            const stampsToProcess = file.stamps.map(stamp => {
                let imageSource = stamp.image;
                if (imageSource.startsWith('http://wails.localhost/static/')) {
                    imageSource = decodeURIComponent(imageSource.replace('http://wails.localhost/static/', ''));
                }
                return {
                    image: imageSource,
                    x: stamp.x,
                    y: stamp.y,
                    width: stamp.width,
                    height: stamp.height,
                    pageNum: stamp.pageNum
                };
            });

            const finalPath = await StampPDF(file.path, stampsToProcess);

            setPdfFiles(prev => {
                const next = [...prev];
                next[index].status = 'completed';
                next[index].resultPath = finalPath;
                return next;
            });
            notify('success', `Exported: ${file.name}`);
            return finalPath;
        } catch (err: any) {
            console.error(err);
            setPdfFiles(prev => {
                const next = [...prev];
                next[index].status = 'error';
                return next;
            });
            notify('error', `Failed to export ${file.name}`);
            throw err;
        }
    };

    const processAll = async () => {
        const selected = pdfFiles.filter(f => f.selected);
        if (selected.length === 0) return;

        setIsProcessing(true);
        let successCount = 0;

        for (let i = 0; i < pdfFiles.length; i++) {
            if (pdfFiles[i].selected) {
                try {
                    await processFile(i);
                    successCount++;
                } catch (e) {
                    console.error(e);
                }
            }
        }

        setIsProcessing(false);
        if (successCount > 0) {
            notify('success', `Successfully exported ${successCount} files`);
        }
    };

    const toggleSelect = (index: number) => {
        setPdfFiles(prev => {
            const next = [...prev];
            next[index] = { ...next[index], selected: !next[index].selected };
            return next;
        });
    };

    const toggleSelectAll = (val: boolean) => {
        setPdfFiles(prev => prev.map(f => ({ ...f, selected: val })));
    };

    const removeFile = (id: string) => {
        const index = pdfFiles.findIndex(f => f.id === id);
        let nextFiles = pdfFiles.filter(f => f.id !== id);
        setPdfFiles(nextFiles);

        if (activePdfIndex === index) {
            setActivePdfIndex(nextFiles.length > 0 ? (index === nextFiles.length ? index - 1 : index) : -1);
        } else if (activePdfIndex > index) {
            setActivePdfIndex(prev => prev - 1);
        }
    };

    const handleClearStamps = () => {
        if (activePdfIndex === -1) return;
        addToHistory();
        setPdfFiles(prev => {
            const next = [...prev];
            next[activePdfIndex] = { ...next[activePdfIndex], stamps: [] };
            return next;
        });
        setActiveStampId(null);
    };

    const [showAbout, setShowAbout] = useState(false);
    const [updateResult, setUpdateResult] = useState<any>(null);
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

    // Page Manipulation Logic
    const [copiedPage, setCopiedPage] = useState<{ pdfPath: string, pageNum: number } | null>(null);

    const handlePageAction = async (action: 'delete' | 'duplicate' | 'copy' | 'paste', pageNum: number) => {
        if (activePdfIndex === -1 || !activePdf) return;

        if (action === 'copy') {
            setCopiedPage({ pdfPath: activePdf.path, pageNum });
            notify('info', `Page ${pageNum} copied`);
            return;
        }

        try {
            let newPageOrder: string[] = [];
            const totalPages = activePdf.stamps.reduce((max, s) => Math.max(max, s.pageNum), 0);
            // Wait, we need the ACTUAL total pages from PDF. 
            // Better to pass it from CanvasPreview or get it here.
            // For now, I'll rely on a hack or add a param.
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdatePages = async (newPageOrder: number[]) => {
        if (activePdfIndex === -1 || !activePdf) return;

        try {
            addToHistory(); // Save state before structural change
            setIsProcessing(true);
            const pageStr = newPageOrder.map(p => String(p));
            // @ts-ignore
            const newPath = await window.go.main.App.UpdatePDFPages(activePdf.path, pageStr);

            // Re-map Stamps
            const newStamps: Stamp[] = [];
            // For each page in the new order, find stamps that were on that source page
            newPageOrder.forEach((oldPageNum, newIndex) => {
                const newPageNum = newIndex + 1;
                const stampsOnThisPage = activePdf.stamps.filter(s => s.pageNum === oldPageNum);

                // Copy stamps and update their pageNum
                stampsOnThisPage.forEach(s => {
                    newStamps.push({
                        ...s,
                        id: Math.random().toString(36).substr(2, 9), // New ID for duplicates
                        pageNum: newPageNum
                    });
                });
            });

            setPdfFiles(prev => {
                const next = [...prev];
                next[activePdfIndex] = {
                    ...next[activePdfIndex],
                    path: newPath,
                    stamps: newStamps
                };
                return next;
            });

            notify('success', 'PDF structure updated');
        } catch (err) {
            notify('error', `Failed to update PDF: ${err}`);
        } finally {
            setIsProcessing(false);
        }
    }



    const [isUpdating, setIsUpdating] = useState(false);

    const handleUpdate = async () => {
        if (!updateResult || !updateResult.downloadUrl) {
            // Fallback
            BrowserOpenURL("https://github.com/lelehuy/CapGo/releases");
            return;
        }

        try {
            setIsUpdating(true);
            notify('info', 'Downloading update...');
            // @ts-ignore
            const path = await window.go.main.App.DownloadUpdate(updateResult.downloadUrl);
            notify('success', 'Download complete. Restarting app...');
            // @ts-ignore
            await window.go.main.App.InstallUpdate(path);
            setIsUpdating(false);
        } catch (err) {
            console.error("Update failed:", err);
            notify('error', 'Auto-update failed. Opening browser...');
            BrowserOpenURL(updateResult.releaseUrl || "https://github.com/lelehuy/CapGo/releases");
            setIsUpdating(false);
        }
    };

    const handleCheckUpdate = async () => {
        setIsCheckingUpdate(true);
        setUpdateResult(null);
        try {
            const result = await CheckForUpdates();
            setUpdateResult(result);
        } catch (err) {
            console.error(err);
            setUpdateResult({ error: "Failed to check for updates" });
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    return (
        <div className="flex h-screen w-full bg-[var(--bg-main)] text-[var(--text-main)] font-sans selection:bg-indigo-500/30">
            {/* Left Main Sidebar */}
            <aside className="m-4 w-14 bg-[var(--bg-card)] rounded-[var(--radius-bento)] shadow-[var(--shadow-soft)] border border-[var(--border-main)] flex flex-col items-center py-7 gap-6 shrink-0 z-20 transition-all">
                <button
                    onClick={() => setShowAbout(true)}
                    className="w-10 h-10 bg-[var(--bg-main)] rounded-xl flex items-center justify-center border border-[var(--border-main)] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer group shadow-sm"
                >
                    <img src={logo} className="w-6 h-6 object-contain opacity-80 group-hover:opacity-100 transition-opacity" alt="Logo" />
                </button>
                <nav className="flex flex-col gap-6">
                    <button
                        onClick={() => {
                            if (!activePdf) {
                                notify('info', 'Please import a PDF first to add stamps');
                                return;
                            }
                            setIsDrawing(true);
                        }}
                        className={`p-2.5 rounded-xl transition-all group relative ${!activePdf ? 'opacity-20 cursor-not-allowed text-[var(--text-muted)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent)]'}`}
                        disabled={!activePdf}
                    >
                        <PenTool size={20} strokeWidth={2.5} />
                        <span className="absolute left-full ml-4 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-main)] text-[10px] rounded-lg shadow-xl text-[var(--text-main)] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">Draw Signature</span>
                    </button>
                    <button
                        onClick={() => {
                            if (!activePdf) {
                                notify('info', 'Please import a PDF first to add stamps');
                                return;
                            }
                            handleSelectStampImage();
                        }}
                        className={`p-2.5 rounded-xl transition-all group relative ${!activePdf ? 'opacity-20 cursor-not-allowed text-[var(--text-muted)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent)]'}`}
                        disabled={!activePdf}
                    >
                        <ImageIcon size={20} />
                        <span className="absolute left-full ml-4 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-main)] text-[10px] rounded-lg shadow-xl text-[var(--text-main)] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">Upload Image</span>
                    </button>
                    <div className="w-6 h-px bg-[var(--border-main)] mx-auto my-1" />
                    <button onClick={handleSelectFiles} className="p-2.5 rounded-xl hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-emerald-500 transition-all group relative">
                        <Plus size={20} />
                        <span className="absolute left-full ml-4 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-main)] text-[10px] rounded-lg shadow-xl text-[var(--text-main)] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">Add PDF Files</span>
                    </button>
                </nav>
                <div className="mt-auto">
                    <button
                        onClick={() => setShowSettings(true)}
                        className={`p-2.5 rounded-xl transition-all ${showSettings ? 'bg-indigo-500/10 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </aside>

            {/* Document Queue Sidebar */}
            <aside
                style={{ width: leftSidebarWidth }}
                className="my-4 bg-[var(--bg-card)] rounded-[var(--radius-bento)] shadow-[var(--shadow-soft)] border border-[var(--border-main)] flex flex-col shrink-0 overflow-hidden z-10 transition-all"
            >
                <header className="p-6 h-[72px] flex items-center justify-between bg-[var(--bg-main)]/30 border-b border-[var(--border-main)]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden border border-[var(--border-main)] shrink-0">
                            <img src={logo} className="w-[85%] h-[85%] object-contain" alt="Logo" />
                        </div>
                        <h2 className="text-[13px] font-black uppercase tracking-[0.2em] text-[var(--text-main)]">CapGo</h2>
                    </div>
                </header>

                <div className="p-5 border-b border-[var(--border-main)] bg-[var(--bg-main)]/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={pdfFiles.length > 0 && pdfFiles.every(f => f.selected)}
                            onChange={(e) => toggleSelectAll(e.target.checked)}
                            className="w-4 h-4 rounded-lg border-[var(--border-main)] bg-[var(--bg-main)] text-[var(--accent)] focus:ring-offset-0 focus:ring-0 cursor-pointer transition-all"
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Documents</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-main)] shadow-sm">{pdfFiles.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {pdfFiles.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-center px-6">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-3 border border-indigo-500/20">
                                <Plus size={18} className="text-indigo-500" />
                            </div>
                            <p className="text-[10px] font-medium text-indigo-500/60 leading-relaxed uppercase tracking-widest">No files added</p>
                        </div>
                    ) : (
                        pdfFiles.map((file, idx) => (
                            <div
                                key={idx}
                                onClick={() => setActivePdfIndex(idx)}
                                title={file.name}
                                className={`group relative p-4 rounded-2xl border transition-all cursor-pointer mx-4 mt-2 ${activePdfIndex === idx ? 'bg-[var(--accent)]/5 border-[var(--accent)]/20 shadow-md' : 'bg-[var(--bg-main)]/5 border-transparent hover:bg-[var(--bg-hover)]'}`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={file.selected}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            toggleSelect(idx);
                                        }}
                                        className="mt-1 w-4 h-4 rounded-lg border-[var(--border-main)] bg-[var(--bg-main)] text-[var(--accent)] focus:ring-offset-0 focus:ring-0 cursor-pointer transition-all"
                                    />
                                    <div className="flex-1 min-w-0 pr-6">
                                        <p
                                            className="text-[11px] font-semibold text-[var(--text-main)] truncate group-hover:text-[var(--accent)] transition-colors"
                                        >
                                            {file.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                                                {file.stamps.length} stamps
                                            </p>
                                            {file.status === 'completed' && (
                                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className={`flex items-center gap-1.5 absolute right-2 top-2 transition-all ${activePdfIndex === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            processFile(idx);
                                        }}
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-indigo-600 text-zinc-400 hover:text-white transition-all shadow-xl"
                                        title="Export this file"
                                    >
                                        <Download size={12} />
                                    </button>
                                    {file.status === 'completed' && file.resultPath && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                (window as any).go.main.App.OpenFile(file.resultPath);
                                            }}
                                            className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white transition-all shadow-xl border border-emerald-500/20 hover:border-emerald-500"
                                            title="Open exported file"
                                        >
                                            <FolderOpen size={12} />
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(file.id);
                                        }}
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500 text-zinc-400 hover:text-white transition-all shadow-xl"
                                        title="Remove from list"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <footer className="p-6 bg-[var(--bg-main)]/20 border-t border-[var(--border-main)]">
                    <button
                        onClick={processAll}
                        disabled={isProcessing || !pdfFiles.some(f => f.selected)}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-br from-blue-500 to-[var(--accent)] hover:from-blue-400 hover:to-blue-600 disabled:from-[var(--bg-hover)] disabled:to-[var(--bg-hover)] disabled:text-[var(--text-muted)] text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-[var(--shadow-soft)] shadow-blue-500/20 transition-all active:scale-[0.98] ring-1 ring-white/20 ring-inset"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={16} strokeWidth={3} /> : <Play size={16} fill="currentColor" />}
                        EXPORT ({pdfFiles.filter(f => f.selected).length})
                    </button>
                </footer>
            </aside>

            {/* Left Resize Handle */}
            <div
                className="w-1.5 hover:w-2 bg-transparent cursor-col-resize transition-all z-40 mx-1 flex items-center justify-center group outline-none my-4"
                onMouseDown={(e) => {
                    isResizingLeft.current = true;
                    document.body.style.cursor = 'col-resize';
                    e.preventDefault();
                }}
            >
                <div className="w-0.5 h-8 bg-[var(--border-main)] group-hover:bg-[var(--accent)]/50 rounded-full transition-colors" />
            </div>

            {/* Editor Workspace */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-[var(--bg-main)] m-4 ml-0 rounded-[var(--radius-bento)] shadow-[var(--shadow-soft)] border border-[var(--border-main)]">
                {/* Preview Area */}
                <section className="flex-1 overflow-hidden flex justify-center items-start">
                    {activePdf ? (
                        <div className="w-full h-full animate-in fade-in duration-700">
                            <CanvasPreview
                                pdfPath={activePdf.path}
                                stamps={activePdf.stamps}
                                activeStampId={activeStampId}
                                onUpdateStamp={handleUpdateStamp}
                                onSelectStamp={setActiveStampId}
                                onEnvChange={handleCanvasEnvChange}
                                onPageInView={setActivePage}
                                onViewportChange={handleViewportChange}
                                onUpdatePages={handleUpdatePages}
                                activePage={activePage}
                                jumpToPage={jumpToPage}
                                toolbar={
                                    <div className="flex items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-main)] p-2 rounded-2xl animate-in slide-in-from-top-4 duration-500">
                                        <div className="flex items-center gap-3 px-4 border-r border-[var(--border-main)]">
                                            <div className="flex flex-col">
                                                <h1 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] max-w-[150px] truncate">
                                                    {activePdf.name}
                                                </h1>
                                                {activePdf?.resultPath && (
                                                    <button
                                                        onClick={() => (window as any).go.main.App.OpenFile(activePdf.resultPath)}
                                                        className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white transition-all border border-emerald-500/20 hover:border-emerald-500"
                                                    >
                                                        <ExternalLink size={10} />
                                                        <span className="text-[9px] font-bold uppercase tracking-wide">Open Export</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 bg-black/5 dark:bg-black/40 px-3 py-1.5 rounded-xl border border-[var(--border-main)]">
                                                <span className="text-[9px] font-black text-[var(--text-muted)] uppercase">Jump</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = parseInt((e.target as HTMLInputElement).value);
                                                            if (val > 0) {
                                                                setJumpToPage(val);
                                                                setTimeout(() => setJumpToPage(null), 100);
                                                            }
                                                        }
                                                    }}
                                                    className="w-8 bg-transparent text-[10px] text-center font-black text-[var(--text-main)] focus:outline-none"
                                                    placeholder="1"
                                                />
                                            </div>


                                            <div className="flex items-center gap-1 bg-black/5 dark:bg-black/40 p-1 rounded-xl border border-[var(--border-main)]">
                                                <button
                                                    onClick={() => {
                                                        if (activeStampId && activePdf) {
                                                            const stamp = activePdf.stamps.find(s => s.id === activeStampId);
                                                            if (stamp) {
                                                                setClipboardStamp({ ...stamp });
                                                                notify('info', 'Stamp copied');
                                                            }
                                                        }
                                                    }}
                                                    disabled={!activeStampId}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-indigo-400 disabled:opacity-20 transition-all"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                                <button
                                                    onClick={doPaste}
                                                    disabled={!clipboardStamp}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-indigo-400 disabled:opacity-20 transition-all"
                                                >
                                                    <Clipboard size={14} />
                                                </button>
                                                <div className="w-px h-4 bg-[var(--border-main)] mx-1" />
                                                <button
                                                    onClick={handleClearStamps}
                                                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {stampImage && (
                                            <div className="h-8 w-8 bg-black/5 dark:bg-black/40 rounded-xl p-1.5 border border-[var(--border-main)] overflow-hidden ml-2 shadow-inner">
                                                <img src={stampImage} className={`w-full h-full object-contain ${theme === 'dark' ? 'invert' : ''} opacity-80`} alt="Stamp" />
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        </div>
                    ) : (
                        <div className="h-full flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-1000 ease-out">
                            <div className="relative group">
                                {/* Soft Glow Effect */}
                                <div className="absolute -inset-4 bg-indigo-500/20 rounded-[3rem] blur-2xl opacity-100 transition-opacity duration-700" />

                                <div className="relative w-24 h-24 bg-indigo-500/10 rounded-[2.5rem] flex items-center justify-center mb-8 border border-indigo-500/20 shadow-[0_20px_50px_rgba(79,70,229,0.15)] transition-transform duration-500 group-hover:scale-105 active:scale-95">
                                    <Layers size={32} className="text-indigo-500 transition-colors duration-500" />
                                </div>
                            </div>

                            <h2 className="text-xl font-black text-[var(--text-main)] mb-2 uppercase tracking-[0.2em]">Workspace Ready</h2>
                            <p className="text-[var(--text-muted)] dark:text-zinc-400/80 max-w-[240px] text-[10px] font-bold uppercase tracking-widest leading-relaxed mb-8">
                                Import documents and add a signature tool from the left sidebar to begin.
                            </p>

                            <button
                                onClick={handleSelectFiles}
                                className="px-8 py-3.5 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-[0_15px_30px_-5px_rgba(79,70,229,0.3)] hover:shadow-[0_20px_40px_-5px_rgba(79,70,229,0.4)] transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-3 group"
                            >
                                <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                                Import Your First PDF
                            </button>
                        </div>
                    )}
                </section>

            </main>

            {/* About Modal */}
            {
                showAbout && (
                    <div className="fixed inset-0 z-[100] bg-black/40 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[var(--radius-bento)] p-12 w-full max-w-md shadow-[var(--shadow-soft)] relative overflow-hidden flex flex-col items-center text-center">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 opacity-50"></div>

                            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg overflow-hidden border border-white/10 mb-6">
                                <img src={logo} className="w-[85%] h-[85%] object-contain" alt="Logo" />
                            </div>

                            <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-1">CapGo</h2>
                            <p className="text-zinc-500 text-xs font-mono mb-8">Version 1.0.5-production</p>

                            {!updateResult ? (
                                <button
                                    onClick={handleCheckUpdate}
                                    disabled={isCheckingUpdate}
                                    className="px-8 py-3 bg-[var(--bg-main)] hover:bg-[var(--bg-hover)] border border-[var(--border-main)] rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] transition-all flex items-center gap-3 group shadow-sm"
                                >
                                    {isCheckingUpdate ? <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /> : <Download size={16} className="text-[var(--text-muted)] group-hover:text-[var(--accent)]" />}
                                    {isCheckingUpdate ? 'CHECKING...' : 'CHECK FOR UPDATES'}
                                </button>
                            ) : (
                                <div className="w-full bg-[var(--bg-main)] rounded-2xl p-6 border border-[var(--border-main)] text-left shadow-inner">
                                    {updateResult.error ? (
                                        <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                                            <AlertCircle size={14} />
                                            <span>{updateResult.error}</span>
                                        </div>
                                    ) : updateResult.updateAvailable ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-emerald-400 text-xs font-bold uppercase">New Update Available!</span>
                                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono rounded">{updateResult.latestVersion}</span>
                                            </div>
                                            <div className="text-[10px] text-zinc-500 max-h-32 overflow-y-auto w-full custom-scrollbar bg-black/20 p-2 rounded">
                                                <p className="font-bold mb-1">Release Notes:</p>
                                                <pre className="whitespace-pre-wrap font-sans">{updateResult.releaseNotes}</pre>
                                            </div>
                                            <button
                                                onClick={handleUpdate}
                                                disabled={isUpdating}
                                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} 
                                                {isUpdating ? 'DOWNLOADING...' : 'UPDATE NOW'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 py-2">
                                            <CheckCircle2 size={24} className="text-emerald-500" />
                                            <span className="text-zinc-400 text-xs font-medium">You are using the latest version.</span>
                                            <span className="text-zinc-600 text-[10px] font-mono">Current: {updateResult.currentVersion}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-8 pt-6 border-t border-zinc-900 w-full flex justify-between items-center">
                                <p className="text-[10px] text-zinc-600">© 2026 leh. All rights reserved.</p>
                                <button
                                    onClick={() => setShowAbout(false)}
                                    className="text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Sign Modal */}
            {
                isDrawing && (
                    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-300">
                            <SignaturePad onSave={handleSaveSignature} onCancel={() => setIsDrawing(false)} />
                        </div>
                    </div>
                )
            }

            {/* Settings Modal */}
            {
                showSettings && (
                    <div className="fixed inset-0 z-[100] bg-black/40 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[var(--radius-bento)] p-12 w-full max-w-lg shadow-[var(--shadow-soft)] relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-50"></div>
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">App Settings</h2>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[var(--bg-hover)] rounded-full transition-colors">
                                    <X size={20} className="text-[var(--text-muted)]" />
                                </button>
                            </div>

                            <div className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-[var(--text-main)]">Export Quality</p>
                                        <p className="text-[11px] text-[var(--text-muted)]">Higher quality increases file size</p>
                                    </div>
                                    <select className="bg-[var(--bg-side)] border border-[var(--border-main)] rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--text-main)] focus:outline-none">
                                        <option>Standard (72 DPI)</option>
                                        <option selected>High HD (300 DPI)</option>
                                        <option>Ultra (600 DPI)</option>
                                    </select>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-[var(--text-main)]">Auto-Save Layout</p>
                                        <p className="text-[11px] text-[var(--text-muted)]">Save progress automatically</p>
                                    </div>
                                    <div className="w-10 h-5 bg-[var(--accent)] rounded-full relative transition-all">
                                        <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <p className="font-bold text-[var(--text-main)]">Appearance</p>
                                        <p className="text-[11px] text-[var(--text-muted)]">Choose your preferred application theme</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {(['light', 'dark', 'system'] as const).map((t) => (
                                            <button
                                                key={t}
                                                onClick={() => setTheme(t)}
                                                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${theme === t ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]' : 'bg-transparent border-[var(--border-main)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'}`}
                                            >
                                                {t === 'light' && <Sun size={16} />}
                                                {t === 'dark' && <Moon size={16} />}
                                                {t === 'system' && <Settings size={16} />}
                                                <span className="text-[10px] font-bold uppercase tracking-widest">{t}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-[var(--border-main)]">
                                    <p className="text-[10px] text-[var(--text-muted)] font-mono">Build Version: 1.0.5-production</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowSettings(false)}
                                className="w-full mt-10 py-3 bg-[var(--bg-side)] hover:bg-[var(--bg-hover)] text-[var(--text-main)] rounded-xl text-xs font-bold transition-all border border-[var(--border-main)]"
                            >
                                CLOSE
                            </button>
                        </div>
                    </div>
                )
            }
            {/* Notifications Overlay */}
            <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 pointer-events-none">
                {notifications.map(n => (
                    <div
                        key={n.id}
                        className={`px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/10 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300 pointer-events-auto ${n.type === 'success' ? 'bg-emerald-500/10 text-[var(--success-pastel)]' :
                            n.type === 'error' ? 'bg-red-500/10 text-red-400' :
                                'bg-indigo-500/10 text-indigo-400'
                            }`}
                    >
                        {n.type === 'success' && <CheckCircle2 size={18} />}
                        {n.type === 'error' && <AlertCircle size={18} />}
                        {n.type === 'info' && <Info size={18} />}
                        <span className="text-[11px] font-bold tracking-wide uppercase">{n.message}</span>
                    </div>
                ))}
            </div>
            {/* Drag and Drop Overlay */}
            {
                isDraggingFile && (
                    <div className="fixed inset-0 z-[300] bg-indigo-600/20 backdrop-blur-sm border-4 border-dashed border-indigo-500 m-4 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
                        <div className="bg-zinc-950 p-8 rounded-full shadow-2xl mb-6">
                            <Upload size={48} className="text-indigo-400 animate-bounce" />
                        </div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-widest">Drop PDF Files</h2>
                        <p className="text-indigo-300 font-bold mt-2 uppercase tracking-tighter">Add to your workspace</p>
                    </div>
                )
            }
        </div >
    );
}

export default App;

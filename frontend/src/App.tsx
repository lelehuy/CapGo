import { useState, useCallback, useEffect } from 'react';
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
    Upload
} from 'lucide-react';
import { SelectFiles, SelectFile, StampPDF, GetFile } from '../wailsjs/go/main/App';
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

    const activePdf = activePdfIndex >= 0 ? pdfFiles[activePdfIndex] : null;

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

    const handleCheckUpdate = async () => {
        setIsCheckingUpdate(true);
        setUpdateResult(null);
        try {
            // @ts-ignore
            const result = await window.go.main.App.CheckForUpdates();
            setUpdateResult(result);
        } catch (err) {
            console.error(err);
            setUpdateResult({ error: "Failed to check for updates" });
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    return (
        <div className="flex h-screen w-full bg-[#050505] text-white font-sans selection:bg-indigo-500/30">
            {/* Left Main Sidebar */}
            <aside className="w-16 border-r border-zinc-900 bg-[#080808] flex flex-col items-center py-6 gap-8 shrink-0">
                <button
                    onClick={() => setShowAbout(true)}
                    className="w-10 h-10 bg-zinc-900/50 rounded-xl flex items-center justify-center border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all cursor-pointer group"
                >
                    <img src={logo} className="w-6 h-6 object-contain opacity-70 group-hover:opacity-100 transition-opacity" alt="Logo" />
                </button>
                <nav className="flex flex-col gap-6">
                    <button onClick={() => setIsDrawing(true)} className="p-2.5 rounded-xl hover:bg-zinc-900 text-zinc-500 hover:text-indigo-400 transition-all group relative">
                        <PenTool size={20} />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Draw Signature</span>
                    </button>
                    <button onClick={handleSelectStampImage} className="p-2.5 rounded-xl hover:bg-zinc-900 text-zinc-500 hover:text-indigo-400 transition-all group relative">
                        <ImageIcon size={20} />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Upload Image</span>
                    </button>
                    <div className="w-8 h-px bg-zinc-900 mx-auto my-2" />
                    <button onClick={handleSelectFiles} className="p-2.5 rounded-xl hover:bg-zinc-900 text-zinc-500 hover:text-emerald-400 transition-all group relative">
                        <Plus size={20} />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Add PDF Files</span>
                    </button>
                </nav>
                <div className="mt-auto">
                    <button
                        onClick={() => setShowSettings(true)}
                        className={`p-2.5 rounded-xl transition-all ${showSettings ? 'bg-zinc-900 text-indigo-400' : 'text-zinc-700 hover:text-zinc-500'}`}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </aside>

            {/* Document Queue Sidebar */}
            <aside className="w-72 border-r border-zinc-900 bg-[#0A0A0A] flex flex-col shrink-0">
                <header className="p-5 h-[72px] border-b border-zinc-900 flex items-center justify-between bg-zinc-950/20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-lg overflow-hidden border border-white/10 shrink-0">
                            <img src={logo} className="w-[85%] h-[85%] object-contain" alt="Logo" />
                        </div>
                        <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-white">CapGo</h2>
                    </div>
                </header>

                <div className="p-4 border-b border-zinc-900/50 bg-zinc-900/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={pdfFiles.length > 0 && pdfFiles.every(f => f.selected)}
                            onChange={(e) => toggleSelectAll(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-offset-0 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Documents</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-500">{pdfFiles.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {pdfFiles.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center text-center px-6">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900/50 flex items-center justify-center mb-3 border border-zinc-800/50">
                                <Plus size={18} className="text-zinc-700" />
                            </div>
                            <p className="text-[10px] font-medium text-zinc-600 leading-relaxed uppercase tracking-widest">No files added</p>
                        </div>
                    ) : (
                        pdfFiles.map((file, idx) => (
                            <div
                                key={idx}
                                onClick={() => setActivePdfIndex(idx)}
                                className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${activePdfIndex === idx ? 'bg-indigo-600/10 border-indigo-500/50 shadow-[0_0_20px_rgba(79,70,229,0.05)]' : 'border-transparent hover:bg-zinc-900/50 hover:border-zinc-800'}`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={file.selected}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            toggleSelect(idx);
                                        }}
                                        className="mt-0.5 w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-offset-0 focus:ring-0 cursor-pointer"
                                    />
                                    <div className="flex-1 min-w-0 pr-6">
                                        <p className="text-[11px] font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
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

                <footer className="p-4 bg-zinc-950/50 border-t border-zinc-900">
                    <button
                        onClick={processAll}
                        disabled={isProcessing || !pdfFiles.some(f => f.selected)}
                        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-550 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-[11px] font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10 transition-all active:scale-[0.98]"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} fill="currentColor" />}
                        EXPORT ({pdfFiles.filter(f => f.selected).length})
                    </button>
                </footer>
            </aside>

            {/* Editor Workspace */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0A0A0A]">
                {/* Top Control Bar */}
                <div className="h-14 border-b border-zinc-900 bg-zinc-950/40 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-8">
                        <div className="flex flex-col">
                            <h1 className="text-[11px] font-bold text-zinc-100 truncate max-w-[300px] tracking-tight">
                                {activePdf ? activePdf.name : 'No Active Document'}
                            </h1>
                            {activePdf?.resultPath && (
                                <button
                                    onClick={() => (window as any).go.main.App.OpenFile(activePdf.resultPath)}
                                    className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors mt-0.5"
                                >
                                    <Check size={10} /> OPEN EXPORTED
                                </button>
                            )}
                        </div>

                        {activePdf && (
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2.5 bg-zinc-900/50 px-3 py-1 rounded-lg border border-zinc-800/50 shadow-inner">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.1em]">Jump to</span>
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
                                        className="w-10 h-6 bg-zinc-950 border border-zinc-800/50 rounded text-[10px] text-center font-bold font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-200"
                                        placeholder="1"
                                    />
                                </div>

                                <div className="flex items-center gap-2.5 bg-zinc-900/50 px-3 py-1 rounded-lg border border-zinc-800/50 shadow-inner">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.1em]">Selected</span>
                                    <div className={`w-2 h-2 rounded-full ${activeStampId ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-800'}`} />
                                    <span className="text-[10px] font-mono text-zinc-400 min-w-[60px]">
                                        {activeStampId ? activeStampId.substr(0, 8) : 'NONE'}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                                    <button
                                        onClick={() => {
                                            if (activeStampId && activePdf) {
                                                const stamp = activePdf.stamps.find(s => s.id === activeStampId);
                                                if (stamp) {
                                                    setClipboardStamp({ ...stamp });
                                                    notify('info', 'Stamp copied to clipboard');
                                                }
                                            }
                                        }}
                                        disabled={!activeStampId}
                                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-indigo-400 disabled:opacity-20 transition-all group relative"
                                        title="Copy selected stamp"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        onClick={doPaste}
                                        disabled={!clipboardStamp}
                                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-indigo-400 disabled:opacity-20 transition-all group relative"
                                        title="Paste stamp"
                                    >
                                        <Clipboard size={16} />
                                    </button>
                                </div>

                                <button
                                    onClick={handleClearStamps}
                                    className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-600 hover:text-red-400 transition-all group relative"
                                    title="Clear all stamps"
                                >
                                    <Trash2 size={16} />
                                    <span className="absolute top-full mt-2 right-0 px-2 py-1 bg-zinc-800 text-[9px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-2xl border border-zinc-700 text-zinc-300 font-bold uppercase tracking-tighter">Clear All Stamps</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">

                        {stampImage && (
                            <div className="h-8 w-8 bg-zinc-900 rounded-lg p-1.5 border border-zinc-800 overflow-hidden ring-1 ring-zinc-700">
                                <img src={stampImage} className="w-full h-full object-contain invert" alt="Stamp" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Preview Area */}
                <section className="flex-1 overflow-auto p-12 flex justify-center items-start custom-scrollbar">
                    {activePdf ? (
                        <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
                            <CanvasPreview
                                pdfPath={activePdf.path}
                                stamps={activePdf.stamps}
                                activeStampId={activeStampId}
                                onUpdateStamp={handleUpdateStamp}
                                onSelectStamp={setActiveStampId}
                                onEnvChange={handleCanvasEnvChange}
                                onPageInView={setActivePage}
                                onViewportChange={handleViewportChange}
                                activePage={activePage}
                                jumpToPage={jumpToPage}
                            />
                        </div>
                    ) : (
                        <div className="h-full flex-1 flex flex-col items-center justify-center text-center opacity-40">
                            <div className="w-32 h-32 bg-zinc-900 rounded-full flex items-center justify-center mb-8 ring-1 ring-zinc-800 shadow-2xl">
                                <Layers size={48} className="text-zinc-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Workspace Ready</h2>
                            <p className="text-zinc-500 max-w-xs text-sm">
                                Import documents and add a signature tool from the left sidebar to begin.
                            </p>
                        </div>
                    )}
                </section>

            </main>

            {/* About Modal */}
            {showAbout && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-10 w-full max-w-md shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500"></div>

                        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg overflow-hidden border border-white/10 mb-6">
                            <img src={logo} className="w-[85%] h-[85%] object-contain" alt="Logo" />
                        </div>

                        <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-1">CapGo</h2>
                        <p className="text-zinc-500 text-xs font-mono mb-8">Version 1.0.4-production</p>

                        {!updateResult ? (
                            <button
                                onClick={handleCheckUpdate}
                                disabled={isCheckingUpdate}
                                className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-bold transition-all flex items-center gap-2 group"
                            >
                                {isCheckingUpdate ? <Loader2 size={14} className="animate-spin text-zinc-400" /> : <Download size={14} className="text-zinc-400 group-hover:text-emerald-400" />}
                                {isCheckingUpdate ? 'CHECKING...' : 'CHECK FOR UPDATES'}
                            </button>
                        ) : (
                            <div className="w-full bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 text-left">
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
                                            onClick={() => (window as any).go.main.App.BrowserOpenURL(updateResult.releaseUrl)}
                                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                                        >
                                            <Download size={12} /> UPDATE NOW
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
                            <p className="text-[10px] text-zinc-600">© 2026 LeleHuy. All rights reserved.</p>
                            <button
                                onClick={() => setShowAbout(false)}
                                className="text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sign Modal */}
            {isDrawing && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-8 w-full max-w-2xl shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-3">
                                <PenTool className="text-indigo-400" /> Draw Signature
                            </h2>
                            <button onClick={() => setIsDrawing(false)} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
                                <Plus className="rotate-45 text-zinc-500" />
                            </button>
                        </div>
                        <SignaturePad onSave={handleSaveSignature} onCancel={() => setIsDrawing(false)} />
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                    <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-10 w-full max-w-lg shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-bold tracking-tight">App Settings</h2>
                            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
                                <X size={20} className="text-zinc-500" />
                            </button>
                        </div>

                        <div className="space-y-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-zinc-100">Export Quality</p>
                                    <p className="text-[11px] text-zinc-500">Higher quality increases file size</p>
                                </div>
                                <select className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none">
                                    <option>Standard (72 DPI)</option>
                                    <option selected>High HD (300 DPI)</option>
                                    <option>Ultra (600 DPI)</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-zinc-100">Auto-Save Layout</p>
                                    <p className="text-[11px] text-zinc-500">Save progress automatically</p>
                                </div>
                                <div className="w-10 h-5 bg-indigo-600 rounded-full relative">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-900">
                                <p className="text-[10px] text-zinc-600 font-mono">Build Version: 1.0.4-production</p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowSettings(false)}
                            className="w-full mt-10 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-xs font-bold transition-all border border-zinc-800"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            )}
            {/* Notifications Overlay */}
            <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 pointer-events-none">
                {notifications.map(n => (
                    <div
                        key={n.id}
                        className={`px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/10 flex items-center gap-3 animate-in slide-in-from-right-10 fade-in duration-300 pointer-events-auto ${n.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
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
            {isDraggingFile && (
                <div className="fixed inset-0 z-[300] bg-indigo-600/20 backdrop-blur-sm border-4 border-dashed border-indigo-500 m-4 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
                    <div className="bg-zinc-950 p-8 rounded-full shadow-2xl mb-6">
                        <Upload size={48} className="text-indigo-400 animate-bounce" />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-widest">Drop PDF Files</h2>
                    <p className="text-indigo-300 font-bold mt-2 uppercase tracking-tighter">Add to your workspace</p>
                </div>
            )}
        </div>
    );
}

export default App;

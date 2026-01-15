import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Trash2, Check, X, ShieldCheck, PenTool } from 'lucide-react';
import { LogInfo } from '../../wailsjs/runtime/runtime';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, onCancel }) => {
  const sigCanvas = useRef<SignatureCanvas>(null);

  const clear = () => {
    sigCanvas.current?.clear();
  };

  const save = () => {
    if (sigCanvas.current?.isEmpty()) {
      console.log("Canvas is empty");
      LogInfo("SignaturePad: Canvas is empty");
      return;
    }

    try {
      // getTrimmedCanvas ensures we don't have huge white margins
      const dataUrl = sigCanvas.current?.toDataURL('image/png');
      console.log("Signature saved:", dataUrl?.substring(0, 50) + "...");
      LogInfo(`SignaturePad: Signature generated (len: ${dataUrl?.length})`);

      if (dataUrl) {
        onSave(dataUrl);
      } else {
        LogInfo("SignaturePad: dataUrl is null/undefined");
      }
    } catch (e) {
      console.error("Signature save error:", e);
      LogInfo(`SignaturePad: Save Error: ${e}`);
    }
  };

  return (
    <div className="flex flex-col gap-8 p-10 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[var(--radius-bento)] shadow-[var(--shadow-soft)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[var(--accent)] to-indigo-400 opacity-50"></div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[var(--accent)]/10 rounded-xl flex items-center justify-center text-[var(--accent)]">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="text-[var(--text-main)] font-black text-sm uppercase tracking-widest">Create Signature</h3>
            <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-[0.2em] mt-0.5">Digital Specimen</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-3 hover:bg-[var(--bg-hover)] rounded-2xl transition-all text-[var(--text-muted)] hover:text-[var(--text-main)] shadow-sm border border-transparent hover:border-[var(--border-main)]"
        >
          <X size={20} />
        </button>
      </div>

      <div className="bg-white rounded-[2rem] overflow-hidden border border-[var(--border-main)] shadow-inner group relative">
        <SignatureCanvas
          ref={sigCanvas}
          penColor="#09090b" // Zinc-950 for deep black ink
          velocityFilterWeight={0.7} // Better smoothing
          minWidth={1.2}
          maxWidth={2.8}
          canvasProps={{
            className: "w-full h-64 cursor-crosshair transition-opacity group-active:opacity-90"
          }}
        />
        <div className="absolute bottom-4 right-4 pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
          <PenTool size={20} className="text-zinc-400" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-6">
        <button
          onClick={clear}
          className="flex items-center gap-3 px-7 py-4 text-xs font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/5 rounded-2xl transition-all border border-transparent hover:border-red-500/10"
        >
          <Trash2 size={18} />
          Clear
        </button>
        <button
          onClick={() => {
            console.log("SignaturePad: Confirm button clicked");
            save();
          }}
          className="flex-1 flex items-center justify-center gap-3 px-8 py-4 text-xs font-black uppercase tracking-widest bg-[var(--accent)] hover:opacity-90 text-white rounded-2xl transition-all shadow-xl shadow-[var(--accent)]/20 active:scale-[0.98]"
        >
          <Check size={18} />
          Use Signature
        </button>
      </div>
    </div>
  );
};

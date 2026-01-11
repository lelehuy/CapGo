import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Trash2, Check, X, ShieldCheck } from 'lucide-react';
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
    <div className="flex flex-col gap-6 p-8 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border-indigo-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600/20 rounded-lg flex items-center justify-center text-indigo-400">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3 className="text-zinc-100 font-bold text-sm tracking-tight">Create Signature</h3>
            <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Digital Specimen</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-zinc-800 rounded-xl transition-all text-zinc-500 hover:text-zinc-100"
        >
          <X size={20} />
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-zinc-700 shadow-inner group">
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
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          onClick={clear}
          className="flex items-center gap-2 px-6 py-3 text-xs font-bold text-zinc-400 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all border border-transparent hover:border-red-500/20"
        >
          <Trash2 size={15} />
          Clear Canvas
        </button>
        <button
          onClick={() => {
            console.log("SignaturePad: Confirm button clicked");
            save();
          }}
          className="flex-1 flex items-center justify-center gap-2 px-8 py-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Check size={15} />
          Confirm & Use Signature
        </button>
      </div>
    </div>
  );
};

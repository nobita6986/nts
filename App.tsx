
import React, { useState, useRef, useCallback, FC, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { generateImageFromPrompt } from './services/geminiService';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPES & CONSTANTS ---
export interface ImageFile {
  name: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
}

interface ScenePrompt {
  id: number;
  phase: string;
  imagePrompt: string;
  videoPrompt: string;
  generatedImageUrl?: string;
  isLoading?: boolean;
  generationFailed?: boolean;
}

interface Phase {
  phase: string;
  ratio: number;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  persistent?: boolean;
}

const PHASES: Phase[] = [
    { phase: "Hook", ratio: 0.05 },
    { phase: "Quest", ratio: 0.15 },
    { phase: "Conflict", ratio: 0.25 },
    { phase: "Innovation", ratio: 0.25 },
    { phase: "Civilization", ratio: 0.20 },
    { phase: "Reflection", ratio: 0.10 }
];

const STYLE_LOCK = `Ultra-realistic prehistoric ASMR cinematic documentary.\nPrimary character strictly matches 3 uploaded references (face, hair, scars, outfit) to ensure consistency. Supporting characters follow same style but not identity-locked. Lighting: warm amber rimlight + cool fill, fog haze. 45mm lens f/2.0 shallow DOF, film grain subtle, amber-teal tone.`;

const SCENE_DURATION_SECONDS = 8;
const MAX_REFERENCE_IMAGES = 3;
const MAX_CONCURRENT_GENERATIONS = 4;


// --- UTILITY FUNCTIONS ---
const fileToDataUrl = (file: File): Promise<{ dataUrl: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};


// --- UI ICONS ---
const UploadIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
  </svg>
);

const CopyIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
);

const DownloadIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const SpinnerIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const KeyIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
);

const TrashIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.124-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.077-2.09.921-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
);

const RegenerateIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0 8.25 8.25 0 0 0 0-11.667l-3.182-3.182m0 0-3.182 3.182m7.5-3.182-3.182 3.182" />
    </svg>
);

const SparklesIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
);

const XMarkIcon: FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

// --- TOAST COMPONENTS ---

const Toast: FC<{ toast: ToastMessage; onClose: (id: string) => void }> = ({ toast, onClose }) => {
    const bgColor = {
        success: 'bg-emerald-900/90 border-emerald-700',
        error: 'bg-red-900/90 border-red-700',
        warning: 'bg-amber-900/90 border-amber-700',
        info: 'bg-blue-900/90 border-blue-700',
    }[toast.type];

    const iconColor = {
        success: 'text-emerald-400',
        error: 'text-red-400',
        warning: 'text-amber-400',
        info: 'text-blue-400',
    }[toast.type];

    return (
        <div className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 ${bgColor} border backdrop-blur-sm p-4 transition-all animate-fade-in`}>
            <div className="flex items-start">
                <div className="flex-shrink-0">
                    {/* Simple conditional icons */}
                    {toast.type === 'success' && <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {toast.type === 'error' && <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {toast.type === 'warning' && <svg className={`h-6 w-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                </div>
                <div className="ml-3 w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-gray-100">{toast.title}</p>
                    <p className="mt-1 text-sm text-gray-300 whitespace-pre-line">{toast.message}</p>
                </div>
                <div className="ml-4 flex flex-shrink-0">
                    <button
                        type="button"
                        className="inline-flex rounded-md text-gray-400 hover:text-gray-200 focus:outline-none"
                        onClick={() => onClose(toast.id)}
                    >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const ToastContainer: FC<{ toasts: ToastMessage[]; removeToast: (id: string) => void }> = ({ toasts, removeToast }) => {
    return (
        <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 sm:p-6 lg:items-end w-full sm:w-auto pointer-events-none">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onClose={removeToast} />
            ))}
        </div>
    );
};


// --- CHILD COMPONENTS ---

interface ControlPanelProps {
  scenario: string;
  setScenario: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  referenceImages: ImageFile[];
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBuildPrompts: () => void;
  isBuilding: boolean;
  scriptFileName: string | null;
  onScriptUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveScript: () => void;
  hasApiKey: boolean;
  onSelectKey: () => void;
}
const ControlPanel: FC<ControlPanelProps> = ({ 
    scenario, setScenario, duration, setDuration, referenceImages, onImageUpload, 
    onBuildPrompts, isBuilding, scriptFileName, onScriptUpload, onRemoveScript,
    hasApiKey, onSelectKey
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const canBuild = useMemo(() => referenceImages.length === MAX_REFERENCE_IMAGES && (!!scriptFileName || scenario.trim() !== "") && duration > 0, [referenceImages, scenario, duration, scriptFileName]);

  return (
    <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl flex flex-col gap-6 sticky top-6">
      <h2 className="text-xl font-bold text-emerald-400">1. Setup</h2>
      
      {!hasApiKey && (
         <div className="bg-amber-900/30 border border-amber-700/50 p-4 rounded-lg">
             <p className="text-amber-200 text-sm mb-3">A paid API key is required for high-quality image generation.</p>
             <button 
                onClick={onSelectKey}
                className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-sm font-medium transition flex items-center justify-center gap-2"
             >
                 <KeyIcon className="h-4 w-4" />
                 Select API Key
             </button>
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="block mt-2 text-xs text-amber-400 hover:text-amber-300 text-center">Billing Documentation</a>
         </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">📸 Upload {MAX_REFERENCE_IMAGES} Character Images</label>
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md cursor-pointer hover:border-emerald-500 transition-colors"
        >
          <div className="space-y-1 text-center">
            <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
            <p className="text-sm text-slate-400">Click to upload files</p>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" />
        {referenceImages.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            {referenceImages.map((img) => (
              <img key={img.name} src={img.dataUrl} alt={img.name} className="rounded-md object-cover aspect-square" />
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="scenario" className="block text-sm font-medium text-slate-300 mb-2">📜 Scenario / Topic</label>
        <textarea
          id="scenario"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="e.g., A lone hunter tracking a mammoth"
          rows={3}
          className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition disabled:bg-slate-800/50 disabled:cursor-not-allowed"
          disabled={!!scriptFileName}
        ></textarea>
      </div>

      <div className="relative flex items-center">
          <div className="flex-grow border-t border-slate-700"></div>
          <span className="flex-shrink mx-4 text-slate-500 text-sm font-semibold">OR</span>
          <div className="flex-grow border-t border-slate-700"></div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">📄 Upload Script (.txt)</label>
        {scriptFileName ? (
            <div className="flex items-center justify-between bg-slate-800 p-3 rounded-md border border-emerald-800">
                <span className="text-sm text-emerald-300 truncate font-medium">{scriptFileName}</span>
                <button onClick={onRemoveScript} className="text-slate-400 hover:text-red-500 transition-colors ml-2" aria-label="Remove script">
                    <TrashIcon className="h-5 w-5" />
                </button>
            </div>
        ) : (
            <div 
              onClick={() => scriptInputRef.current?.click()}
              className="mt-1 flex justify-center px-6 py-4 border-2 border-slate-600 border-dashed rounded-md cursor-pointer hover:border-emerald-500 transition-colors"
            >
              <div className="space-y-1 text-center">
                 <UploadIcon className="mx-auto h-8 w-8 text-slate-400" />
                 <p className="text-sm text-slate-400">Click to upload a .txt file</p>
              </div>
            </div>
        )}
        <input ref={scriptInputRef} type="file" accept=".txt,text/plain" onChange={onScriptUpload} className="hidden" />
      </div>


      <div>
        <label htmlFor="duration" className="block text-sm font-medium text-slate-300 mb-2">⏱️ Video Duration (minutes)</label>
        <input
          id="duration"
          type="number"
          min="1"
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value, 10))}
          className="w-full bg-slate-800 border border-slate-700 p-3 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition disabled:bg-slate-800/50 disabled:cursor-not-allowed"
          disabled={!!scriptFileName}
        />
         {scriptFileName && <p className="text-xs text-slate-400 mt-2">Duration is automatically calculated from the script.</p>}
      </div>

      <button
        onClick={onBuildPrompts}
        disabled={!canBuild || isBuilding || !hasApiKey}
        className="w-full py-3 px-4 rounded-md font-semibold text-black bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed transition-all flex items-center justify-center"
      >
        {isBuilding ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : null}
        {isBuilding ? 'Generating...' : 'Generate Prompts'}
      </button>
    </div>
  );
};


interface PromptCardProps {
    prompt: ScenePrompt;
    onGenerateImage: (id: number) => void;
    isBatchGenerating: boolean;
}
const PromptCard: FC<PromptCardProps> = ({ prompt, onGenerateImage, isBatchGenerating }) => {
    const [copied, setCopied] = useState('');

    const handleCopy = (text: string, type: string) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(''), 2000);
    };
    
    const handleImageDownload = () => {
        if (!prompt.generatedImageUrl) return;
        const a = document.createElement('a');
        a.href = prompt.generatedImageUrl;
        a.download = `scene-${prompt.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="bg-slate-950/30 border border-slate-800 p-4 rounded-xl transition-all hover:border-slate-700">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-emerald-400">Scene {prompt.id}</h3>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{prompt.phase}</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {/* Image Prompt Section */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-slate-300">Image Prompt</h4>
                        <button onClick={() => handleCopy(prompt.imagePrompt, 'image')} className="text-slate-400 hover:text-white transition">
                            {copied === 'image' ? 'Copied!' : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap bg-slate-800/50 p-3 rounded-md font-mono text-slate-400 h-32 overflow-y-auto">{prompt.imagePrompt}</pre>
                </div>
                
                {/* Video Prompt Section */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-slate-300">Video Prompt</h4>
                        <button onClick={() => handleCopy(prompt.videoPrompt, 'video')} className="text-slate-400 hover:text-white transition">
                            {copied === 'video' ? 'Copied!' : <CopyIcon className="h-4 w-4" />}
                        </button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap bg-slate-800/50 p-3 rounded-md font-mono text-slate-400 h-32 overflow-y-auto">{prompt.videoPrompt}</pre>
                </div>
            </div>

            {/* Generation & Preview Area */}
            <div className="mt-4 pt-4 border-t border-slate-800">
                {prompt.generatedImageUrl ? (
                    <div className="relative group rounded-md overflow-hidden bg-black/20">
                         <img src={prompt.generatedImageUrl} alt="Generated scene" className="w-full h-auto object-contain max-h-[400px] rounded-md" />
                         <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                             <button onClick={handleImageDownload} className="p-2 bg-slate-700 hover:bg-emerald-600 rounded-full text-white transition" title="Download Image">
                                 <DownloadIcon className="h-5 w-5" />
                             </button>
                             <button onClick={() => onGenerateImage(prompt.id)} disabled={isBatchGenerating} className="p-2 bg-slate-700 hover:bg-blue-600 rounded-full text-white transition" title="Regenerate">
                                 <RegenerateIcon className="h-5 w-5" />
                             </button>
                         </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-6 bg-slate-900/50 rounded-md border border-slate-800 border-dashed">
                        {prompt.isLoading ? (
                            <div className="flex flex-col items-center text-emerald-400">
                                <SpinnerIcon className="animate-spin h-6 w-6 mb-2" />
                                <span className="text-sm">Generating Image...</span>
                            </div>
                        ) : (
                            <div className="text-center">
                                {prompt.generationFailed ? (
                                     <div className="mb-3 text-red-400 text-sm">Generation failed. Please try again.</div>
                                ) : (
                                     <p className="text-slate-500 text-sm mb-3">No image generated yet</p>
                                )}
                                <button 
                                    onClick={() => onGenerateImage(prompt.id)} 
                                    disabled={isBatchGenerating}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-sm font-medium rounded-full border border-slate-700 hover:border-emerald-500 transition flex items-center gap-2 mx-auto"
                                >
                                    <SparklesIcon className="h-4 w-4" />
                                    Generate Image
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN APP ---

export default function App() {
    const [scenario, setScenario] = useState("");
    const [duration, setDuration] = useState(1);
    const [referenceImages, setReferenceImages] = useState<ImageFile[]>([]);
    const [scriptFileName, setScriptFileName] = useState<string | null>(null);
    const [scriptContent, setScriptContent] = useState<string | null>(null);
    const [prompts, setPrompts] = useState<ScenePrompt[]>([]);
    const [isBuilding, setIsBuilding] = useState(false);
    const [isBatchGenerating, setIsBatchGenerating] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // API Key Checking
    useEffect(() => {
        const checkKey = async () => {
            if (window.aistudio && window.aistudio.hasSelectedApiKey) {
                const has = await window.aistudio.hasSelectedApiKey();
                setHasApiKey(has);
            } else {
                 // Fallback if not running in the specific environment, though instructions say it's guaranteed.
                 // We will default to false and force user to click the button which will fail if method missing.
                 setHasApiKey(false);
            }
        };
        checkKey();
    }, []);

    const handleSelectKey = async () => {
         if (window.aistudio && window.aistudio.openSelectKey) {
             await window.aistudio.openSelectKey();
             setHasApiKey(true);
         } else {
             alert("API Key selection is not available in this environment.");
         }
    };

    // Toast Management
    const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { ...toast, id }]);
        
        if (!toast.persistent) {
            setTimeout(() => {
                removeToast(id);
            }, 5000);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);


    // File Handlers
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const newFiles = Array.from(e.target.files);
        const processed = await Promise.all(newFiles.slice(0, MAX_REFERENCE_IMAGES - referenceImages.length).map(async (file) => {
            const { dataUrl, mimeType } = await fileToDataUrl(file);
            return { name: file.name, dataUrl, base64: dataUrlToBase64(dataUrl), mimeType };
        }));
        setReferenceImages(prev => [...prev, ...processed].slice(0, MAX_REFERENCE_IMAGES));
    };

    const handleScriptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setScriptFileName(file.name);
        const reader = new FileReader();
        reader.onload = (evt) => {
             const text = evt.target?.result as string;
             setScriptContent(text);
             // Estimate duration: 150 words per minute
             const wordCount = text.split(/\s+/).length;
             setDuration(Math.ceil(wordCount / 150));
        };
        reader.readAsText(file);
    };

    const handleRemoveScript = () => {
        setScriptFileName(null);
        setScriptContent(null);
        setDuration(1);
    };

    // Prompt Generation
    const buildPrompts = async () => {
        setIsBuilding(true);
        setPrompts([]);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
            const totalScenes = Math.ceil((duration * 60) / SCENE_DURATION_SECONDS);
            
            const systemInstruction = `You are a visionary film director and cinematographer creating a shot list for a "${STYLE_LOCK}".
            
            Input:
            - Scenario/Script: ${scriptContent || scenario}
            - Total Duration: ${duration} minutes
            - Target Scene Count: ${totalScenes}

            Task:
            Generate a JSON array of ${totalScenes} scenes. Distribute them across these phases: ${PHASES.map(p => `${p.phase} (${p.ratio * 100}%)`).join(", ")}.

            For each scene, provide:
            1. "id": Sequential integer.
            2. "phase": The phase name.
            3. "imagePrompt": A highly detailed, descriptive prompt for generating a photorealistic keyframe. Focus on lighting, texture, camera angle, and the physical action. STRICTLY ADHERE to the style: "Ultra-realistic, 8k, cinematic lighting".
            4. "videoPrompt": A prompt for generating a 5-second video clip using Veo. Describe the motion and atmosphere.

            Output strictly valid JSON.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: "Generate the shot list now.",
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                phase: { type: Type.STRING },
                                imagePrompt: { type: Type.STRING },
                                videoPrompt: { type: Type.STRING },
                            },
                            required: ["id", "phase", "imagePrompt", "videoPrompt"]
                        }
                    }
                }
            });

            const jsonText = response.text;
            if (!jsonText) throw new Error("No response from AI");
            
            const generatedData = JSON.parse(jsonText) as ScenePrompt[];
            setPrompts(generatedData);
            addToast({ type: 'success', title: 'Prompts Generated', message: `Successfully created ${generatedData.length} scene prompts.` });

        } catch (error) {
            console.error(error);
            addToast({ type: 'error', title: 'Generation Failed', message: error instanceof Error ? error.message : "Unknown error" });
        } finally {
            setIsBuilding(false);
        }
    };

    // Image Generation
    const handleGenerateImage = async (id: number) => {
        const prompt = prompts.find(p => p.id === id);
        if (!prompt) return;

        // Optimistic update
        setPrompts(prev => prev.map(p => p.id === id ? { ...p, isLoading: true, generationFailed: false } : p));

        try {
            const imageUrl = await generateImageFromPrompt(prompt.imagePrompt, referenceImages, process.env.API_KEY || "", 'gemini-2.5-flash-image');
            setPrompts(prev => prev.map(p => p.id === id ? { ...p, generatedImageUrl: imageUrl, isLoading: false } : p));
        } catch (error) {
            setPrompts(prev => prev.map(p => p.id === id ? { ...p, isLoading: false, generationFailed: true } : p));
            addToast({ type: 'error', title: `Scene ${id} Error`, message: "Failed to generate image." });
        }
    };

    const handleGenerateAllImages = async () => {
        if (prompts.length === 0) return;
        setIsBatchGenerating(true);
        let successCount = 0;
        let failureCount = 0;

        const pendingPrompts = prompts.filter(p => !p.generatedImageUrl);
        
        // Semaphore / Chunking
        const chunkSize = MAX_CONCURRENT_GENERATIONS;
        for (let i = 0; i < pendingPrompts.length; i += chunkSize) {
            const chunk = pendingPrompts.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (prompt) => {
                try {
                    setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, isLoading: true, generationFailed: false } : p));
                    const imageUrl = await generateImageFromPrompt(prompt.imagePrompt, referenceImages, process.env.API_KEY || "", 'gemini-2.5-flash-image');
                    setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, generatedImageUrl: imageUrl, isLoading: false } : p));
                    successCount++;
                } catch (e) {
                    console.error(e);
                    setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, isLoading: false, generationFailed: true } : p));
                    failureCount++;
                }
            }));
        }

        setIsBatchGenerating(false);
        
        addToast({
            type: failureCount > 0 ? 'warning' : 'success',
            title: 'Batch Generation Complete',
            message: `Successfully generated: ${successCount} images.\nFailed: ${failureCount} images.`,
            persistent: true 
        });
    };

    // Exports
    const downloadXLSX = () => {
        const worksheet = XLSX.utils.json_to_sheet(prompts.map(p => ({
            ID: p.id,
            Phase: p.phase,
            "Image Prompt": p.imagePrompt,
            "Video Prompt": p.videoPrompt,
            "Image URL": p.generatedImageUrl || ""
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Prompts");
        XLSX.writeFile(workbook, "Prehistoric_Project_Prompts.xlsx");
    };

    const copyAllPrompts = (type: 'image' | 'video') => {
        const text = prompts.map(p => type === 'image' ? p.imagePrompt : p.videoPrompt).join("\n\n");
        navigator.clipboard.writeText(text);
        addToast({ type: 'info', title: 'Copied', message: `All ${type} prompts copied to clipboard.` });
    };

    const downloadAllImages = () => {
        const images = prompts.filter(p => p.generatedImageUrl);
        if (images.length === 0) {
            addToast({ type: 'warning', title: 'No Images', message: "Generate images first." });
            return;
        }
        // Naive download for simplicity - typically would zip
        let delay = 0;
        images.forEach(p => {
             setTimeout(() => {
                const a = document.createElement('a');
                a.href = p.generatedImageUrl!;
                a.download = `scene-${p.id}.png`;
                a.click();
             }, delay);
             delay += 200;
        });
        addToast({ type: 'info', title: 'Downloading', message: `Downloading ${images.length} images...` });
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-emerald-500/30">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            
            <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
                        Prehistoric Docu-Gen
                    </h1>
                    {hasApiKey && <span className="text-xs text-emerald-500 bg-emerald-950/50 px-2 py-1 rounded border border-emerald-900">API Key Active</span>}
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8">
                {/* LEFT PANEL: CONTROLS */}
                <div className="lg:col-span-4">
                    <ControlPanel 
                        scenario={scenario} setScenario={setScenario}
                        duration={duration} setDuration={setDuration}
                        referenceImages={referenceImages} onImageUpload={handleImageUpload}
                        onBuildPrompts={buildPrompts} isBuilding={isBuilding}
                        scriptFileName={scriptFileName} onScriptUpload={handleScriptUpload} onRemoveScript={handleRemoveScript}
                        hasApiKey={hasApiKey} onSelectKey={handleSelectKey}
                    />
                </div>

                {/* RIGHT PANEL: OUTPUT */}
                <div className="lg:col-span-8 space-y-6">
                    {prompts.length > 0 ? (
                        <>
                            <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl">
                                <h2 className="text-xl font-bold text-emerald-400 mb-4">2. Generated Prompts</h2>
                                <div className="flex flex-wrap gap-3 mb-6">
                                    <button onClick={handleGenerateAllImages} disabled={isBatchGenerating} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md font-medium text-sm transition shadow-lg shadow-emerald-900/20 disabled:bg-slate-700 disabled:text-slate-400">
                                        {isBatchGenerating ? <SpinnerIcon className="animate-spin h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
                                        {isBatchGenerating ? 'Generating...' : 'Generate All Images'}
                                    </button>
                                    <button onClick={downloadAllImages} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-md text-sm transition">
                                        <DownloadIcon className="h-4 w-4" /> Download All Images
                                    </button>
                                    <button onClick={() => copyAllPrompts('image')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-md text-sm border border-slate-700 transition">
                                        <CopyIcon className="h-4 w-4" /> Copy All Image Prompts
                                    </button>
                                    <button onClick={() => copyAllPrompts('video')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-md text-sm border border-slate-700 transition">
                                        <CopyIcon className="h-4 w-4" /> Copy All Video Prompts
                                    </button>
                                    <button onClick={downloadXLSX} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-md text-sm border border-slate-700 transition">
                                        <DownloadIcon className="h-4 w-4" /> Download All Prompts (XLSX)
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                {prompts.map((p) => (
                                    <PromptCard 
                                        key={p.id} 
                                        prompt={p} 
                                        onGenerateImage={handleGenerateImage} 
                                        isBatchGenerating={isBatchGenerating}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 bg-slate-950/30 border-2 border-slate-800 border-dashed rounded-2xl text-slate-500">
                            <SparklesIcon className="h-16 w-16 mb-4 opacity-20" />
                            <p className="text-lg">Set up your scenario on the left and click "Generate Prompts" to begin.</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

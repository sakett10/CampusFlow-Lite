import { useState } from 'react';
import { campusApi } from '../api/campusApi';
import type { CampusItem, ItemType } from '../lib/types';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';

const normalizeDate = (
  value: string | null | undefined,
  fallbackYear?: string
): string => {
  if (!value) return '';

  // Already in HTML date format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Handle "DD Month YYYY" or "Month DD, YYYY" (and variations with/without year)
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };

  // 1. Try matching "25 September 2026"
  const matchDDMonth = value.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?/i
  );
  if (matchDDMonth) {
    const day = matchDDMonth[1].padStart(2, '0');
    const month = months[matchDDMonth[2].toLowerCase()];
    const year = matchDDMonth[3] || fallbackYear;
    if (year) return `${year}-${month}-${day}`;
  }

  // 2. Try matching "September 25, 2026"
  const matchMonthDD = value.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s+(\d{4}))?/i
  );
  if (matchMonthDD) {
    const month = months[matchMonthDD[1].toLowerCase()];
    const day = matchMonthDD[2].padStart(2, '0');
    const year = matchMonthDD[3] || fallbackYear;
    if (year) return `${year}-${month}-${day}`;
  }

  return '';
};

type AnalyzeNoticeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<CampusItem, 'id'>) => void;
};

export default function AnalyzeNoticeModal({ isOpen, onClose, onSave }: AnalyzeNoticeModalProps) {
  const [step, setStep] = useState<'INPUT' | 'ANALYZING' | 'REVIEW'>('INPUT');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<CampusItem>>({});

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError("Please paste a notice to analyze.");
      return;
    }
    setError(null);
    setStep('ANALYZING');
    try {
      const result = await campusApi.analyzeNotice(text);
setFormData({
  ...result,
  title: result.title || null,
  type: result.type || null,
  description: result.description || null,
  date: normalizeDate(result.date),
  registrationDeadline: normalizeDate(
    result.registrationDeadline,
    normalizeDate(result.date).substring(0, 4)
  ),
  venue: result.venue || null,
  eligibility: result.eligibility || null,
  organizer: result.organizer || null,
  importantActions: result.importantActions || [],
  sourceText: text,
});
      setStep('REVIEW');
    } catch (err: unknown) {
      console.error("ANALYZE NOTICE FAILED:", err);
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setStep('INPUT');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim() || !formData.type) {
      setError("Title and Type are required.");
      return;
    }
    
    onSave({
      title: formData.title,
      type: formData.type as ItemType,
      description: formData.description || null,
      date: formData.date || null,
      registrationDeadline: formData.registrationDeadline || null,
      venue: formData.venue || null,
      eligibility: formData.eligibility || null,
      organizer: formData.organizer || null,
      importantActions: formData.importantActions || [],
      sourceText: text
    });
    
    // Reset state
    setStep('INPUT');
    setText('');
    setFormData({});
    onClose();
  };

  const closeAndReset = () => {
    setStep('INPUT');
    setText('');
    setFormData({});
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          Campus Intelligence
        </h2>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}

        {step === 'INPUT' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Paste any campus email, WhatsApp message, or notice. Our AI will extract the important details instantly.</p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste notice text here..."
              className="w-full h-48 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
            <div className="flex justify-end gap-3">
              <button onClick={closeAndReset} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium">Cancel</button>
              <button onClick={handleAnalyze} className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium">
                Analyze Notice <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'ANALYZING' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-gray-600 font-medium">Extracting information...</p>
          </div>
        )}

        {step === 'REVIEW' && (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-md text-sm text-indigo-800 flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Review the extracted details below. <span className="font-bold text-red-600">Missing information</span> could not be reliably found in the source text.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input required type="text" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select required value={formData.type || ''} onChange={e => setFormData({...formData, type: e.target.value as ItemType})} className="w-full p-2 border border-gray-300 rounded-md">
                  <option value="" disabled>Select Type</option>
                  <option value="HACKATHON">Hackathon</option>
                  <option value="WORKSHOP">Workshop</option>
                  <option value="EVENT">Event</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="DEADLINE">Deadline</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-2 border border-gray-300 rounded-md h-20" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['date', 'registrationDeadline', 'venue', 'organizer', 'eligibility'].map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize flex justify-between">
                    {field.replace(/([A-Z])/g, ' $1').trim()}
                    {formData[field as keyof CampusItem] === null && (
                      <span className="text-red-500 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Missing</span>
                    )}
                  </label>
                  <input 
                    type={field.toLowerCase().includes('date') || field.toLowerCase().includes('deadline') ? "date" : "text"} 
                    value={(formData[field as keyof CampusItem] as string) || ''} 
                    onChange={e => setFormData({...formData, [field]: e.target.value || null})} 
                    placeholder={formData[field as keyof CampusItem] === null ? "Not found in text" : ""}
                    className={`w-full p-2 border rounded-md ${formData[field as keyof CampusItem] === null ? 'border-red-300 bg-red-50/30' : 'border-gray-300'}`} 
                  />
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-gray-200">
              <button type="button" onClick={() => setStep('INPUT')} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md font-medium">Back</button>
              <button type="submit" className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-md font-medium">Save to Feed</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

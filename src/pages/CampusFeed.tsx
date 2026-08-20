import { useState } from 'react';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { Sparkles, Radio, Loader2 } from 'lucide-react';
import CampusItemCard from '../components/CampusItemCard';
import AnalyzeNoticeModal from '../components/AnalyzeNoticeModal';

export default function CampusFeed() {
  const { items, isLoading, error, addItem, deleteItem } = useCampusFeed();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredItems = filterType === 'ALL' 
    ? items 
    : items.filter(item => item.type === filterType);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            Campus Feed
            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-bold tracking-widest uppercase align-middle ml-2">AI</span>
          </h1>
          <p className="text-gray-500 mt-1">Discover campus opportunities powered by AI.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Sparkles className="w-5 h-5" /> Analyze Notice
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          Error: {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
        {['ALL', 'HACKATHON', 'WORKSHOP', 'EVENT', 'ANNOUNCEMENT', 'DEADLINE'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filterType === type 
                ? 'bg-gray-900 text-white' 
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {type === 'ALL' ? 'All Items' : type}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No items found</h3>
          <p className="text-gray-500 max-w-sm mb-6">Your campus feed is empty. Paste a notice to let AI structure it for you.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Analyze First Notice
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <CampusItemCard key={item.id} item={item} onDelete={deleteItem} />
          ))}
        </div>
      )}

      <AnalyzeNoticeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={(item) => addItem(item)}
      />
    </div>
  );
}

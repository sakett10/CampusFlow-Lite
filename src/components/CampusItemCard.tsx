import type { CampusItem } from '../lib/types';
import { MapPin, Calendar, Users, Briefcase, Trash2, CheckCircle2 } from 'lucide-react';
import { formatDueDate } from '../lib/dateUtils';

type CampusItemCardProps = {
  item: CampusItem;
  onDelete: (id: string) => void;
};

export default function CampusItemCard({ item, onDelete }: CampusItemCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow relative group">
      <button 
        onClick={() => onDelete(item.id)} 
        className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" 
        aria-label="Delete item"
        title="Delete item"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="mb-3 pr-10">
        <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md mb-2">{item.type}</span>
        <h3 className="text-lg font-bold text-gray-900 leading-tight">{item.title}</h3>
      </div>
      
      {item.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-3">{item.description}</p>
      )}

      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm mb-4">
        {item.date && (
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate">{formatDueDate(item.date)}</span>
          </div>
        )}
        {item.venue && (
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate">{item.venue}</span>
          </div>
        )}
        {item.organizer && (
          <div className="flex items-center gap-2 text-gray-600">
            <Briefcase className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate">{item.organizer}</span>
          </div>
        )}
        {item.eligibility && (
          <div className="flex items-center gap-2 text-gray-600">
            <Users className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate">{item.eligibility}</span>
          </div>
        )}
      </div>

      {(item.importantActions?.length > 0 || item.registrationDeadline) && (
        <div className="pt-4 border-t border-gray-100">
          {item.registrationDeadline && (
            <p className="text-xs font-bold text-red-600 mb-2 uppercase tracking-wider">
              Deadline: {formatDueDate(item.registrationDeadline)}
            </p>
          )}
          {item.importantActions?.length > 0 && (
            <div className="space-y-1">
              {item.importantActions.map((action, i) => (
                <div key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

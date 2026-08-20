import { Edit2, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { Course } from '../lib/types';
import { calculateAttendancePercentage, calculateClassesNeeded } from '../lib/attendance';

type CourseCardProps = {
  course: Course;
  onEdit: (course: Course) => void;
  onDelete: (id: string) => void;
  onRecordAttendance: (id: string, attended: boolean) => void;
};

export default function CourseCard({ course, onEdit, onDelete, onRecordAttendance }: CourseCardProps) {
  const percentage = calculateAttendancePercentage(course.attendedClasses, course.totalClasses);
  const needed = calculateClassesNeeded(course.attendedClasses, course.totalClasses, course.attendanceThreshold);
  const isBelowThreshold = percentage < course.attendanceThreshold;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md mb-2">{course.code}</span>
          <h3 className="text-lg font-bold text-gray-900 line-clamp-1" title={course.title}>{course.title}</h3>
          <p className="text-sm text-gray-500">{course.instructor} • {course.credits} Credits</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(course)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Edit course" aria-label="Edit course">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(course.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete course" aria-label="Delete course">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-gray-100">
        <div className="flex justify-between items-end mb-2">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Attendance</p>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${isBelowThreshold ? 'text-red-600' : 'text-green-600'}`}>
                {percentage.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-500">/ {course.attendanceThreshold}%</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600 font-medium">{course.attendedClasses} / {course.totalClasses}</p>
            <p className="text-xs text-gray-400">Classes</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
          <div 
            className={`h-2 rounded-full transition-all duration-500 ${isBelowThreshold ? 'bg-red-500' : 'bg-green-500'}`} 
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>

        {/* Warnings */}
        {isBelowThreshold && needed > 0 && (
          <div className="flex items-start gap-2 mb-4 text-red-700 bg-red-50 p-2.5 rounded-md text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>You need to attend <strong>{needed}</strong> more consecutive classes to reach {course.attendanceThreshold}%.</p>
          </div>
        )}
        {isBelowThreshold && needed === -1 && (
          <div className="flex items-start gap-2 mb-4 text-red-700 bg-red-50 p-2.5 rounded-md text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>It is mathematically impossible to reach {course.attendanceThreshold}%.</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-2">
          <button 
            onClick={() => onRecordAttendance(course.id, true)} 
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-md font-medium text-sm transition-colors"
          >
            <CheckCircle className="w-4 h-4" /> Attended
          </button>
          <button 
            onClick={() => onRecordAttendance(course.id, false)} 
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-md font-medium text-sm transition-colors"
          >
            <XCircle className="w-4 h-4" /> Missed
          </button>
        </div>
      </div>
    </div>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  CheckSquare, 
  AlertTriangle,
  Clock,
  CheckCircle,
  Plus,
  Loader2,
  CalendarX,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useCourses } from '../hooks/useCourses';
import { useAssignments } from '../hooks/useAssignments';
import { getAssignmentStats, getUpcomingAssignments, getAttendanceWarnings, getAttendanceStats } from '../lib/dashboardUtils';
import { isOverdue, formatDueDate } from '../lib/dateUtils';
import { calculateClassesNeeded, calculateAttendancePercentage } from '../lib/attendance';

export default function Dashboard() {
  const { courses } = useCourses();
  const { assignments } = useAssignments();
  const navigate = useNavigate();

  const assignmentStats = getAssignmentStats(assignments);
  const upcomingAssignments = getUpcomingAssignments(assignments);
  const attendanceWarnings = getAttendanceWarnings(courses);
  const attendanceStats = getAttendanceStats(courses);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your academic progress.</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Course Stat */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Courses</p>
              <h3 className="text-2xl font-bold text-gray-900">{courses.length}</h3>
            </div>
          </div>
        </div>

        {/* Assignment Stat */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
              <CheckSquare className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Total Assignments</p>
              <h3 className="text-2xl font-bold text-gray-900">{assignmentStats.total}</h3>
            </div>
          </div>
        </div>

        {/* Pending Assignments */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Tasks</p>
              <h3 className="text-2xl font-bold text-gray-900">{assignmentStats.pending}</h3>
            </div>
          </div>
        </div>

        {/* Attendance Stat */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${attendanceStats.belowThreshold > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
              {attendanceStats.belowThreshold > 0 ? (
                <TrendingDown className="w-6 h-6 text-red-600" />
              ) : (
                <TrendingUp className="w-6 h-6 text-green-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">At Risk Courses</p>
              <h3 className="text-2xl font-bold text-gray-900">{attendanceStats.belowThreshold}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Assignments Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Upcoming Assignments</h2>
            <Link to="/assignments" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View all</Link>
          </div>

          {assignments.length === 0 ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
               <CheckSquare className="w-8 h-8 text-gray-400 mb-2" />
               <p className="text-sm font-medium text-gray-900">No assignments added</p>
               <p className="text-xs text-gray-500 mt-1 max-w-[250px]">Track your upcoming tasks by adding them to the assignments page.</p>
               <button onClick={() => navigate('/assignments')} className="mt-4 flex items-center gap-1.5 text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                 <Plus className="w-4 h-4" /> Add Assignment
               </button>
             </div>
          ) : upcomingAssignments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-green-50 rounded-lg border border-green-100">
              <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
              <p className="font-medium text-green-900">You're all caught up!</p>
              <p className="text-sm text-green-700 mt-1">No pending or in-progress assignments.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingAssignments.map(assignment => {
                const course = courses.find(c => c.id === assignment.courseId);
                const isLate = isOverdue(assignment.dueDate, assignment.status);
                
                return (
                  <div key={assignment.id} className={`flex flex-col p-4 rounded-lg border transition-all ${isLate ? 'bg-red-50/50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-gray-900">{assignment.title}</h4>
                      {assignment.status === 'IN_PROGRESS' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          <Loader2 className="w-3 h-3" /> In Progress
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mb-3">{course ? course.title : 'Unknown Course'}</div>
                    <div className="mt-auto flex items-center justify-between">
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${isLate ? 'text-red-600' : 'text-gray-600'}`}>
                        {isLate ? <CalendarX className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        {formatDueDate(assignment.dueDate)}
                        {isLate && <span className="ml-1 uppercase">(Overdue)</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Attendance Warnings Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Attendance Alerts</h2>
            <Link to="/courses" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View courses</Link>
          </div>

          {courses.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
               <BookOpen className="w-8 h-8 text-gray-400 mb-2" />
               <p className="text-sm font-medium text-gray-900">No courses added</p>
               <p className="text-xs text-gray-500 mt-1 max-w-[250px]">Add your courses to start tracking attendance automatically.</p>
               <button onClick={() => navigate('/courses')} className="mt-4 flex items-center gap-1.5 text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                 <Plus className="w-4 h-4" /> Add Course
               </button>
            </div>
          ) : attendanceWarnings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-green-50 rounded-lg border border-green-100">
              <CheckCircle className="w-10 h-10 text-green-500 mb-3" />
              <p className="font-medium text-green-900">Great job!</p>
              <p className="text-sm text-green-700 mt-1">All your courses are meeting their attendance thresholds.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {attendanceWarnings.map(course => {
                const percentage = calculateAttendancePercentage(course.attendedClasses, course.totalClasses);
                const needed = calculateClassesNeeded(course.attendedClasses, course.totalClasses, course.attendanceThreshold);
                
                return (
                  <div key={course.id} className="p-4 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          {course.code}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">{course.title}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block text-lg font-black text-red-600">{percentage}%</span>
                        <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Required: {course.attendanceThreshold}%</div>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-sm text-red-800 bg-red-100/50 p-2.5 rounded-md">
                      {needed === -1 ? (
                        <span className="font-medium">It is mathematically impossible to reach the {course.attendanceThreshold}% threshold.</span>
                      ) : (
                        <span>You must attend the next <span className="font-bold">{needed}</span> consecutive classes to reach the threshold.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

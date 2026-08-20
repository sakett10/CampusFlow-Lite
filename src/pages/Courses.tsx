import { useState } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { useCourses } from '../hooks/useCourses';
import CourseCard from '../components/CourseCard';
import CourseModal from '../components/CourseModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import type { Course } from '../lib/types';

export default function Courses() {
  const { courses, addCourse, updateCourse, deleteCourse, recordAttendance } = useCourses();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);

  const handleAddClick = () => {
    setEditingCourse(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (course: Course) => {
    setEditingCourse(course);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteCourseId(id);
  };

  const handleSaveCourse = (courseData: Omit<Course, 'id'>) => {
    if (editingCourse) {
      updateCourse(editingCourse.id, courseData);
    } else {
      addCourse(courseData);
    }
  };

  const confirmDelete = () => {
    if (deleteCourseId) {
      deleteCourse(deleteCourseId);
      setDeleteCourseId(null);
    }
  };

  const getCourseTitleForDelete = () => {
    return courses.find(c => c.id === deleteCourseId)?.title || 'this course';
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Courses</h1>
          <p className="text-gray-500 mt-1">Manage your enrolled courses and track attendance.</p>
        </div>
        <button 
          onClick={handleAddClick}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Add Course
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No courses yet</h2>
          <p className="text-gray-500 mb-6 max-w-sm">You haven't added any courses. Add your first course to start tracking your attendance and assignments.</p>
          <button 
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <CourseCard 
              key={course.id} 
              course={course} 
              onEdit={handleEditClick} 
              onDelete={handleDeleteClick}
              onRecordAttendance={recordAttendance}
            />
          ))}
        </div>
      )}

      <CourseModal 
        key={isModalOpen ? (editingCourse?.id || 'new') : 'closed'}
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveCourse} 
        initialData={editingCourse}
      />

      <DeleteConfirmModal
        isOpen={!!deleteCourseId}
        onClose={() => setDeleteCourseId(null)}
        onConfirm={confirmDelete}
        title={getCourseTitleForDelete()}
      />
    </div>
  );
}

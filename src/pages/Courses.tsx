import { useState } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { useCourses } from '../hooks/useCourses';
import CourseCard from '../components/CourseCard';
import CourseModal from '../components/CourseModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import type { Course } from '../lib/types';

export default function Courses() {
  const { courses, isLoading, error, refresh, addCourse, updateCourse, deleteCourse, recordAttendance } = useCourses();
  
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
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[var(--cf-border-subtle)] pb-4">
        <div>
          <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-tight font-bold text-[var(--cf-text)]">
            Courses
          </h1>
          <p className="text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)] mt-1">
            Manage your enrolled courses, syllabus credits, and attendance records.
          </p>
        </div>
        <Button 
          variant="primary"
          onClick={handleAddClick}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Add Course
        </Button>
      </div>

      {error && (
        <div className="rounded-[var(--cf-radius-md)] border border-[var(--cf-danger-border)] bg-[var(--cf-danger-subtle)] p-4 flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--cf-danger)]">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" aria-label="Loading courses">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 space-y-4 animate-pulse"
            >
              <div className="h-5 w-24 bg-[var(--cf-surface-muted)] rounded" />
              <div className="h-6 w-48 bg-[var(--cf-surface-muted)] rounded" />
              <div className="h-4 w-32 bg-[var(--cf-surface-muted)] rounded" />
              <div className="pt-4 border-t border-[var(--cf-border-subtle)] flex justify-between">
                <div className="h-4 w-16 bg-[var(--cf-surface-muted)] rounded" />
                <div className="h-4 w-16 bg-[var(--cf-surface-muted)] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card padding="lg" className="border-dashed border-[var(--cf-border)] bg-[var(--cf-surface-muted)]/40 p-12 text-center flex flex-col items-center">
          <EmptyState
            icon={<BookOpen className="w-8 h-8 text-[var(--cf-brand)]" />}
            title="No courses enrolled yet"
            description="Add your enrolled courses to start tracking class attendance and course assignments."
            action={
              <Button 
                variant="outline"
                onClick={handleAddClick}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add Your First Course
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

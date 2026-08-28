import { useState } from 'react';
import { Plus, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { useCourses } from '../hooks/useCourses';
import CourseCard from '../components/CourseCard';
import CourseModal from '../components/CourseModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
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
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="max-w-6xl mx-auto space-y-6 pb-12"
    >
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

      {courses.length === 0 ? (
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
    </motion.div>
  );
}

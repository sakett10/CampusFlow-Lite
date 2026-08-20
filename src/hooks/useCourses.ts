import { useState } from 'react';
import type { Course } from '../lib/types';
import { getStorageArray, isCourse, setStorageData } from '../lib/storage';

const STORAGE_KEY = 'campusflow_courses';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>(() => getStorageArray(STORAGE_KEY, isCourse));

  const saveCourses = (newCourses: Course[]) => {
    setCourses(newCourses);
    setStorageData(STORAGE_KEY, newCourses);
  };

  const addCourse = (course: Omit<Course, 'id'>) => {
    const newCourse = { ...course, id: crypto.randomUUID() };
    saveCourses([...courses, newCourse]);
  };

  const updateCourse = (id: string, updated: Partial<Course>) => {
    saveCourses(courses.map(c => c.id === id ? { ...c, ...updated } : c));
  };

  const deleteCourse = (id: string) => {
    saveCourses(courses.filter(c => c.id !== id));
  };

  const recordAttendance = (id: string, attended: boolean) => {
    saveCourses(courses.map(c => {
      if (c.id === id) {
        return {
          ...c,
          totalClasses: c.totalClasses + 1,
          attendedClasses: c.attendedClasses + (attended ? 1 : 0)
        };
      }
      return c;
    }));
  };

  return { courses, addCourse, updateCourse, deleteCourse, recordAttendance };
}

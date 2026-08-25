import { useState, useEffect } from 'react';
import type { Course } from '../lib/types';

const API_URL = '/api/courses';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Failed to load courses (${response.status})`);
      }

      const data: Course[] = await response.json();

      setCourses(data);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to load courses'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCourses();
  }, []);

  const addCourse = async (course: Omit<Course, 'id'>) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(course),
    });

    if (!response.ok) {
      throw new Error(`Failed to add course (${response.status})`);
    }

    const newCourse: Course = await response.json();

    setCourses(prev => [...prev, newCourse]);

    return newCourse;
  };

  const updateCourse = async (
    id: string,
    updated: Partial<Course>
  ) => {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updated),
    });

    if (!response.ok) {
      throw new Error(`Failed to update course (${response.status})`);
    }

    const updatedCourse: Course = await response.json();

    setCourses(prev =>
      prev.map(course =>
        course.id === id ? updatedCourse : course
      )
    );

    return updatedCourse;
  };

  const deleteCourse = async (id: string) => {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete course (${response.status})`);
    }

    setCourses(prev =>
      prev.filter(course => course.id !== id)
    );
  };

  const recordAttendance = async (
    id: string,
    attended: boolean
  ) => {
    const course = courses.find(item => item.id === id);

    if (!course) {
      throw new Error('Course not found');
    }

    const response = await fetch(`${API_URL}/${id}/attendance`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attendedClasses:
          course.attendedClasses + (attended ? 1 : 0),
        totalClasses: course.totalClasses + 1,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to record attendance (${response.status})`
      );
    }

    const updatedCourse: Course = await response.json();

    setCourses(prev =>
      prev.map(course =>
        course.id === id ? updatedCourse : course
      )
    );

    return updatedCourse;
  };

  return {
    courses,
    isLoading,
    error,
    addCourse,
    updateCourse,
    deleteCourse,
    recordAttendance,
    refresh: loadCourses,
  };
}
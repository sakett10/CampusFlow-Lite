import { useState, useEffect, useCallback } from 'react';
import type { Course } from '../lib/types';
import { useAuth } from '@clerk/clerk-react';

const API_URL = '/api/courses';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const loadCourses = useCallback(async () => {
    setIsLoading(true);

    try {
      const token = await getToken();
      if (!token) {
        if (
          typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('demo') === '1' ||
            window.sessionStorage?.getItem('cf_demo') === '1')
        ) {
          setCourses(getDemoCourses());
          setError(null);
          setIsLoading(false);
          return;
        }
        throw new Error('Authentication required');
      }

      const response = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });

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
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCourses();
  }, [loadCourses]);

  const addCourse = async (course: Omit<Course, 'id'>) => {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
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
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const course = courses.find(item => item.id === id);

    if (!course) {
      throw new Error('Course not found');
    }

    const response = await fetch(`${API_URL}/${id}/attendance`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
    refetch: loadCourses,
    refresh: loadCourses,
  };
}

function getDemoCourses(): Course[] {
  return [
    {
      id: 'CS401',
      code: 'CS401',
      title: 'Machine Learning',
      instructor: 'Dr. Ramesh Kumar',
      credits: 4,
      attendedClasses: 22,
      totalClasses: 24,
      attendanceThreshold: 75,
    },
    {
      id: 'MATH302',
      code: 'MATH302',
      title: 'Differential Equations',
      instructor: 'Prof. S. N. Roy',
      credits: 3,
      attendedClasses: 18,
      totalClasses: 20,
      attendanceThreshold: 75,
    },
    {
      id: 'EE201',
      code: 'EE201',
      title: 'Analog Circuits',
      instructor: 'Dr. P. Sen',
      credits: 4,
      attendedClasses: 19,
      totalClasses: 22,
      attendanceThreshold: 75,
    },
    {
      id: 'CS305',
      code: 'CS305',
      title: 'Algorithm Analysis',
      instructor: 'Dr. A. Verma',
      credits: 4,
      attendedClasses: 21,
      totalClasses: 24,
      attendanceThreshold: 75,
    },
  ];
}

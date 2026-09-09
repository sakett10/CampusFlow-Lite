import { useState, useEffect, useCallback } from 'react';
import type { Assignment } from '../lib/types';
import { useAuth } from '@clerk/clerk-react';

const API_URL = '/api/assignments';

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const loadAssignments = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        if (
          typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('demo') === '1' ||
            window.sessionStorage?.getItem('cf_demo') === '1')
        ) {
          setAssignments(getDemoAssignments());
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
        throw new Error(`Failed to load assignments (${response.status})`);
      }

      const data: Assignment[] = await response.json();
      setAssignments(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const handleRefresh = () => {
      loadAssignments();
    };
    window.addEventListener('campusflow:refresh-tasks', handleRefresh);
    return () => {
      window.removeEventListener('campusflow:refresh-tasks', handleRefresh);
    };
  }, [loadAssignments]);

  const addAssignment = async (assignment: Omit<Assignment, 'id'>) => {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(assignment),
    });

    if (!response.ok) {
      throw new Error(`Failed to add assignment (${response.status})`);
    }

    const newAssignment: Assignment = await response.json();
    setAssignments(prev => [...prev, newAssignment]);
    return newAssignment;
  };

  const updateAssignment = async (
    id: string,
    updated: Partial<Assignment>
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
      throw new Error(`Failed to update assignment (${response.status})`);
    }

    const updatedAssignment: Assignment = await response.json();

    setAssignments(prev =>
      prev.map(assignment =>
        assignment.id === id ? updatedAssignment : assignment
      )
    );

    return updatedAssignment;
  };

  const updateStatus = async (
    id: string,
    status: Assignment['status']
  ) => {
    const token = await getToken();
    if (!token) {
      if (
        typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('demo') === '1' ||
          window.sessionStorage?.getItem('cf_demo') === '1')
      ) {
        const found = assignments.find(a => a.id === id);
        if (found) {
          const updated: Assignment = {
            ...found,
            status,
            completedAt: status === 'COMPLETED' ? new Date().toISOString() : null,
          };
          setAssignments(prev => prev.map(a => (a.id === id ? updated : a)));
          return updated;
        }
      }
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update assignment status (${response.status})`);
    }

    const updatedAssignment: Assignment = await response.json();

    setAssignments(prev =>
      prev.map(assignment =>
        assignment.id === id ? updatedAssignment : assignment
      )
    );

    return updatedAssignment;
  };

  const toggleTask = async (id: string) => {
    const current = assignments.find(a => a.id === id);
    if (!current) return;
    const nextStatus: Assignment['status'] = current.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    return updateStatus(id, nextStatus);
  };

  const deleteAssignment = async (id: string) => {
    const token = await getToken();
    if (!token) throw new Error('Authentication required');

    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete assignment (${response.status})`);
    }

    setAssignments(prev =>
      prev.filter(assignment => assignment.id !== id)
    );
  };

  return {
    assignments,
    tasks: assignments,
    isLoading,
    error,
    addAssignment,
    addTask: addAssignment,
    updateAssignment,
    updateTask: updateAssignment,
    updateStatus,
    toggleTask,
    deleteAssignment,
    deleteTask: deleteAssignment,
    refresh: loadAssignments,
  };
}

export const useTasks = useAssignments;

function getDemoAssignments(): Assignment[] {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const in2Days = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];
  const in5Days = new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0];

  return [
    {
      id: 'demo-1',
      title: 'Dean Honor List Verification Submission',
      description: 'Submit signed SGPA endorsement form to departmental academic cell.',
      courseId: null,
      dueDate: yesterday,
      dueTime: '17:00',
      reminder: '1d_before',
      priority: 'urgent',
      status: 'PENDING',
      source: 'notice',
      createdAt: yesterday,
      updatedAt: yesterday,
    },
    {
      id: 'demo-2',
      title: 'CS401 Machine Learning Project Proposal',
      description: 'Submit 4-page PDF proposal with baseline benchmark citations.',
      courseId: 'CS401',
      dueDate: today,
      dueTime: '23:59',
      reminder: '1d_before',
      priority: 'urgent',
      status: 'PENDING',
      source: 'notice',
      createdAt: today,
      updatedAt: today,
    },
    {
      id: 'demo-3',
      title: 'MATH302 Problem Set 4: Differential Equations',
      description: 'Complete Fourier series problems 12 through 24.',
      courseId: 'MATH302',
      dueDate: today,
      dueTime: '18:00',
      reminder: '2h_before',
      priority: 'high',
      status: 'COMPLETED',
      completedAt: today,
      source: 'manual',
      createdAt: today,
      updatedAt: today,
    },
    {
      id: 'demo-4',
      title: 'EE201 Lab Report: Op-Amp Feedback Circuits',
      description: 'Include LTSpice transient curves and multimeter logs.',
      courseId: 'EE201',
      dueDate: in2Days,
      dueTime: '16:00',
      reminder: '1d_before',
      priority: 'medium',
      status: 'PENDING',
      source: 'gmail',
      createdAt: today,
      updatedAt: today,
    },
    {
      id: 'demo-5',
      title: 'CS305 Algorithm Analysis: Dynamic Programming Set',
      description: 'Prove optimal substructure and subproblem overlap for matrix chain multiplication.',
      courseId: 'CS305',
      dueDate: in5Days,
      dueTime: '23:59',
      reminder: '1d_before',
      priority: 'high',
      status: 'PENDING',
      source: 'manual',
      createdAt: today,
      updatedAt: today,
    },
  ];
}

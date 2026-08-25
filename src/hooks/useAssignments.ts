import { useState, useEffect } from 'react';
import type { Assignment } from '../lib/types';

const API_URL = '/api/assignments';

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAssignments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(API_URL);
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
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssignments();
  }, []);

  const addAssignment = async (assignment: Omit<Assignment, 'id'>) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

  const updateAssignment = async (id: string, updated: Partial<Assignment>) => {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updated),
    });

    if (!response.ok) {
      throw new Error(`Failed to update assignment (${response.status})`);
    }

    const updatedAssignment: Assignment = await response.json();
    setAssignments(prev => prev.map(a => (a.id === id ? updatedAssignment : a)));
    return updatedAssignment;
  };

  const deleteAssignment = async (id: string) => {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete assignment (${response.status})`);
    }

    setAssignments(prev => prev.filter(a => a.id !== id));
  };

  const updateStatus = async (id: string, status: Assignment['status']) => {
    const response = await fetch(`${API_URL}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update status (${response.status})`);
    }

    const updatedAssignment: Assignment = await response.json();
    setAssignments(prev => prev.map(a => (a.id === id ? updatedAssignment : a)));
    return updatedAssignment;
  };

  return {
    assignments,
    isLoading,
    error,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    updateStatus,
    refresh: loadAssignments,
  };
}

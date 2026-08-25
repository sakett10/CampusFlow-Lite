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
      if (!token) throw new Error('Authentication required');

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
    if (!token) throw new Error('Authentication required');

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
    isLoading,
    error,
    addAssignment,
    updateAssignment,
    updateStatus,
    deleteAssignment,
    refresh: loadAssignments,
  };
}

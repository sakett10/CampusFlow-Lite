import { useState } from 'react';
import type { Assignment } from '../lib/types';
import { getStorageArray, isAssignment, setStorageData } from '../lib/storage';

const STORAGE_KEY = 'campusflow_assignments';

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>(() => getStorageArray(STORAGE_KEY, isAssignment));

  const saveAssignments = (newAssignments: Assignment[]) => {
    setAssignments(newAssignments);
    setStorageData(STORAGE_KEY, newAssignments);
  };

  const addAssignment = (assignment: Omit<Assignment, 'id'>) => {
    const newAssignment = { ...assignment, id: crypto.randomUUID() };
    saveAssignments([...assignments, newAssignment]);
  };

  const updateAssignment = (id: string, updated: Partial<Assignment>) => {
    saveAssignments(assignments.map(a => a.id === id ? { ...a, ...updated } : a));
  };

  const deleteAssignment = (id: string) => {
    saveAssignments(assignments.filter(a => a.id !== id));
  };

  const updateStatus = (id: string, status: Assignment['status']) => {
    updateAssignment(id, { status });
  };

  return { assignments, addAssignment, updateAssignment, deleteAssignment, updateStatus };
}

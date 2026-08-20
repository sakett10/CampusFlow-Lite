import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAssignments } from './useAssignments';

describe('useAssignments hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds and reads an assignment', () => {
    const { result } = renderHook(() => useAssignments());
    
    act(() => {
      result.current.addAssignment({
        courseId: 'c1',
        title: 'Math Homework',
        description: 'Page 42',
        dueDate: '2026-10-10',
        status: 'PENDING'
      });
    });

    expect(result.current.assignments.length).toBe(1);
    expect(result.current.assignments[0].title).toBe('Math Homework');
    expect(result.current.assignments[0].status).toBe('PENDING');
  });

  it('updates an assignment status', () => {
    const { result } = renderHook(() => useAssignments());
    
    act(() => {
      result.current.addAssignment({
        courseId: 'c1', title: 'A1', description: '', dueDate: '2026-10-10', status: 'PENDING'
      });
    });

    const id = result.current.assignments[0].id;

    act(() => {
      result.current.updateStatus(id, 'COMPLETED');
    });

    expect(result.current.assignments[0].status).toBe('COMPLETED');
  });

  it('deletes an assignment', () => {
    const { result } = renderHook(() => useAssignments());
    
    act(() => {
      result.current.addAssignment({
        courseId: 'c1', title: 'A1', description: '', dueDate: '2026-10-10', status: 'PENDING'
      });
    });

    const id = result.current.assignments[0].id;

    act(() => {
      result.current.deleteAssignment(id);
    });

    expect(result.current.assignments.length).toBe(0);
  });
});

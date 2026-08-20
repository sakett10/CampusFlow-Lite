import { describe, it, expect } from 'vitest';
import { calculateAttendancePercentage, calculateClassesNeeded } from './attendance';

describe('Attendance Utils', () => {
  it('calculates percentage correctly', () => {
    expect(calculateAttendancePercentage(15, 20)).toBe(75);
    expect(calculateAttendancePercentage(0, 0)).toBe(100);
    expect(calculateAttendancePercentage(5, 10)).toBe(50);
  });

  it('calculates needed classes correctly', () => {
    expect(calculateClassesNeeded(5, 10, 75)).toBe(10);
    expect(calculateClassesNeeded(15, 20, 75)).toBe(0);
    expect(calculateClassesNeeded(14, 20, 75)).toBe(4);
  });

  it('handles edge cases for needed classes', () => {
    // Already above
    expect(calculateClassesNeeded(9, 10, 80)).toBe(0);
    // 100% threshold with missed classes
    expect(calculateClassesNeeded(9, 10, 100)).toBe(-1);
    // 100% threshold with no missed classes
    expect(calculateClassesNeeded(10, 10, 100)).toBe(0);
    // 0 threshold
    expect(calculateClassesNeeded(0, 10, 0)).toBe(0);
    // >100 threshold
    expect(calculateClassesNeeded(5, 10, 105)).toBe(-1);
  });
});

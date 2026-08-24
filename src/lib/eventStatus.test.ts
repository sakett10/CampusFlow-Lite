import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEventStatus } from './eventStatus';

describe('getEventStatus', () => {
  const fakeNow = new Date(2026, 8, 20, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Case 1: Future event + deadline more than 3 days away -> REGISTRATION_OPEN', () => {
    const status = getEventStatus('2026-09-30', null, null, '2026-09-25', fakeNow);
    expect(status).toBe('REGISTRATION_OPEN');
  });

  it('Case 2: Future event + deadline within 3 days -> REGISTRATION_CLOSING_SOON', () => {
    const status = getEventStatus('2026-09-30', null, null, '2026-09-22', fakeNow);
    expect(status).toBe('REGISTRATION_CLOSING_SOON');
  });

  it('Case 3: Past registration deadline + future event -> UPCOMING', () => {
    const status = getEventStatus('2026-09-30', null, null, '2026-09-18', fakeNow);
    expect(status).toBe('UPCOMING');
  });

  it('Case 4: Past event -> EVENT_ENDED', () => {
    const status = getEventStatus('2026-09-10', null, null, null, fakeNow);
    expect(status).toBe('EVENT_ENDED');
  });

  it('Case 5: Date only (future) -> UPCOMING', () => {
    const status = getEventStatus('2026-09-30', null, null, null, fakeNow);
    expect(status).toBe('UPCOMING');
  });

  it('Case 6: Date + startTime + endTime (event already started and ended) -> EVENT_ENDED', () => {
    const status = getEventStatus('2026-09-20', '09:00', '11:00', null, fakeNow);
    expect(status).toBe('EVENT_ENDED');
  });
  
  it('Case 6b: Date + startTime + endTime (event not ended yet) -> UPCOMING', () => {
    const status = getEventStatus('2026-09-20', '14:00', '16:00', null, fakeNow);
    expect(status).toBe('UPCOMING');
  });

  it('Case 7: Date + startTime only (event already started) -> EVENT_ENDED', () => {
    const status = getEventStatus('2026-09-20', '10:00', null, null, fakeNow);
    expect(status).toBe('EVENT_ENDED');
  });

  it('Case 8: No date -> UNKNOWN', () => {
    const status = getEventStatus(null, null, null, null, fakeNow);
    expect(status).toBe('UNKNOWN');
  });
});

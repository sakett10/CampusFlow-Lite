import { describe, it, expect } from 'vitest';
import {
  isActionableNotice,
  isActionableCampusItem,
  isActionableCampusEmail,
  parseNaturalDate,
  extractIsoDate,
  extractTime,
  suggestReminder,
  proposeTaskFromNotice,
  proposeTaskFromCampusItem,
  proposeTaskFromCampusEmail,
} from './deadlineIntelligence';
import type { Notice, CampusItem, CampusEmail } from './types';

describe('deadlineIntelligence', () => {
  describe('isActionableNotice', () => {
    it('identifies notice with actionRequired as actionable', () => {
      const notice: Notice = {
        id: 'n1',
        createdByUserId: 'u1',
        title: 'CAT 2 Registration Open',
        summary: 'Registration for second continuous assessment is now open.',
        category: 'academic',
        priority: 'urgent',
        actionRequired: 'Submit CAT 2 course registration on portal',
        sourceProvider: 'gmail',
        status: 'published',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };
      expect(isActionableNotice(notice)).toBe(true);
    });

    it('identifies exam and assignment category notices as actionable', () => {
      const notice: Notice = {
        id: 'n2',
        createdByUserId: 'u1',
        title: 'Midterm schedule released',
        summary: 'Check the exam timetable',
        category: 'exam',
        priority: 'important',
        sourceProvider: 'gmail',
        status: 'published',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };
      expect(isActionableNotice(notice)).toBe(true);
    });

    it('identifies non-actionable general notice as false', () => {
      const notice: Notice = {
        id: 'n3',
        createdByUserId: 'u1',
        title: 'Campus fountain maintenance',
        summary: 'The main campus fountain will be cleaned today.',
        category: 'general',
        priority: 'low',
        actionRequired: 'None',
        sourceProvider: 'gmail',
        status: 'published',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };
      expect(isActionableNotice(notice)).toBe(false);
    });
  });

  describe('isActionableCampusItem & isActionableCampusEmail', () => {
    it('identifies DEADLINE item as actionable', () => {
      const item: CampusItem = {
        id: 'c1',
        title: 'Hackathon Submission Deadline',
        type: 'DEADLINE',
        description: 'Submit your project repo',
        date: '2026-09-20',
        startTime: null,
        endTime: null,
        registrationDeadline: '2026-09-20',
        venue: null,
        eligibility: null,
        organizer: null,
        importantActions: ['Submit code'],
        sourceText: '',
      };
      expect(isActionableCampusItem(item)).toBe(true);
    });

    it('identifies email with deadline as actionable', () => {
      const email: CampusEmail = {
        id: 'e1',
        userId: 'u1',
        sourceAccountEmail: 'student@college.edu',
        sourceMessageId: 'm1',
        subject: 'Assignment 3 Due Date Extension',
        deadline: '2026-09-18',
        analysisStatus: 'completed',
        category: 'assignment',
      };
      expect(isActionableCampusEmail(email)).toBe(true);
    });
  });

  describe('Natural Language Date Parsing', () => {
    const fixedNow = new Date(2026, 8, 8); // Sep 8, 2026

    it('parses explicit ISO date without ambiguity', () => {
      const res = parseNaturalDate('2026-09-30', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-30');
      expect(res?.isAmbiguous).toBe(false);
    });

    it('parses DD/MM/YYYY numeric format without ambiguity', () => {
      const res = parseNaturalDate('15/10/2026', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-10-15');
      expect(res?.isAmbiguous).toBe(false);
    });

    it('parses "20 September 2026" without ambiguity', () => {
      const res = parseNaturalDate('20 September 2026', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-20');
      expect(res?.isAmbiguous).toBe(false);
    });

    it('parses "September 20, 2026" without ambiguity', () => {
      const res = parseNaturalDate('September 20, 2026', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-20');
      expect(res?.isAmbiguous).toBe(false);
    });

    it('parses "20th September" and infers year with ambiguity flag', () => {
      const res = parseNaturalDate('20th September', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-20');
      expect(res?.isAmbiguous).toBe(true);
      expect(res?.confidenceReason).toContain('Year was inferred');
    });

    it('parses "Monday, 14 September" and infers year with ambiguity flag', () => {
      const res = parseNaturalDate('Monday, 14 September', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-14');
      expect(res?.isAmbiguous).toBe(true);
    });

    it('parses "tomorrow" relative date with ambiguity flag', () => {
      const res = parseNaturalDate('tomorrow', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-09');
      expect(res?.isAmbiguous).toBe(true);
      expect(res?.confidenceReason).toContain('tomorrow');
    });

    it('parses "this Friday" with ambiguity flag', () => {
      const res = parseNaturalDate('this Friday', fixedNow);
      expect(res).not.toBeNull();
      expect(res?.isoDate).toBe('2026-09-11');
      expect(res?.isAmbiguous).toBe(true);
    });

    it('returns null when no date exists in string', () => {
      expect(parseNaturalDate('General meeting in the auditorium', fixedNow)).toBeNull();
      expect(extractIsoDate('No date here', fixedNow)).toBeNull();
    });
  });

  describe('Standardized Time Parsing', () => {
    it('normalizes 12-hour AM/PM formats into 24-hour HH:MM', () => {
      expect(extractTime('Submission closes at 5:00 PM today')).toBe('17:00');
      expect(extractTime('Deadline is 11:59 PM')).toBe('23:59');
      expect(extractTime('Class starts at 9:00 AM')).toBe('09:00');
      expect(extractTime('Closes at 5 PM')).toBe('17:00');
    });

    it('preserves 24-hour format', () => {
      expect(extractTime('Due at 14:30')).toBe('14:30');
      expect(extractTime('Submission deadline: 23:59')).toBe('23:59');
      expect(extractTime('No time specified')).toBe(null);
    });
  });

  describe('Anti-hallucination Guarantees: proposeTaskFromNotice', () => {
    it('proposes task with unambiguous date from natural language notice date', () => {
      const notice: Notice = {
        id: 'n100',
        createdByUserId: 'u1',
        title: 'Submit Chemistry record',
        summary: 'Final submission deadline is 25 September 2026 at 5:00 PM',
        category: 'academic',
        priority: 'urgent',
        actionRequired: 'Submit Chemistry record to laboratory',
        importantDates: [{ label: 'Submission Deadline', date: '25 September 2026' }],
        sourceProvider: 'gmail',
        status: 'published',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };

      const proposal = proposeTaskFromNotice(notice);
      expect(proposal.title).toBe('Submit Chemistry record to laboratory');
      expect(proposal.dueDate).toBe('2026-09-25');
      expect(proposal.dueTime).toBe('17:00');
      expect(proposal.priority).toBe('urgent');
      expect(proposal.source).toBe('notice');
      expect(proposal.sourceId).toBe('n100');
      expect(proposal.isAmbiguousDate).toBe(false);
    });

    it('NEVER silently invents a date when notice contains no date', () => {
      const notice: Notice = {
        id: 'n101',
        createdByUserId: 'u1',
        title: 'Review CAT 2 syllabus',
        summary: 'Professors have updated the syllabus notes in the shared drive.',
        category: 'academic',
        priority: 'normal',
        sourceProvider: 'gmail',
        status: 'published',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };

      const proposal = proposeTaskFromNotice(notice);
      // Must not invent tomorrow or any date
      expect(proposal.dueDate).toBe('');
      expect(proposal.isAmbiguousDate).toBe(true);
      expect(proposal.confidenceReason).toContain('No deadline date was detected');
    });
  });

  describe('Anti-hallucination Guarantees: proposeTaskFromCampusEmail & CampusItem', () => {
    it('extracts task proposal from email with natural language date', () => {
      const email: CampusEmail = {
        id: 'e200',
        userId: 'u1',
        sourceAccountEmail: 'student@college.edu',
        sourceMessageId: 'm200',
        subject: 'Lab Exam Schedule Announced',
        summary: 'Chemistry lab exams begin soon. Practical manuals must be submitted.',
        deadline: '22 September 2026',
        importantActions: ['Submit practical manual'],
        importance: 'high',
        analysisStatus: 'completed',
        category: 'exam',
      };

      const proposal = proposeTaskFromCampusEmail(email);
      expect(proposal.title).toBe('Submit practical manual');
      expect(proposal.dueDate).toBe('2026-09-22');
      expect(proposal.priority).toBe('high');
      expect(proposal.source).toBe('gmail');
      expect(proposal.sourceId).toBe('e200');
      expect(proposal.isAmbiguousDate).toBe(false);
    });

    it('NEVER invents date when email has no deadline', () => {
      const email: CampusEmail = {
        id: 'e201',
        userId: 'u1',
        sourceAccountEmail: 'student@college.edu',
        sourceMessageId: 'm201',
        subject: 'General faculty meeting notes',
        summary: 'Notes from yesterday.',
        analysisStatus: 'completed',
        category: 'general',
      };

      const proposal = proposeTaskFromCampusEmail(email);
      expect(proposal.dueDate).toBe('');
      expect(proposal.isAmbiguousDate).toBe(true);
    });

    it('extracts task proposal from campus item with registration deadline', () => {
      const item: CampusItem = {
        id: 'ci10',
        title: 'Hackathon Registration',
        type: 'HACKATHON',
        description: 'Annual hackathon registration closes September 28, 2026.',
        date: '2026-10-01',
        startTime: '10:00',
        endTime: '18:00',
        registrationDeadline: 'September 28, 2026',
        venue: 'Main Auditorium',
        eligibility: 'All students',
        organizer: 'Coding Club',
        importantActions: ['Register team on Devfolio'],
        sourceText: 'Raw text',
      };

      const proposal = proposeTaskFromCampusItem(item);
      expect(proposal.title).toBe('Register team on Devfolio');
      expect(proposal.dueDate).toBe('2026-09-28');
      expect(proposal.source).toBe('notice');
      expect(proposal.sourceId).toBe('ci10');
      expect(proposal.isAmbiguousDate).toBe(false);
    });
  });

  describe('suggestReminder', () => {
    it('suggests reminder rule based on distance to deadline', () => {
      const rule = suggestReminder('2026-12-31');
      expect(['1d_before', 'morning_of', '2h_before']).toContain(rule);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssignmentModal from './AssignmentModal';
import AssignmentCard from './AssignmentCard';
import type { Assignment } from '../lib/types';
import { MemoryRouter } from 'react-router-dom';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import Settings from '../pages/Settings';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
  useUser: vi.fn(),
  useClerk: vi.fn(),
}));

const mockTaskWithReminder: Assignment = {
  id: 'task-1',
  title: 'Physics CAT-2 preparation',
  description: 'Study modules 1 and 2',
  dueDate: '2026-09-22',
  dueTime: '19:30',
  priority: 'high',
  status: 'PENDING',
  reminder: '30m_before',
  reminderRemindAt: '2026-09-22T13:30:00.000Z',
  reminderTimezone: 'Asia/Kolkata',
  reminderStatus: 'pending',
};

const mockTaskWithCustomReminder: Assignment = {
  id: 'task-2',
  title: 'Research Proposal',
  description: 'Submit PDF to portal',
  dueDate: '2026-09-30',
  dueTime: '23:59',
  priority: 'urgent',
  status: 'PENDING',
  reminder: 'custom',
  reminderRemindAt: '2026-09-22T14:00:00.000Z',
  reminderTimezone: 'UTC',
  reminderStatus: 'pending',
};

const mockTaskWithoutReminder: Assignment = {
  id: 'task-3',
  title: 'Lab Notebook',
  description: '',
  dueDate: '2026-09-28',
  status: 'PENDING',
  reminder: null,
};

describe('Task Reminders Frontend UI', () => {
  const mockGetToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({
      getToken: mockGetToken.mockResolvedValue('test-clerk-token'),
      userId: 'user_alice',
      isLoaded: true,
    });
    (useUser as Mock).mockReturnValue({
      user: { fullName: 'Alice Chen', primaryEmailAddress: { emailAddress: 'alice@campusflow.app' } },
      isLoaded: true,
    });
    (useClerk as Mock).mockReturnValue({
      signOut: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AssignmentModal Reminder Controls', () => {
    it('pre-selects default reminder on new task creation', () => {
      render(
        <AssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
          defaultReminderOffset="15m_before"
        />,
      );

      const reminderSelect = screen.getByLabelText(/reminder/i) as HTMLSelectElement;
      expect(reminderSelect.value).toBe('15m_before');
    });

    it('shows custom date and time picker when "custom" reminder is selected', () => {
      render(
        <AssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      const reminderSelect = screen.getByLabelText(/reminder/i);
      fireEvent.change(reminderSelect, { target: { value: 'custom' } });

      expect(screen.getByText(/custom reminder time/i)).toBeDefined();
      expect(screen.getByLabelText(/date \*/i)).toBeDefined();
      expect(screen.getByLabelText(/time \*/i)).toBeDefined();
    });

    it('validates that custom date and time are required for custom reminder', () => {
      const mockSave = vi.fn();
      render(
        <AssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={mockSave}
        />,
      );

      fireEvent.change(screen.getByLabelText(/task title \*/i), {
        target: { value: 'New Test Task' },
      });
      fireEvent.change(screen.getByLabelText(/reminder/i), {
        target: { value: 'custom' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create task/i }));

      expect(screen.getByText(/please choose both a date and time for your custom reminder/i)).toBeDefined();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('submits task with custom date, time, and timezone when valid', () => {
      const mockSave = vi.fn();
      render(
        <AssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={mockSave}
        />,
      );

      fireEvent.change(screen.getByLabelText(/task title \*/i), {
        target: { value: 'Calculus Assignment' },
      });
      fireEvent.change(screen.getByLabelText(/reminder/i), {
        target: { value: 'custom' },
      });
      fireEvent.change(screen.getByLabelText(/date \*/i), {
        target: { value: '2026-09-22' },
      });
      fireEvent.change(screen.getByLabelText(/time \*/i), {
        target: { value: '19:30' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create task/i }));

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Calculus Assignment',
          reminder: 'custom',
          customDate: '2026-09-22',
          customTime: '19:30',
        }),
      );
    });

    it('prevents relative reminder if task has no due date', () => {
      const mockSave = vi.fn();
      render(
        <AssignmentModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={mockSave}
        />,
      );

      fireEvent.change(screen.getByLabelText(/task title \*/i), {
        target: { value: 'No Deadline Goal' },
      });
      fireEvent.change(screen.getByLabelText(/reminder/i), {
        target: { value: '30m_before' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create task/i }));

      expect(screen.getByText(/a due date is required for relative reminders/i)).toBeDefined();
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('AssignmentCard Reminder Display & Actions', () => {
    it('renders relative reminder badge', () => {
      render(
        <AssignmentCard
          assignment={mockTaskWithReminder}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByText(/reminder: 30 minutes before/i)).toBeDefined();
    });

    it('renders custom reminder badge formatted with time', () => {
      render(
        <AssignmentCard
          assignment={mockTaskWithCustomReminder}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByText(/reminder:/i)).toBeDefined();
    });

    it('renders "No reminder" badge when task has no reminder', () => {
      render(
        <AssignmentCard
          assignment={mockTaskWithoutReminder}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByText(/no reminder/i)).toBeDefined();
    });

    it('calls onRemoveReminder when clicking remove icon on badge', () => {
      const mockRemove = vi.fn();
      render(
        <AssignmentCard
          assignment={mockTaskWithReminder}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onRemoveReminder={mockRemove}
        />,
      );

      const removeBtn = screen.getByRole('button', { name: /remove reminder/i });
      fireEvent.click(removeBtn);

      expect(mockRemove).toHaveBeenCalledWith('task-1');
    });
  });

  describe('Settings Notifications Tab & Test Notification UI', () => {
    it('renders Web Push and default reminder preference controls', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/reminders/preferences')) {
          return {
            ok: true,
            json: async () => ({
              defaultReminderOffset: '15m_before',
              timezone: 'Asia/Kolkata',
            }),
          };
        }
        if (url.includes('/api/gmail/status')) {
          return {
            ok: true,
            json: async () => ({ connected: false }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(
        <MemoryRouter initialEntries={['/settings']}>
          <Settings />
        </MemoryRouter>,
      );

      // Switch to Notifications tab
      const notifTab = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(notifTab);

      expect(screen.getByText(/desktop web push notifications/i)).toBeDefined();
      expect(screen.getByText(/default task reminder/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /test notification/i })).toBeDefined();
    });
  });
});

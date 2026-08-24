export type Course = { id: string; code: string; title: string; instructor: string; credits: number; attendedClasses: number; totalClasses: number; attendanceThreshold: number; }; export type Assignment = { id: string; courseId: string; title: string; description: string; dueDate: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'; };

export type ItemType = 'HACKATHON' | 'WORKSHOP' | 'EVENT' | 'ANNOUNCEMENT' | 'DEADLINE';

export type CampusItem = {
  id: string;
  title: string | null;
  type: ItemType | null;
  description: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  registrationDeadline: string | null;
  venue: string | null;
  eligibility: string | null;
  organizer: string | null;
  importantActions: string[];
  sourceText: string;
};

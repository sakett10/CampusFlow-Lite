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

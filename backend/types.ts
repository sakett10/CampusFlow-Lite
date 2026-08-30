export type Course = {
  id: string;
  code: string;
  title: string;
  instructor: string;
  credits: number;
  attendedClasses: number;
  totalClasses: number;
  attendanceThreshold: number;
};

export type Assignment = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
};

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
  sourceType?: 'notice' | 'personal';
};


export interface GmailSyncStats {
  checked: number;
  newMessages: number;
  skipped: number;
  processed: number;
  failed?: number;
  noticesCreated?: number;
}



export interface StructuredGmailMessage {
  id: string;
  threadId: string | null;
  sender: string;
  recipient: string;
  subject: string;
  date: string;
  snippet: string;
  bodyText: string;
  sourceMessageId: string;
}

export type NoticeCategory =
  | 'academic'
  | 'exam'
  | 'assignment'
  | 'administrative'
  | 'event'
  | 'placement'
  | 'admission'
  | 'hostel'
  | 'fee'
  | 'scholarship'
  | 'alert'
  | 'general';

export type NoticePriority = 'low' | 'normal' | 'important' | 'urgent';

export interface NoticeCandidate {
  title: string;
  summary: string;
  category: NoticeCategory;
  priority: NoticePriority;
  audience?: string;
  importantDates?: Array<{
    label: string;
    date: string;
  }>;
  actionRequired?: string;
  venue?: string;
  links?: Array<{
    label: string;
    url: string;
  }>;
  documents?: Array<{
    label: string;
    url: string;
  }>;
  isCampusWide?: boolean;
  isPersonal?: boolean;
  source: {
    provider: 'gmail';
    messageId: string;
    sender: string;
    subject: string;
  };
}


export type NoticeStatus = 'pending' | 'approved' | 'published' | 'rejected' | 'archived';


export interface Notice {
  id: string;
  createdByUserId: string;
  title: string;
  summary: string;
  category: NoticeCategory;
  priority: NoticePriority;
  audience?: string | null;
  importantDates?: Array<{ label: string; date: string }>;
  actionRequired?: string | null;
  venue?: string | null;
  links?: Array<{ label: string; url: string }>;
  documents?: Array<{ label: string; url: string }>;
  sourceProvider: string;
  sourceConnectionId?: string | null;
  sourceAccountEmail?: string | null;
  sourceMessageId?: string | null;
  sourceSender?: string | null;
  sourceSubject?: string | null;
  status: NoticeStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export type NotificationType = 'notice_published' | 'pending_review' | 'deadline_reminder' | 'system';

export interface AppNotification {
  id: string;
  userId?: string | null;
  recipientRole: 'all' | 'student' | 'reviewer';
  title: string;
  message: string;
  type: NotificationType;
  noticeId?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface CampusEmail {
  id: string;
  userId: string;
  sourceAccountEmail: string;
  sourceMessageId: string;
  sourceThreadId?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
  bodyText?: string | null;
  snippet?: string | null;
  analysisStatus: 'pending' | 'completed' | 'failed' | 'skipped';
  analysisError?: string | null;
  category?: string | null;
  audience?: string | null;
  importance?: string | null;
  summary?: string | null;
  eventDate?: string | null;
  deadline?: string | null;
  venue?: string | null;
  organizer?: string | null;
  importantActions?: string[];
  links?: Array<{ label: string; url: string }>;
  documents?: Array<{ label: string; url: string }>;
  createdAt?: string;
  updatedAt?: string;
}






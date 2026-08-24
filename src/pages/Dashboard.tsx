import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckSquare,
  AlertTriangle,
  Clock,
  CheckCircle,
  Plus,
  Loader2,
  CalendarX,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Radio
} from 'lucide-react';
import { useCourses } from '../hooks/useCourses';
import { useAssignments } from '../hooks/useAssignments';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { getAssignmentStats, getUpcomingAssignments, getAttendanceWarnings, getAttendanceStats } from '../lib/dashboardUtils';
import { isOverdue, formatDueDate } from '../lib/dateUtils';
import { calculateClassesNeeded, calculateAttendancePercentage } from '../lib/attendance';

import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import CampusItemCard from '../components/CampusItemCard';

export default function Dashboard() {
  const { courses } = useCourses();
  const { assignments } = useAssignments();
  const { items: feedItems, deleteItem, isLoading: feedLoading } = useCampusFeed();
  const navigate = useNavigate();

  const assignmentStats = getAssignmentStats(assignments);
  const upcomingAssignments = getUpcomingAssignments(assignments);
  const attendanceWarnings = getAttendanceWarnings(courses);
  const attendanceStats = getAttendanceStats(courses);

  const recentFeedItems = feedItems.slice(0, 2);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between mb-2">
        <div>
          <h1 className="text-[length:var(--cf-text-display-size)] leading-tight font-bold tracking-tight text-[var(--cf-text)]">
            Overview
          </h1>
          <p className="mt-1 text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)]">
            Your academic intelligence and campus opportunities.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="md" className="flex flex-col transition-all hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-border-strong)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[length:var(--cf-text-label-size)] font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)]">
              Courses
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cf-surface-muted)]">
              <BookOpen className="h-4 w-4 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
            </div>
          </div>
          <span className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
            {courses.length}
          </span>
        </Card>

        <Card padding="md" className="flex flex-col transition-all hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-border-strong)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[length:var(--cf-text-label-size)] font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)]">
              Assignments
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cf-surface-muted)]">
              <CheckSquare className="h-4 w-4 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
            </div>
          </div>
          <span className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
            {assignmentStats.total}
          </span>
        </Card>

        <Card padding="md" className="flex flex-col transition-all hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-border-strong)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[length:var(--cf-text-label-size)] font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)]">
              Pending Tasks
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cf-surface-muted)]">
              <Clock className="h-4 w-4 text-[var(--cf-text-tertiary)]" aria-hidden="true" />
            </div>
          </div>
          <span className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
            {assignmentStats.pending}
          </span>
        </Card>

        <Card padding="md" className="flex flex-col transition-all hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-border-strong)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[length:var(--cf-text-label-size)] font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)]">
              At Risk
            </span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${attendanceStats.belowThreshold > 0 ? 'bg-[var(--cf-danger-subtle)]' : 'bg-[var(--cf-success-subtle)]'}`}>
              {attendanceStats.belowThreshold > 0 ? (
                <TrendingDown className="h-4 w-4 text-[var(--cf-danger)]" aria-hidden="true" />
              ) : (
                <TrendingUp className="h-4 w-4 text-[var(--cf-success)]" aria-hidden="true" />
              )}
            </div>
          </div>
          <span className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
            {attendanceStats.belowThreshold}
          </span>
        </Card>
      </div>

      {/* Intelligence & Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Intelligence CTA */}
        <Card padding="md" className="col-span-1 flex flex-col justify-between border-[var(--cf-ai)]/30 bg-[var(--cf-ai-subtle)]/50 transition-all hover:shadow-[var(--cf-elev-2)] hover:border-[var(--cf-ai)]/50">
          <div>
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[var(--cf-radius-md)] bg-[var(--cf-ai)]/15 text-[var(--cf-ai)]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-[length:var(--cf-text-title-size)] font-bold text-[var(--cf-text)]">
              Campus Intelligence
            </h2>
            <p className="text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
              Turn messy campus emails and WhatsApp messages into structured opportunities and deadlines automatically.
            </p>
          </div>
          <Button
            variant="ai"
            className="mt-6 w-full justify-center"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate('/campus-feed')}
          >
            Analyze a notice
          </Button>
        </Card>

        {/* Recent Feed */}
        <div className="col-span-1 flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[length:var(--cf-text-subtitle-size)] font-semibold text-[var(--cf-text)]">
              Recent Campus Activity
            </h2>
            <Link to="/campus-feed" className="text-[length:var(--cf-text-body-size)] font-medium text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-text)]">
              View all &rarr;
            </Link>
          </div>

          {feedLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--cf-text-tertiary)]" />
            </div>
          ) : recentFeedItems.length === 0 ? (
            <Card padding="md" className="flex flex-1 items-center justify-center border-dashed border-[var(--cf-border-strong)] shadow-none">
              <EmptyState
                icon={<Radio className="h-7 w-7" />}
                title="No campus items yet"
                description="Start adding hackathons, workshops, and events from your campus groups."
              />
            </Card>
          ) : (
            <div className="grid h-full grid-cols-1 gap-4 sm:grid-cols-2">
              {recentFeedItems.map(item => (
                <CampusItemCard key={item.id} item={item} onDelete={deleteItem} />
              ))}
              {recentFeedItems.length === 1 && (
                <div className="hidden rounded-[var(--cf-radius-lg)] border border-dashed border-[var(--cf-border)] bg-transparent sm:block"></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Academics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming Assignments Section */}
        <Card padding="md" className="flex min-h-[300px] flex-col">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[length:var(--cf-text-subtitle-size)] font-semibold text-[var(--cf-text)]">Upcoming Assignments</h2>
            <Link to="/assignments" className="text-[length:var(--cf-text-body-size)] font-medium text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-text)]">View all &rarr;</Link>
          </div>

          {assignments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-6">
              <EmptyState
                icon={<CheckSquare className="h-7 w-7" />}
                title="No assignments added"
                description="Track your upcoming tasks by adding them to the assignments page."
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate('/assignments')} leftIcon={<Plus className="h-4 w-4" />}>
                    Add Assignment
                  </Button>
                }
              />
            </div>
          ) : upcomingAssignments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-6">
              <EmptyState
                icon={<CheckCircle className="h-7 w-7 text-[var(--cf-success)]" />}
                title="You're all caught up!"
                description="No pending or in-progress assignments."
              />
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto">
              {upcomingAssignments.map(assignment => {
                const course = courses.find(c => c.id === assignment.courseId);
                const isLate = isOverdue(assignment.dueDate, assignment.status);

                return (
                  <div key={assignment.id} className="group flex flex-col rounded-[var(--cf-radius-md)] border border-[var(--cf-border)] p-4 transition-colors hover:bg-[var(--cf-surface-muted)]">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h4 className="line-clamp-1 font-semibold text-[var(--cf-text)]">{assignment.title}</h4>
                      {assignment.status === 'IN_PROGRESS' && (
                        <Badge variant="info">In Progress</Badge>
                      )}
                      {isLate && assignment.status !== 'IN_PROGRESS' && (
                        <Badge variant="danger">Overdue</Badge>
                      )}
                    </div>
                    <div className="mb-3 text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-secondary)]">{course ? course.title : 'Unknown Course'}</div>
                    <div className="mt-auto flex items-center justify-between text-[length:var(--cf-text-caption-size)] font-medium">
                      <div className={`flex items-center gap-1.5 ${isLate ? 'text-[var(--cf-danger)]' : 'text-[var(--cf-text-secondary)]'}`}>
                        {isLate ? <CalendarX className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        {formatDueDate(assignment.dueDate)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Attendance Warnings Section */}
        <Card padding="md" className="flex min-h-[300px] flex-col">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[length:var(--cf-text-subtitle-size)] font-semibold text-[var(--cf-text)]">Attendance Alerts</h2>
            <Link to="/courses" className="text-[length:var(--cf-text-body-size)] font-medium text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-text)]">View courses &rarr;</Link>
          </div>

          {courses.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-6">
              <EmptyState
                icon={<BookOpen className="h-7 w-7" />}
                title="No courses added"
                description="Add your courses to start tracking attendance automatically."
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate('/courses')} leftIcon={<Plus className="h-4 w-4" />}>
                    Add Course
                  </Button>
                }
              />
            </div>
          ) : attendanceWarnings.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-6">
              <EmptyState
                icon={<CheckCircle className="h-7 w-7 text-[var(--cf-success)]" />}
                title="Great job!"
                description="All your courses meet the attendance thresholds."
              />
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto">
              {attendanceWarnings.map(course => {
                const percentage = calculateAttendancePercentage(course.attendedClasses, course.totalClasses);
                const needed = calculateClassesNeeded(course.attendedClasses, course.totalClasses, course.attendanceThreshold);

                return (
                  <div key={course.id} className="rounded-[var(--cf-radius-md)] border border-[var(--cf-danger)]/20 bg-[var(--cf-danger-subtle)] p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <h4 className="flex items-center gap-2 font-semibold text-[var(--cf-text)]">
                          <AlertTriangle className="h-4 w-4 text-[var(--cf-danger)]" />
                          {course.code}
                        </h4>
                        <p className="mt-0.5 text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-secondary)]">{course.title}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-[number:var(--cf-text-title-weight)] text-[var(--cf-danger)]">{percentage}%</span>
                        <div className="text-[length:var(--cf-text-micro-size)] font-semibold uppercase tracking-wider text-[var(--cf-text-secondary)]">
                          Req: {course.attendanceThreshold}%
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-[var(--cf-radius-sm)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-2.5 text-[length:var(--cf-text-caption-size)] text-[var(--cf-text-secondary)]">
                      {needed === -1 ? (
                        <span className="font-medium text-[var(--cf-danger)]">It is mathematically impossible to reach the {course.attendanceThreshold}% threshold.</span>
                      ) : (
                        <span>You must attend the next <span className="font-semibold text-[var(--cf-text)]">{needed}</span> consecutive classes to reach the threshold.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

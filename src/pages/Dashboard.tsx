import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  Radio,
  Loader2
} from 'lucide-react';
import { useCourses } from '../hooks/useCourses';
import { useAssignments } from '../hooks/useAssignments';
import { useCampusFeed } from '../hooks/useCampusFeed';
import { getAssignmentStats, getAttendanceWarnings, getPriorityItems, getUpcomingTimeline } from '../lib/dashboardUtils';

import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import CampusItemCard from '../components/CampusItemCard';

import PrioritySection from '../components/dashboard/PrioritySection';
import AcademicHealth from '../components/dashboard/AcademicHealth';
import UpcomingTimeline from '../components/dashboard/UpcomingTimeline';

export default function Dashboard() {
  const { courses } = useCourses();
  const { assignments } = useAssignments();
  const { items: feedItems, deleteItem, isLoading: feedLoading } = useCampusFeed();
  const navigate = useNavigate();

  const assignmentStats = useMemo(() => getAssignmentStats(assignments), [assignments]);
  const attendanceWarnings = useMemo(() => getAttendanceWarnings(courses), [courses]);
  const priorityItems = useMemo(() => getPriorityItems(courses, assignments, feedItems), [courses, assignments, feedItems]);
  const upcomingTimeline = useMemo(() => getUpcomingTimeline(courses, assignments, feedItems), [courses, assignments, feedItems]);

  const recentFeedItems = useMemo(() => feedItems.slice(0, 2), [feedItems]);

  // Dynamic Summary Text
  const totalActionable = priorityItems.length;
  const summaryText = totalActionable > 0
    ? `You have ${totalActionable} item${totalActionable === 1 ? '' : 's'} needing your attention across ${courses.length} courses.`
    : `You're all caught up! Exploring opportunities across ${courses.length} courses.`;

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-8 cf-animate-enter">
      {/* Hero / Overview */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
            Command Center
          </h1>
          <p className="mt-2 max-w-xl text-[length:var(--cf-text-subtitle-size)] leading-[var(--cf-text-subtitle-line)] font-[number:var(--cf-text-subtitle-weight)] text-[var(--cf-text-secondary)]">
            {summaryText}
          </p>
        </div>
      </header>

      {/* Priority / Needs Attention */}
      <PrioritySection items={priorityItems} />

      {/* Academic Health & Upcoming Timeline */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AcademicHealth
          courses={courses}
          assignmentStats={assignmentStats}
          attendanceWarningsCount={attendanceWarnings.length}
        />
        <UpcomingTimeline items={upcomingTimeline} />
      </section>

      {/* Campus Intelligence & Recent Activity */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Intelligence CTA */}
        <Card padding="lg" className="col-span-1 flex flex-col justify-between border-[var(--cf-ai)]/30 bg-[var(--cf-ai-subtle)]/30 transition-all duration-[var(--cf-transition-normal)] hover:shadow-[var(--cf-elev-ai)] hover:border-[var(--cf-ai)]/50 group">
          <div>
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[var(--cf-radius-lg)] bg-[var(--cf-ai)]/15 text-[var(--cf-ai)] group-hover:scale-110 transition-transform duration-[var(--cf-transition-normal)]">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mb-3 text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)]">
              Campus Intelligence
            </h2>
            <p className="text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
              Turn messy campus emails and WhatsApp messages into structured opportunities and deadlines instantly using AI.
            </p>
          </div>
          <Button
            variant="ai"
            size="lg"
            className="mt-8 w-full justify-center shadow-[var(--cf-elev-ai)]"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate('/campus-feed')}
          >
            Analyze a notice
          </Button>
        </Card>

        {/* Recent Feed */}
        <div className="col-span-1 flex flex-col gap-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)]">
              Recent Campus Activity
            </h2>
            <Link to="/campus-feed" className="flex items-center gap-1 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-brand)]">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {feedLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-8 shadow-[var(--cf-elev-1)]">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--cf-brand)]" />
            </div>
          ) : recentFeedItems.length === 0 ? (
            <Card padding="lg" className="flex flex-1 items-center justify-center border-dashed border-[var(--cf-border-strong)] shadow-none bg-[var(--cf-surface-muted)]/50">
              <EmptyState
                icon={<Radio className="h-8 w-8" />}
                title="No campus items yet"
                description="Start adding hackathons, workshops, and events from your campus groups."
              />
            </Card>
          ) : (
            <div className="grid h-full grid-cols-1 gap-5 sm:grid-cols-2">
              {recentFeedItems.map(item => (
                <div key={item.id} className="cf-animate-enter">
                  <CampusItemCard item={item} onDelete={deleteItem} />
                </div>
              ))}
              {recentFeedItems.length === 1 && (
                <div className="hidden rounded-[var(--cf-radius-lg)] border border-dashed border-[var(--cf-border)] bg-[var(--cf-surface-muted)]/30 sm:block"></div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

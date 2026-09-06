import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
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
    <div className="mx-auto max-w-6xl space-y-10 pb-8">
      {/* Hero / Overview */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[length:var(--cf-text-display-size)] leading-[var(--cf-text-display-line)] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
            Academic Overview
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

      {/* Campus Notices & Recent Activity */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Notices Hub CTA */}
        <Card padding="lg" className="col-span-1 flex flex-col justify-between border border-[var(--cf-border)] bg-[var(--cf-surface)] transition-all duration-[var(--cf-transition-normal)] hover:shadow-sm group">
          <div>
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[var(--cf-radius-lg)] bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20">
              <Radio className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mb-3 text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)]">
              Notice Board
            </h2>
            <p className="text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
              Stay informed about verified academic announcements, workshops, hackathons, and registration deadlines across campus.
            </p>
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="mt-8 w-full justify-center"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate('/notices')}
          >
            Browse all notices
          </Button>
        </Card>

        {/* Recent Notices */}
        <div className="col-span-1 flex flex-col gap-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-text)]">
              Recent Notices
            </h2>
            <Link to="/notices" className="flex items-center gap-1 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)] transition-colors hover:text-[var(--cf-brand)]">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {feedLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-[var(--cf-radius-lg)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-8 shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--cf-brand)]" />
            </div>
          ) : recentFeedItems.length === 0 ? (
            <Card padding="lg" className="flex flex-1 items-center justify-center border-dashed border-[var(--cf-border-strong)] shadow-none bg-[var(--cf-surface-muted)]/50">
              <EmptyState
                icon={<Radio className="h-8 w-8" />}
                title="No notices yet"
                description="Verified campus announcements and event deadlines will appear here."
              />
            </Card>
          ) : (
            <div className="grid h-full grid-cols-1 gap-5 sm:grid-cols-2">
              {recentFeedItems.map(item => (
                <div key={item.id} className="cf-animate-enter">
                  <CampusItemCard item={item} onDelete={deleteItem} canDelete={item.sourceType !== 'notice'} />
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

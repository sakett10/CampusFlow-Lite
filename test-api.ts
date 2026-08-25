import app from './api/index.js';

const PORT = 3005;
const server = app.listen(PORT, async () => {
  try {
    const baseUrl = `http://localhost:${PORT}/api`;
    console.log('Testing Courses API...');

    const courseRes = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'CS101',
        title: 'Intro to CS',
        instructor: 'Dr. Smith',
        credits: 4
      })
    });
    if (!courseRes.ok) throw new Error('Failed to create course');
    const course = await courseRes.json();
    console.log('Created course:', course.id);

    const getCoursesRes = await fetch(`${baseUrl}/courses`);
    const courses = await getCoursesRes.json();
    console.log(`Fetched ${courses.length} courses`);

    const putCourseRes = await fetch(`${baseUrl}/courses/${course.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Introduction to Computer Science' })
    });
    const updatedCourse = await putCourseRes.json();
    console.log('Updated course title:', updatedCourse.title);

    const patchCourseRes = await fetch(`${baseUrl}/courses/${course.id}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendedClasses: 5, totalClasses: 6 })
    });
    const patchedCourse = await patchCourseRes.json();
    console.log('Patched course attendance:', patchedCourse.attendedClasses, '/', patchedCourse.totalClasses);

    console.log('\nTesting Assignments API...');

    const assignmentRes = await fetch(`${baseUrl}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: course.id,
        title: 'Lab 1',
        description: 'First lab',
        dueDate: '2026-09-10'
      })
    });
    if (!assignmentRes.ok) throw new Error('Failed to create assignment');
    const assignment = await assignmentRes.json();
    console.log('Created assignment:', assignment.id);

    const getAssignRes = await fetch(`${baseUrl}/assignments`);
    const assignments = await getAssignRes.json();
    console.log(`Fetched ${assignments.length} assignments`);

    const putAssignRes = await fetch(`${baseUrl}/assignments/${assignment.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Lab 1 - Variables' })
    });
    const updatedAssignment = await putAssignRes.json();
    console.log('Updated assignment title:', updatedAssignment.title);

    const patchAssignRes = await fetch(`${baseUrl}/assignments/${assignment.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    });
    const patchedAssignment = await patchAssignRes.json();
    console.log('Patched assignment status:', patchedAssignment.status);

    console.log('\nCleanup...');
    
    const delAssignRes = await fetch(`${baseUrl}/assignments/${assignment.id}`, { method: 'DELETE' });
    console.log('Deleted assignment:', delAssignRes.status);

    const delCourseRes = await fetch(`${baseUrl}/courses/${course.id}`, { method: 'DELETE' });
    console.log('Deleted course:', delCourseRes.status);

    console.log('All tests passed!');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});


import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, CheckSquare, LayoutDashboard } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/courses', icon: BookOpen, label: 'Courses' },
    { path: '/assignments', icon: CheckSquare, label: 'Assignments' },
  ];

  return (
    <div className='flex h-screen bg-gray-50'>
      <aside className='w-64 bg-white border-r border-gray-200'>
        <div className='p-6'>
          <h1 className='text-2xl font-bold text-indigo-600'>CampusFlow</h1>
        </div>
        <nav className='mt-6'>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-6 py-3 text-sm font-medium ${
                  isActive ? 'text-indigo-600 bg-indigo-50 border-r-4 border-indigo-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className='w-5 h-5 mr-3' />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className='flex-1 overflow-y-auto p-8'>
        <Outlet />
      </main>
    </div>
  );
}

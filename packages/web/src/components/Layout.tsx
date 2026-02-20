import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  adminOnly?: boolean;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Scan', href: '/scan' },
  { name: 'Validation', href: '/validation' },
  { name: 'Lots', href: '/batches' },
  {
    name: 'Admin',
    href: '/admin',
    adminOnly: true,
    children: [
      { name: 'Pipelines', href: '/admin/pipelines' },
      { name: 'Tables de référence', href: '/admin/lookup-tables' },
      { name: 'Bulletin de soin', href: '/admin/bulletin-soin' },
      { name: 'Utilisateurs', href: '/admin/users' },
      { name: 'Journal d\'audit', href: '/admin/audit-log' },
    ],
  },
];

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo and Navigation */}
            <div className="flex">
              <Link
                to="/"
                className="flex items-center px-2 text-xl font-bold text-gray-900"
              >
                ScanFactory
              </Link>
              <nav className="hidden sm:ml-8 sm:flex sm:space-x-4">
                {navigation.map((item) => {
                  // Skip admin items for non-admin users
                  if (item.adminOnly && !isAdmin) return null;

                  const isActive = location.pathname.startsWith(item.href);

                  // Dropdown menu for items with children
                  if (item.children) {
                    return (
                      <div key={item.name} className="relative">
                        <button
                          onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                          className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            isActive
                              ? 'bg-primary-100 text-primary-700'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          {item.name}
                          <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {adminMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setAdminMenuOpen(false)}
                            />
                            <div className="absolute left-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                              <div className="py-1">
                                {item.children.map((child) => (
                                  <Link
                                    key={child.name}
                                    to={child.href}
                                    onClick={() => setAdminMenuOpen(false)}
                                    className={`block px-4 py-2 text-sm ${
                                      location.pathname === child.href
                                        ? 'bg-gray-100 text-gray-900'
                                        : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    {child.name}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* User menu */}
            <div className="flex items-center">
              {user && (
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600">
                    {user.name}
                    <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {user.role}
                    </span>
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

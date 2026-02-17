import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Scan', href: '/scan' },
  { name: 'Validation', href: '/validation' },
  { name: 'Lots', href: '/batches' },
];

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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
                  const isActive = location.pathname.startsWith(item.href);
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

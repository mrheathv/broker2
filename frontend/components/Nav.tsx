'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/performance', label: 'Performance' },
  { href: '/policies', label: 'Policies' },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-base font-semibold text-indigo-400 tracking-tight">
              Model Board
            </span>
            <div className="flex gap-1">
              {links.map(({ href, label }) => {
                const active = pathname === href || pathname?.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'bg-indigo-900/60 text-indigo-300'
                        : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost text-xs">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

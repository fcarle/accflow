import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col py-8 px-4 min-h-screen shadow-lg">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-primary tracking-tight">Admin Panel</h1>
        </div>
        <nav className="flex-1">
          <ul className="space-y-3">
            <li>
              <Link href="/admin" className="flex items-center px-4 py-2.5 rounded-md text-gray-700 font-medium hover:bg-primary/10 hover:text-primary transition group">
                <span className="material-icons mr-3 text-gray-500 group-hover:text-primary">dashboard</span>
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/admin/users" className="flex items-center px-4 py-2.5 rounded-md text-gray-700 font-medium hover:bg-primary/10 hover:text-primary transition group">
                <span className="material-icons mr-3 text-gray-500 group-hover:text-primary">group</span>
                Users
              </Link>
            </li>
            <li>
              <Link href="/admin/settings" className="flex items-center px-4 py-2.5 rounded-md text-gray-700 font-medium hover:bg-primary/10 hover:text-primary transition group">
                <span className="material-icons mr-3 text-gray-500 group-hover:text-primary">settings</span>
                Settings
              </Link>
            </li>
            <li>
              <Link href="/admin/data" className="flex items-center px-4 py-2.5 rounded-md text-gray-700 font-medium hover:bg-primary/10 hover:text-primary transition group">
                <span className="material-icons mr-3 text-gray-500 group-hover:text-primary">storage</span>
                Data
              </Link>
            </li>
          </ul>
        </nav>
        {/* Optional: Add a sign out button or other footer items here */}
      </aside>
      <main className="flex-1 p-6 md:p-10">
        {children}
      </main>
    </div>
  );
} 
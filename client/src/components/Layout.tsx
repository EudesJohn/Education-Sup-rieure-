/** Layout principal — Deep Focus.
 *  Sidebar glass avec backdrop-filter, navigation modernisée. */

import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

interface LayoutProps {
  children: ReactNode
  title?: string
}

const teacherNavItems = [
  {
    section: 'Enseignant',
    items: [
      { label: 'Tableau de bord', path: '/teacher/dashboard', icon: DashboardIcon },
      { label: 'Sessions', path: '/teacher/sessions', icon: SessionIcon },
      { label: 'Banque de questions', path: '/teacher/exercises', icon: ExerciseIcon },
      { label: 'Listes étudiants', path: '/teacher/student-lists', icon: ListIcon },
      { label: 'Dossiers pédag.', path: '/teacher/documents', icon: DocIcon },
    ],
  },
]

const adminNavItems = [
  {
    section: 'Administration',
    items: [
      { label: 'Dashboard', path: '/admin', icon: DashboardIcon },
      { label: 'Établissements', path: '/admin/institutions', icon: InstitutionIcon },
      { label: 'Filières', path: '/admin/filieres', icon: FiliereIcon },
      { label: 'Matières', path: '/admin/subjects', icon: SubjectIcon },
      { label: 'Années académiques', path: '/admin/academic-years', icon: YearIcon },
      { label: 'Classes', path: '/admin/classes', icon: ClassIcon },
    ],
  },
]

export function Layout({ children, title }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { teacher, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isAdmin = teacher?.role === 'admin'
  const navItems = isAdmin ? adminNavItems : teacherNavItems

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/teacher/dashboard' && location.pathname.startsWith(path))

  return (
    <div className="min-h-screen flex bg-deep-space">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===== Sidebar Glass ===== */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 w-60
        glass-sidebar
        transform transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-cyan to-violet-iq flex items-center justify-center shadow-lg shadow-neon-cyan/15 flex-shrink-0">
            <span className="text-deep-space text-xs font-bold">P</span>
          </div>
          <div>
            <h1 className="font-heading font-bold text-sm leading-tight text-white tracking-tight">PEAN</h1>
            <p className="text-[9px] text-muted/60 leading-tight tracking-widest uppercase">PLATEFORME ACADÉMIQUE</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-5 px-3 space-y-5 overflow-y-auto">
          {navItems.map((group) => (
            <div key={group.section}>
              <p className="px-3 text-[10px] font-semibold text-muted/40 uppercase tracking-[0.18em] mb-2">
                {group.section}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.path)
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                        transition-all duration-200 group
                        ${active
                          ? 'bg-neon-cyan/8 text-neon-cyan shadow-[inset_0_0_0_1px_rgba(6,242,219,0.15)]'
                          : 'text-muted hover:text-white hover:bg-white/[0.04]'
                        }
                      `}
                    >
                      <item.icon className={`w-5 h-5 flex-shrink-0 transition-colors duration-200 ${active ? 'text-neon-cyan' : 'text-muted/50 group-hover:text-white/60'}`} />
                      <span>{item.label}</span>
                      {active && (
                        <span className="ml-auto w-1 h-1 rounded-full bg-neon-cyan shadow-[0_0_6px_rgba(6,242,219,0.5)]" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profil utilisateur */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-iq to-neon-cyan flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {teacher?.full_name?.charAt(0) || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">
                {teacher?.full_name || 'Utilisateur'}
              </p>
              <p className="text-[11px] text-muted/60 truncate leading-tight">{teacher?.institution || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-muted/40 hover:text-rose-accent hover:bg-rose-accent/10 transition-all"
              title="Déconnexion"
            >
              <LogoutIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Contenu principal ===== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="lg:hidden h-14 flex items-center justify-between px-4 bg-midnight border-b border-white/5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-muted hover:text-white hover:bg-white/[0.05] transition-all"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-neon-cyan to-violet-iq flex items-center justify-center">
              <span className="text-deep-space text-[8px] font-bold">P</span>
            </div>
            <span className="font-heading font-bold text-sm text-white">PEAN</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-muted hover:text-rose-accent hover:bg-rose-accent/10 transition-all"
          >
            <LogoutIcon className="w-4 h-4" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-7 xl:p-8 overflow-y-auto">
          {title && (
            <div className="mb-7 animate-fade-in" key={`title-${location.pathname}`}>
              <h1 className="font-heading text-2xl font-semibold text-white tracking-tight">{title}</h1>
              <div className="mt-2.5 w-14 h-0.5 bg-gradient-to-r from-neon-cyan to-violet-iq rounded-full" />
            </div>
          )}
          <div className="animate-fade-in-up" key={location.pathname} style={{ animationDelay: '0.1s' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// ===== Icônes SVG inline =====

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}

function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  )
}

function ExerciseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  )
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function InstitutionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  )
}

function FiliereIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  )
}

function SubjectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
    </svg>
  )
}

function YearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  )
}

function ClassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )
}

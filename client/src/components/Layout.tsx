/** Layout principal — Deep Focus.
 *  Sidebar glass avec backdrop-filter, navigation modernisée. */

import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import {
  DashboardIcon, SessionIcon, ExerciseIcon, ListIcon, DocIcon,
  MenuIcon, LogoutIcon, InstitutionIcon, FiliereIcon,
  SubjectIcon, YearIcon, ClassIcon,
} from '@/components/icons'

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
                      aria-current={active ? 'page' : undefined}
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
              aria-label="Déconnexion"
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
            aria-label="Ouvrir le menu"
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
            aria-label="Déconnexion"
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

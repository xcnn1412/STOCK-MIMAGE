'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import {
    LogOut, Menu, X,
    PanelLeftClose, PanelLeftOpen,
    ChevronDown, ChevronRight,
} from "lucide-react"
import { logout } from '@/app/login/actions'
import { useLanguage } from '@/contexts/language-context'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NAV_GROUPS, type NavGroup } from '@/lib/nav-config'

// Module accent colors
const moduleAccents: Record<string, { color: string; bg: string; activeBg: string }> = {
    stock: { color: 'text-zinc-700 dark:text-zinc-300', bg: 'bg-zinc-100 dark:bg-zinc-800', activeBg: 'bg-zinc-100 dark:bg-zinc-800/80' },
    events: { color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/30', activeBg: 'bg-sky-50 dark:bg-sky-950/30' },
    kpi: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', activeBg: 'bg-amber-50 dark:bg-amber-950/30' },
    costs: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', activeBg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    finance: { color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/30', activeBg: 'bg-teal-50 dark:bg-teal-950/30' },
    crm: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', activeBg: 'bg-blue-50 dark:bg-blue-950/30' },
    admin: { color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', activeBg: 'bg-purple-50 dark:bg-purple-950/30' },
}

// ============================================================================
// Sidebar Props
// ============================================================================
interface SidebarProps {
    role?: string
    allowedModules?: string[]
}

// ============================================================================
// Sidebar Group — Desktop (expanded)
// ============================================================================
function SidebarGroup({
    group,
    collapsed,
    isActive,
    getLabel,
    getGroupLabel,
}: {
    group: NavGroup
    collapsed: boolean
    isActive: (href: string, exact?: boolean) => boolean
    getLabel: (key: string) => string
    getGroupLabel: (key: string) => string
}) {
    const hasActiveRoute = group.items.some(item => isActive(item.href, item.exact))
    const [open, setOpen] = useState(hasActiveRoute)
    const accent = moduleAccents[group.key] || moduleAccents.stock

    // Auto-expand when a route becomes active
    useEffect(() => {
        if (hasActiveRoute) setOpen(true)
    }, [hasActiveRoute])

    if (collapsed) {
        // Collapsed: sidebar is fully hidden, don't render anything
        return null
    }

    return (
        <div className="space-y-0.5">
            {/* Group trigger */}
            <button
                onClick={() => setOpen(!open)}
                className={`
          w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider
          transition-colors duration-200 select-none
          ${hasActiveRoute
                        ? `${accent.color}`
                        : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400'
                    }
        `}
            >
                <group.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left truncate">{getGroupLabel(group.key)}</span>
                {open
                    ? <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                    : <ChevronRight className="h-3 w-3 opacity-60 shrink-0" />
                }
            </button>

            {/* Items */}
            {open && (
                <div className="space-y-0.5 ml-2 pl-3 border-l-2 border-zinc-200/60 dark:border-zinc-700/40">
                    {group.items.map(item => {
                        const active = isActive(item.href, item.exact)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${active
                                        ? `${accent.activeBg} text-zinc-900 dark:text-zinc-100 font-semibold`
                                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/40'
                                    }
                `}
                            >
                                <item.icon className={`h-4 w-4 shrink-0 ${active ? accent.color : 'text-zinc-400 dark:text-zinc-500'}`} />
                                <span className="truncate">{getLabel(item.labelKey)}</span>
                                {active && (
                                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100 shrink-0" />
                                )}
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ============================================================================
// Main Sidebar Component
// ============================================================================
export default function Sidebar({ role, allowedModules = ['stock'] }: SidebarProps) {
    const { t } = useLanguage()
    const pathname = usePathname()
    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)

    // Restore sidebar state from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved === 'true') setCollapsed(true)
    }, [])

    const toggleCollapsed = useCallback(() => {
        setCollapsed(prev => {
            const next = !prev
            localStorage.setItem('sidebar-collapsed', String(next))
            return next
        })
    }, [])

    // Close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false)
    }, [pathname])

    const visibleGroups = NAV_GROUPS.filter(group => {
        if (group.adminOnly && role !== 'admin') return false
        if (!allowedModules.includes(group.key)) return false
        return true
    })

    const getLabel = (labelKey: string): string => {
        return (t.nav as Record<string, string>)[labelKey] ?? labelKey
    }

    const getGroupLabel = (key: string): string => {
        return (t.navGroups as Record<string, string>)?.[key] ?? key
    }

    const isActive = (href: string, exact?: boolean) => {
        if (exact) return pathname === href
        return pathname === href || pathname.startsWith(href + '/')
    }

    // Sidebar content (shared between desktop and mobile)
    const sidebarContent = (isMobile: boolean) => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className={`flex items-center ${collapsed && !isMobile ? 'justify-center px-2' : 'px-4'} h-14 shrink-0 border-b border-zinc-200/80 dark:border-zinc-800/80`}>
                <Link href="/dashboard" className="flex items-center gap-2.5 group">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 text-white text-xs font-bold shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900 shrink-0">
                        EA
                    </div>
                    {(!collapsed || isMobile) && (
                        <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            Office Hub
                        </span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav className={`flex-1 overflow-y-auto py-3 ${collapsed && !isMobile ? 'px-1.5' : 'px-3'} space-y-4`}
                style={{ scrollbarWidth: 'thin' }}
            >
                {visibleGroups.map(group => (
                    <SidebarGroup
                        key={group.key}
                        group={group}
                        collapsed={collapsed && !isMobile}
                        isActive={isActive}
                        getLabel={getLabel}
                        getGroupLabel={getGroupLabel}
                    />
                ))}
            </nav>

            {/* Bottom: Language + Collapse + Logout */}
            <div className={`shrink-0 border-t border-zinc-200/80 dark:border-zinc-800/80 py-3 ${collapsed && !isMobile ? 'px-1.5' : 'px-3'} space-y-1`}>
                {/* Language Switcher */}
                {(!collapsed || isMobile) ? (
                    <div className="px-1 mb-1">
                        <LanguageSwitcher />
                    </div>
                ) : (
                    <div className="flex justify-center mb-1">
                        <LanguageSwitcher />
                    </div>
                )}

                {/* Collapse Toggle (desktop only) */}
                {!isMobile && (
                    <button
                        onClick={toggleCollapsed}
                        className="w-full flex items-center justify-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors duration-200"
                    >
                        {collapsed ? (
                            <PanelLeftOpen className="h-4 w-4" />
                        ) : (
                            <>
                                <PanelLeftClose className="h-4 w-4 shrink-0" />
                                <span className="flex-1 text-left truncate">{(t.common as Record<string, string>)?.collapse || 'ย่อเมนู'}</span>
                            </>
                        )}
                    </button>
                )}

                {/* Logout */}
                <form action={logout}>
                    <button
                        type="submit"
                        className={`
              w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
              text-zinc-400 hover:text-red-600 hover:bg-red-50
              dark:text-zinc-500 dark:hover:text-red-400 dark:hover:bg-red-950/30
              transition-colors duration-200
              ${collapsed && !isMobile ? 'justify-center' : ''}
            `}
                    >
                        <LogOut className="h-4 w-4 shrink-0" />
                        {(!collapsed || isMobile) && <span>{t.common.logout}</span>}
                    </button>
                </form>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <aside
                className={`
          hidden md:flex flex-col shrink-0 h-screen sticky top-0
          bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm
          border-r border-zinc-200/80 dark:border-zinc-800/80
          transition-all duration-300 ease-in-out z-40 overflow-hidden
          ${collapsed ? 'w-0 border-r-0' : 'w-[240px]'}
        `}
            >
                {sidebarContent(false)}
            </aside>

            {/* Desktop: Floating toggle when collapsed */}
            {collapsed && (
                <button
                    onClick={toggleCollapsed}
                    className="hidden md:flex fixed top-3 left-3 z-50 items-center justify-center h-10 w-10 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                    title={(t.common as Record<string, string>)?.expand || 'ขยายเมนู'}
                >
                    <PanelLeftOpen className="h-4.5 w-4.5" />
                </button>
            )}

            {/* Mobile: Top bar with hamburger */}
            <div className="md:hidden sticky top-0 z-50 flex items-center justify-between h-14 px-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-lg border-b border-zinc-200/80 dark:border-zinc-800/80">
                <Link href="/dashboard" className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 text-white text-xs font-bold dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900">
                        EA
                    </div>
                    <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Office Hub
                    </span>
                </Link>
                <div className="flex items-center gap-1">
                    <LanguageSwitcher />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-lg"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                </div>
            </div>

            {/* Mobile: Overlay sidebar */}
            {mobileOpen && (
                <>
                    <div
                        className="md:hidden fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside
                        className="md:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-white dark:bg-zinc-900 z-50 shadow-2xl animate-in slide-in-from-left duration-300"
                    >
                        {sidebarContent(true)}
                    </aside>
                </>
            )}
        </>
    )
}

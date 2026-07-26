'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import {
    LogOut, Menu, X,
    PanelLeftClose, PanelLeftOpen,
    ChevronDown, ChevronRight, User, BookOpen, Trophy, Sparkles,
} from "lucide-react"
import { logout } from '@/app/login/actions'
import { useLanguage } from '@/contexts/language-context'
import { LanguageSwitcher } from '@/components/language-switcher'
import NotificationBell from '@/components/notification-bell'
import LicenseCountdownChip from '@/components/license-countdown-chip'
// WORLDCUP 2026 (temporary) — remove after the tournament
import WorldCupChip from '@/components/worldcup/worldcup-chip'
import { NAV_GROUPS, type NavGroup } from '@/lib/nav-config'

// Module accent colors. `bar` is the solid-color sliver shown to the left of
// active items — Tailwind's JIT can't infer color names, so each entry must
// declare its bar class explicitly (don't try to derive from `color`).
const moduleAccents: Record<string, { color: string; bg: string; activeBg: string; bar: string }> = {
    overview: { color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30', activeBg: 'bg-indigo-50/70 dark:bg-indigo-950/30',  bar: 'bg-indigo-500 dark:bg-indigo-400' },
    stock:    { color: 'text-zinc-700 dark:text-zinc-300',     bg: 'bg-zinc-100 dark:bg-zinc-800',       activeBg: 'bg-zinc-100/80 dark:bg-zinc-800/80',     bar: 'bg-zinc-700 dark:bg-zinc-300' },
    events:   { color: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-50 dark:bg-sky-950/30',       activeBg: 'bg-sky-50/70 dark:bg-sky-950/30',        bar: 'bg-sky-500 dark:bg-sky-400' },
    kpi:      { color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30',   activeBg: 'bg-amber-50/70 dark:bg-amber-950/30',    bar: 'bg-amber-500 dark:bg-amber-400' },
    costs:    { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', activeBg: 'bg-emerald-50/70 dark:bg-emerald-950/30', bar: 'bg-emerald-500 dark:bg-emerald-400' },
    finance:  { color: 'text-teal-600 dark:text-teal-400',     bg: 'bg-teal-50 dark:bg-teal-950/30',     activeBg: 'bg-teal-50/70 dark:bg-teal-950/30',      bar: 'bg-teal-500 dark:bg-teal-400' },
    crm:      { color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-950/30',     activeBg: 'bg-blue-50/70 dark:bg-blue-950/30',      bar: 'bg-blue-500 dark:bg-blue-400' },
    jobs:     { color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', activeBg: 'bg-violet-50/70 dark:bg-violet-950/30',  bar: 'bg-violet-500 dark:bg-violet-400' },
    checkin:  { color: 'text-rose-600 dark:text-rose-400',     bg: 'bg-rose-50 dark:bg-rose-950/30',     activeBg: 'bg-rose-50/70 dark:bg-rose-950/30',      bar: 'bg-rose-500 dark:bg-rose-400' },
    admin:    { color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', activeBg: 'bg-purple-50/70 dark:bg-purple-950/30',  bar: 'bg-purple-500 dark:bg-purple-400' },
}

// ============================================================================
// Sidebar Props
// ============================================================================
interface SidebarProps {
    role?: string
    allowedModules?: string[]
    /** ISO 8601 license expiry from server. null when env not configured. */
    licenseExpiresAt?: string | null
    /** WORLDCUP 2026 (temporary) — the user's champion pick, remove after the tournament */
    worldcupTeam?: string | null
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
    onNavigate,
    role,
}: {
    group: NavGroup
    collapsed: boolean
    isActive: (href: string, exact?: boolean) => boolean
    getLabel: (key: string) => string
    getGroupLabel: (key: string) => string
    onNavigate?: () => void
    role?: string
}) {
    const visibleItems = group.items.filter(item => !item.adminOnly || role === 'admin')
    const hasActiveRoute = visibleItems.some(item => isActive(item.href, item.exact))
    const [open, setOpen] = useState(false) // Start closed for SSR safety
    const accent = moduleAccents[group.key] || moduleAccents.stock

    // Auto-expand when a route is active (runs after hydration)
    useEffect(() => {
        if (hasActiveRoute) setOpen(true)
    }, [hasActiveRoute])

    if (collapsed) {
        // Collapsed: sidebar is fully hidden, don't render anything
        return null
    }

    return (
        <div className="space-y-0.5">
            {/* Group trigger — single chevron with rotation animation, hover
                lifts text color so the whole row feels interactive. */}
            <button
                onClick={() => setOpen(!open)}
                className={`
                    w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-[0.08em]
                    transition-colors duration-200 select-none group/trigger
                    ${hasActiveRoute
                        ? accent.color
                        : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }
                `}
            >
                <group.icon className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover/trigger:scale-110`} />
                <span className="flex-1 text-left truncate">{getGroupLabel(group.key)}</span>
                <ChevronDown className={`h-3 w-3 opacity-50 shrink-0 transition-transform duration-300 ${open ? '' : '-rotate-90'}`} />
            </button>

            {/* Items — left-edge accent bar marks the active route; the bar
                color matches the module accent so each section reads as one
                visual family. Hover gets a subtle inset bg, no bar. */}
            {open && (
                <div className="space-y-px pl-2.5 ml-2 border-l border-zinc-200/60 dark:border-zinc-800/60">
                    {visibleItems.map(item => {
                        const active = isActive(item.href, item.exact)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavigate}
                                className={`
                                    relative flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-[13.5px] font-medium
                                    transition-all duration-150
                                    ${active
                                        ? `${accent.activeBg} text-zinc-900 dark:text-zinc-50 font-semibold`
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40'
                                    }
                                `}
                            >
                                {/* Active indicator: a vertical pill flush to the left edge */}
                                {active && (
                                    <span className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${accent.bar}`} />
                                )}
                                <item.icon className={`h-4 w-4 shrink-0 transition-colors ${active ? accent.color : 'text-zinc-400 dark:text-zinc-500'}`} />
                                <span className="truncate">{getLabel(item.labelKey)}</span>
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
export default function Sidebar({ role, allowedModules = ['stock'], licenseExpiresAt = null, worldcupTeam = null }: SidebarProps) {
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

    // Prevent body scroll when mobile sidebar is open
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [mobileOpen])

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

    const closeMobile = useCallback(() => setMobileOpen(false), [])

    // Sidebar navigation content (shared between desktop and mobile drawer)
    const sidebarNav = (isMobile: boolean) => (
        <div className="flex flex-col h-full">
            {/* Logo — gradient hairline at the bottom replaces the hard
                border so the header blends into the nav below. Avatar gains
                a subtle hover lift; role label sits beneath the wordmark. */}
            <div className={`relative flex items-center ${collapsed && !isMobile ? 'justify-center px-2' : 'px-4'} h-16 shrink-0`}>
                <Link href="/dashboard" className="flex items-center gap-3 group" onClick={isMobile ? closeMobile : undefined}>
                    <div className="relative shrink-0">
                        <img
                            src="/icon/officehub.svg"
                            alt="Office Hub"
                            className="h-9 w-9 rounded-xl shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-0.5"
                        />
                        {/* Live indicator — tiny emerald dot suggests "online/connected" */}
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-zinc-900" />
                    </div>
                    {(!collapsed || isMobile) && (
                        <div className="flex flex-col leading-tight">
                            <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                                Office Hub
                            </span>
                            {role && (
                                <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 mt-0.5">
                                    {role === 'admin' ? '★ Admin' : 'Staff'}
                                </span>
                            )}
                        </div>
                    )}
                </Link>
                {/* Soft gradient hairline divider */}
                <div className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-800" />
            </div>

            {/* Navigation */}
            <nav className={`flex-1 overflow-y-auto py-3 ${collapsed && !isMobile ? 'px-1.5' : 'px-3'} space-y-4`}
                style={{ scrollbarWidth: 'thin' }}
            >
                {/* Featured: Sales Board — เฉพาะผู้ได้รับสิทธิ์ module 'salesboard' (admin เห็นเสมอ) */}
                {(role === 'admin' || allowedModules.includes('salesboard')) && (
                <Link
                    href="/sales-board"
                    onClick={isMobile ? closeMobile : undefined}
                    className={`
                        group relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-semibold
                        transition-all duration-200 overflow-hidden animate-sales-glow
                        hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/25 active:translate-y-0 active:scale-[0.98]
                        ${collapsed && !isMobile ? 'justify-center' : ''}
                        ${isActive('/sales-board')
                            ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
                            : 'bg-gradient-to-r from-amber-50 to-orange-50/40 dark:from-amber-950/25 dark:to-orange-950/10 text-amber-700 dark:text-amber-400 hover:from-amber-100 hover:to-orange-100/60 dark:hover:from-amber-950/45'
                        }
                    `}
                    title="สรุปยอดขาย"
                >
                    {/* Shine sweep on hover */}
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 dark:via-white/15 to-transparent skew-x-12 animate-sales-shine group-hover:animate-none group-hover:transition-transform group-hover:duration-700 group-hover:ease-out group-hover:translate-x-full"
                    />
                    {isActive('/sales-board') && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-amber-500 dark:bg-amber-400" />
                    )}
                    <Trophy className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-12 group-hover:drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
                    {(!collapsed || isMobile) && <span className="truncate">สรุปยอดขาย</span>}
                </Link>
                )}

                {visibleGroups.map(group => (
                    <SidebarGroup
                        key={group.key}
                        group={group}
                        collapsed={collapsed && !isMobile}
                        isActive={isActive}
                        getLabel={getLabel}
                        getGroupLabel={getGroupLabel}
                        onNavigate={isMobile ? closeMobile : undefined}
                        role={role}
                    />
                ))}
            </nav>

            {/* Bottom — gradient hairline replaces hard border. Profile +
                How-to grouped above utility row (lang + collapse + logout). */}
            <div className={`relative shrink-0 pt-3 pb-3 ${collapsed && !isMobile ? 'px-1.5' : 'px-3'} space-y-0.5`}>
                <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-800" />

                {/* License countdown — hidden when desktop sidebar is collapsed
                    (rail is w-0 anyway); shown in mobile drawer always */}
                {(!collapsed || isMobile) && (
                    <>
                        {/* WORLDCUP 2026 (temporary) — remove after the tournament */}
                        <WorldCupChip team={worldcupTeam} />
                        <LicenseCountdownChip expiresAtIso={licenseExpiresAt} />
                    </>
                )}

                {/* My Profile */}
                <Link
                    href="/profile"
                    onClick={isMobile ? closeMobile : undefined}
                    className={`
                        relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-medium
                        transition-all duration-150
                        ${collapsed && !isMobile ? 'justify-center' : ''}
                        ${isActive('/profile', true)
                            ? 'bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-50 font-semibold'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40'
                        }
                    `}
                    title="โปรไฟล์ของฉัน"
                >
                    {isActive('/profile', true) && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-zinc-700 dark:bg-zinc-300" />
                    )}
                    <User className="h-4 w-4 shrink-0" />
                    {(!collapsed || isMobile) && <span className="truncate">โปรไฟล์ของฉัน</span>}
                </Link>

                {/* How-to guide */}
                <Link
                    href="/howto"
                    onClick={isMobile ? closeMobile : undefined}
                    className={`
                        relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-medium
                        transition-all duration-150
                        ${collapsed && !isMobile ? 'justify-center' : ''}
                        ${isActive('/howto')
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
                        }
                    `}
                    title={t.nav.howto || 'คู่มือใช้งาน'}
                >
                    {isActive('/howto') && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-emerald-500 dark:bg-emerald-400" />
                    )}
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {(!collapsed || isMobile) && <span className="truncate">{t.nav.howto || 'คู่มือใช้งาน'}</span>}
                </Link>

                {/* What's New — บันทึกอัปเดตของระบบ (เห็นได้ทุก user, ข้อมูลจาก whats-new/updates.ts) */}
                <Link
                    href="/whats-new"
                    onClick={isMobile ? closeMobile : undefined}
                    className={`
                        relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] font-medium
                        transition-all duration-150
                        ${collapsed && !isMobile ? 'justify-center' : ''}
                        ${isActive('/whats-new')
                            ? 'bg-violet-50/70 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 font-semibold'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-950/20'
                        }
                    `}
                    title="มีอะไรใหม่"
                >
                    {isActive('/whats-new') && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-violet-500 dark:bg-violet-400" />
                    )}
                    <Sparkles className="h-4 w-4 shrink-0" />
                    {(!collapsed || isMobile) && <span className="truncate">มีอะไรใหม่</span>}
                </Link>

                {/* Utility row — language + collapse + logout grouped on one
                    line when expanded; stacked centered when collapsed. */}
                <div className={`pt-2 mt-1 border-t border-zinc-200/40 dark:border-zinc-800/40 ${collapsed && !isMobile ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}`}>
                    <div className="shrink-0">
                        <LanguageSwitcher />
                    </div>

                    {/* Spacer pushes collapse + logout to the right when expanded */}
                    {(!collapsed || isMobile) && <div className="flex-1" />}

                    {/* Collapse Toggle (desktop only) */}
                    {!isMobile && (
                        <button
                            onClick={toggleCollapsed}
                            className="flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800/60 transition-colors duration-150"
                            title={(t.common as Record<string, string>)?.collapse || 'ย่อเมนู'}
                        >
                            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </button>
                    )}

                    {/* Logout */}
                    <form action={logout}>
                        <button
                            type="submit"
                            className="flex items-center justify-center h-8 w-8 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:text-zinc-500 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-colors duration-150"
                            title={t.common.logout}
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {/* ====== DESKTOP SIDEBAR (md+) ====== */}
            <aside
                className={`
                    hidden md:flex flex-col shrink-0 h-screen sticky top-0
                    bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl
                    border-r border-zinc-200/60 dark:border-zinc-800/60
                    transition-all duration-300 ease-in-out z-40 overflow-hidden
                    sidebar-scroll
                    ${collapsed ? 'w-0 border-r-0' : 'w-[244px]'}
                `}
            >
                {sidebarNav(false)}
            </aside>

            {/* Desktop: Floating toggle when collapsed — pill shape with the
                Office Hub mark above the chevron, hinting at the brand even
                while the rail is hidden. */}
            {collapsed && (
                <button
                    onClick={toggleCollapsed}
                    className="hidden md:flex fixed top-3 left-3 z-50 flex-col items-center justify-center gap-1 h-14 w-10 rounded-2xl bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200/70 dark:border-zinc-700/70 shadow-lg hover:shadow-xl hover:scale-[1.04] active:scale-95 transition-all duration-200 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 group"
                    title={(t.common as Record<string, string>)?.expand || 'ขยายเมนู'}
                >
                    <img src="/icon/officehub.svg" alt="" className="h-5 w-5 rounded-md transition-transform duration-200 group-hover:-translate-y-0.5" />
                    <PanelLeftOpen className="h-3 w-3 opacity-60" />
                </button>
            )}

            {/* ====== MOBILE TOP BAR (<md) ====== */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-lg border-b border-zinc-200/80 dark:border-zinc-800/80">
                <Link href="/dashboard" className="flex items-center gap-2.5">
                    <img
                        src="/icon/officehub.svg"
                        alt="Office Hub"
                        className="h-8 w-8 rounded-lg shrink-0"
                    />
                    <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Office Hub
                    </span>
                </Link>
                <div className="flex items-center gap-1">
                    <NotificationBell />
                    <LanguageSwitcher />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-lg"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                </div>
            </div>

            {/* ====== MOBILE DRAWER OVERLAY ====== */}
            {mobileOpen && (
                <>
                    <div
                        className="md:hidden fixed inset-0 bg-black/50 z-[60] animate-in fade-in duration-200"
                        onClick={closeMobile}
                    />
                    <aside
                        className="md:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-white dark:bg-zinc-900 z-[70] shadow-2xl animate-in slide-in-from-left duration-300"
                    >
                        {sidebarNav(true)}
                    </aside>
                </>
            )}
        </>
    )
}

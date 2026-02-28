'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { LogOut, Menu, ChevronDown } from "lucide-react"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout } from '@/app/login/actions'
import { useLanguage } from '@/contexts/language-context'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NAV_GROUPS, type NavGroup } from '@/lib/nav-config'

// Module accent colors for premium dropdown headers
const moduleAccents: Record<string, { from: string; to: string; iconBg: string; activeBg: string }> = {
    stock: { from: 'from-zinc-700', to: 'to-zinc-900', iconBg: 'bg-zinc-100 dark:bg-zinc-800', activeBg: 'bg-zinc-50 dark:bg-zinc-800/60' },
    events: { from: 'from-sky-500', to: 'to-cyan-600', iconBg: 'bg-sky-50 dark:bg-sky-950/30', activeBg: 'bg-sky-50/60 dark:bg-sky-950/20' },
    kpi: { from: 'from-amber-500', to: 'to-orange-600', iconBg: 'bg-amber-50 dark:bg-amber-950/30', activeBg: 'bg-amber-50/60 dark:bg-amber-950/20' },
    costs: { from: 'from-emerald-500', to: 'to-teal-600', iconBg: 'bg-emerald-50 dark:bg-emerald-950/30', activeBg: 'bg-emerald-50/60 dark:bg-emerald-950/20' },
    finance: { from: 'from-teal-500', to: 'to-cyan-600', iconBg: 'bg-teal-50 dark:bg-teal-950/30', activeBg: 'bg-teal-50/60 dark:bg-teal-950/20' },
    crm: { from: 'from-blue-500', to: 'to-indigo-600', iconBg: 'bg-blue-50 dark:bg-blue-950/30', activeBg: 'bg-blue-50/60 dark:bg-blue-950/20' },
    admin: { from: 'from-purple-500', to: 'to-violet-600', iconBg: 'bg-purple-50 dark:bg-purple-950/30', activeBg: 'bg-purple-50/60 dark:bg-purple-950/20' },
}

// ============================================================================
// Desktop nav group — extracted outside Navbar to keep stable identity
// ============================================================================
function DesktopNavGroup({
    group,
    isActive,
    getLabel,
    getGroupLabel,
}: {
    group: NavGroup
    isActive: (href: string) => boolean
    getLabel: (key: string) => string
    getGroupLabel: (key: string) => string
}) {
    const hasActiveRoute = group.items.some((item) => isActive(item.href))

    // Single item group — render as direct link
    if (group.items.length === 1) {
        const item = group.items[0]
        return (
            <Link
                href={item.href}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive(item.href)
                        ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                    }`}
            >
                <item.icon className="h-4 w-4" />
                <span>{getLabel(item.labelKey)}</span>
            </Link>
        )
    }

    // Multi-item group — render as dropdown
    const accent = moduleAccents[group.key] || moduleAccents.stock

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 outline-none ${hasActiveRoute
                            ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                            : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                >
                    <group.icon className="h-4 w-4" />
                    <span>{getGroupLabel(group.key)}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px] p-1.5 rounded-xl shadow-lg border-zinc-200/80 dark:border-zinc-700/80">
                {/* Dropdown header with gradient accent */}
                <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
                    <div className={`flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-to-br ${accent.from} ${accent.to} text-white shadow-sm`}>
                        <group.icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-wide uppercase">
                        {getGroupLabel(group.key)}
                    </span>
                </div>
                <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-2 mb-1" />
                {group.items.map((item) => {
                    const active = isActive(item.href)
                    return (
                        <DropdownMenuItem key={item.href} asChild className="rounded-lg">
                            <Link
                                href={item.href}
                                className={`flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg transition-all duration-150 ${active
                                        ? `${accent.activeBg} font-semibold`
                                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                                    }`}
                            >
                                <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${active ? accent.iconBg : 'bg-zinc-100/80 dark:bg-zinc-800/60'} transition-colors`}>
                                    <item.icon className={`h-4 w-4 ${active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`} />
                                </div>
                                <span className={`text-sm ${active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                    {getLabel(item.labelKey)}
                                </span>
                                {active && (
                                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100 animate-pulse" />
                                )}
                            </Link>
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// ============================================================================
// Mobile nav group — extracted outside Navbar to keep stable identity
// ============================================================================
function MobileNavGroup({
    group,
    isActive,
    getLabel,
    getGroupLabel,
    onNavigate,
}: {
    group: NavGroup
    isActive: (href: string) => boolean
    getLabel: (key: string) => string
    getGroupLabel: (key: string) => string
    onNavigate: () => void
}) {
    const hasActiveRoute = group.items.some((item) => isActive(item.href))

    return (
        <div className="space-y-1">
            <div className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider ${hasActiveRoute
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}>
                <group.icon className="h-3.5 w-3.5" />
                <span>{getGroupLabel(group.key)}</span>
            </div>
            {group.items.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive(item.href)
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                        }`}
                    onClick={onNavigate}
                >
                    <item.icon className="h-5 w-5" />
                    <span>{getLabel(item.labelKey)}</span>
                    {isActive(item.href) && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-white dark:bg-zinc-900" />
                    )}
                </Link>
            ))}
        </div>
    )
}

// ============================================================================
// Navbar
// ============================================================================
interface NavbarProps {
    role?: string
    allowedModules?: string[]
}

export default function Navbar({ role, allowedModules = ['stock'] }: NavbarProps) {
    const [open, setOpen] = useState(false)
    const { t } = useLanguage()
    const pathname = usePathname()

    const visibleGroups = NAV_GROUPS.filter((group) => {
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

    const isActive = (href: string) => {
        return pathname === href || pathname.startsWith(href + '/')
    }

    return (
        <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/80 backdrop-blur-lg dark:border-zinc-800/80 dark:bg-zinc-900/80">
            <div className="flex h-14 items-center justify-between px-4 md:px-6">
                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-2.5 group">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 text-white text-xs font-bold shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900">
                        EA
                    </div>
                    <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                        Office Hub
                    </span>
                </Link>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-1">
                    <nav className="flex items-center gap-1">
                        {visibleGroups.map((group) => (
                            <DesktopNavGroup
                                key={group.key}
                                group={group}
                                isActive={isActive}
                                getLabel={getLabel}
                                getGroupLabel={getGroupLabel}
                            />
                        ))}
                    </nav>

                    {/* Separator */}
                    <div className="mx-2 h-6 w-px bg-zinc-200 dark:bg-zinc-700" />

                    {/* Utilities */}
                    <div className="flex items-center gap-1">
                        <LanguageSwitcher />
                        <form action={logout}>
                            <Button
                                variant="ghost"
                                size="icon"
                                title={t.common.logout}
                                className="h-9 w-9 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-200"
                            >
                                <LogOut className="h-4 w-4" />
                                <span className="sr-only">{t.common.logout}</span>
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Mobile Nav */}
                <div className="md:hidden flex items-center gap-1">
                    <LanguageSwitcher />
                    <Sheet open={open} onOpenChange={setOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">{t.common.menu}</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[85%] sm:w-[320px] p-0">
                            <SheetHeader className="p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-left">
                                <SheetTitle className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-950 text-white text-xs font-bold dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900">
                                        EA
                                    </div>
                                    <span className="text-base font-bold tracking-tight">Office Hub</span>
                                </SheetTitle>
                            </SheetHeader>
                            <div className="flex flex-col gap-6 p-4 overflow-y-auto">
                                {visibleGroups.map((group, index) => (
                                    <div key={group.key}>
                                        {index > 0 && <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-6" />}
                                        <MobileNavGroup
                                            group={group}
                                            isActive={isActive}
                                            getLabel={getLabel}
                                            getGroupLabel={getGroupLabel}
                                            onNavigate={() => setOpen(false)}
                                        />
                                    </div>
                                ))}

                                <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

                                <form action={logout}>
                                    <button
                                        type="submit"
                                        className="flex items-center gap-3 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left text-sm font-medium"
                                    >
                                        <LogOut className="h-5 w-5" />
                                        <span>{t.common.logout}</span>
                                    </button>
                                </form>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    )
}

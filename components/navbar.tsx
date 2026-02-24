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
import { logout } from '@/app/login/actions'
import { useLanguage } from '@/contexts/language-context'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NAV_GROUPS, type NavGroup } from '@/lib/nav-config'

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

    const DesktopNavGroup = ({ group }: { group: NavGroup }) => {
        const [expanded, setExpanded] = useState(true)
        const hasActiveRoute = group.items.some((item) => isActive(item.href))

        return (
            <div className="relative">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
                        hasActiveRoute
                            ? 'text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400'
                    }`}
                >
                    <group.icon className="h-3.5 w-3.5" />
                    <span>{getGroupLabel(group.key)}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                    <div className="flex gap-1 mt-1">
                        {group.items.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm font-medium transition-colors ${
                                    isActive(item.href)
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <item.icon className="h-3.5 w-3.5" />
                                <span>{getLabel(item.labelKey)}</span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    const MobileNavGroup = ({ group }: { group: NavGroup }) => {
        const hasActiveRoute = group.items.some((item) => isActive(item.href))

        return (
            <div className="space-y-1">
                <div className={`flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                    hasActiveRoute
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
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium transition-colors ${
                            isActive(item.href)
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        onClick={() => setOpen(false)}
                    >
                        <item.icon className="h-5 w-5" />
                        <span>{getLabel(item.labelKey)}</span>
                    </Link>
                ))}
            </div>
        )
    }

    return (
        <header className="border-b bg-white dark:bg-zinc-900 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
            <Link href="/dashboard" className="flex items-center gap-2">
                <div className="bg-black text-white p-1 rounded font-bold text-sm md:text-base dark:bg-white dark:text-black">EA</div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight">Office Hub</h1>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-4">
                <nav className="flex gap-3 items-start">
                    {visibleGroups.map((group) => (
                        <DesktopNavGroup key={group.key} group={group} />
                    ))}
                </nav>
                <div className="flex items-center gap-2 ml-2 border-l pl-4">
                    <LanguageSwitcher />
                    <form action={logout}>
                        <Button variant="ghost" size="icon" title={t.common.logout}>
                            <LogOut className="h-5 w-5" />
                            <span className="sr-only">{t.common.logout}</span>
                        </Button>
                    </form>
                </div>
            </div>

            {/* Mobile Nav */}
            <div className="md:hidden flex items-center gap-2">
                 <LanguageSwitcher />
                 <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="-mr-2">
                            <Menu className="h-6 w-6" />
                            <span className="sr-only">{t.common.menu}</span>
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[80%] sm:w-[385px] p-0">
                        <SheetHeader className="p-6 border-b text-left bg-muted/20">
                            <SheetTitle className="flex items-center gap-2">
                                <div className="bg-black text-white p-1.5 rounded font-bold text-sm dark:bg-white dark:text-black">EA</div>
                                Office Hub
                            </SheetTitle>
                        </SheetHeader>
                        <div className="flex flex-col gap-4 p-4 font-medium">
                            {visibleGroups.map((group, index) => (
                                <div key={group.key}>
                                    {index > 0 && <div className="h-px bg-border mb-4" />}
                                    <MobileNavGroup group={group} />
                                </div>
                            ))}
                            
                            <div className="h-px bg-border my-2" />
                            
                            <form action={logout}>
                                <button type="submit" className="flex items-center gap-3 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 px-2 py-2 rounded transition-colors w-full text-left">
                                    <LogOut className="h-5 w-5" />
                                    <span>{t.common.logout}</span>
                                </button>
                            </form>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        </header>
    )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { LogOut, Users, Menu, Package, Archive, Calendar, LayoutGrid, FileText, CheckCircle2 } from "lucide-react"
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

export default function Navbar({ role }: { role?: string }) {
    const [open, setOpen] = useState(false)
    const { t } = useLanguage()

    const NavItems = () => (
        <>
            <Link href="/items" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                <Package className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                <span>{t.nav.inventory}</span>
            </Link>
            <Link href="/kits" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                <Archive className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                <span>{t.nav.kits}</span>
            </Link>
            <Link href="/events" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                <Calendar className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                <span>{t.nav.events}</span>
            </Link>
            <Link href="/event-closures" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                <CheckCircle2 className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                <span>{t.nav.eventClosures}</span>
            </Link>
            <Link href="/example-kits" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                <FileText className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                <span>{t.nav.examples}</span>
            </Link>
            
            {role === 'admin' && (
                <>
                    <div className="h-px bg-border my-2 md:hidden" />
                    <Link href="/logs" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                        <LayoutGrid className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                        <span>{t.nav.logs}</span>
                    </Link>
                    <Link href="/users" className="flex items-center gap-3 md:gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => setOpen(false)}>
                        <Users className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" /> 
                        <span>{t.nav.users}</span>
                    </Link>
                </>
            )}
        </>
    )

    return (
        <header className="border-b bg-white dark:bg-zinc-900 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
            <Link href="/dashboard" className="flex items-center gap-2">
                <div className="bg-black text-white p-1 rounded font-bold text-sm md:text-base dark:bg-white dark:text-black">EA</div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight">Event Stock</h1>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-6">
                <nav className="flex gap-4 text-sm font-medium items-center">
                    <NavItems />
                </nav>
                <div className="flex items-center gap-2">
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
                                Event Stock
                            </SheetTitle>
                        </SheetHeader>
                        <div className="flex flex-col gap-2 p-4 font-medium text-base">
                            <NavItems />
                            
                            <div className="h-px bg-border my-4" />
                            
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

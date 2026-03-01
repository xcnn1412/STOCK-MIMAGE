'use client'

import React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Package, Briefcase, CalendarCheck, LayoutTemplate, MapPin, User, Clock, Wallet, Users, AlertTriangle } from "lucide-react"
import { useLanguage } from "@/contexts/language-context"
import TemplatesTable from './templates-table'
import type { Profile, ActivityLog, Item, Kit, KitTemplate } from '@/types'

interface DashboardViewProps {
  profile: Profile | null
  latestLog: ActivityLog | null
  itemsCount: number | null
  items: Item[] | null
  kitsCount: number | null
  activeKitsWithDetails: Kit[] | null
  usersCount: number | null
  templates?: KitTemplate[]
}

export default function DashboardView({
  profile,
  latestLog,
  itemsCount,
  items,
  kitsCount,
  activeKitsWithDetails,
  usersCount,
  templates
}: DashboardViewProps) {
  const { t } = useLanguage()

  // Calculate stats
  const totalValue = items?.reduce((sum, item) => sum + (item.price || 0), 0) || 0
  const itemsInUse = items?.filter(i => i.status === 'in_use').length || 0
  const itemsMaintenance = items?.filter(i => i.status === 'maintenance').length || 0
  const itemsDamaged = items?.filter(i => i.status === 'damaged').length || 0
  const itemsLost = items?.filter(i => i.status === 'lost').length || 0
  const activeKitsCount = activeKitsWithDetails?.length || 0

  const log: Record<string, any> = (latestLog || {}) as Record<string, any>

  const StatCard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
    <Card className="border-zinc-200 dark:border-zinc-800">
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
          <h3 className="text-2xl font-bold mt-1 tracking-tight">{value}</h3>
          {subtext && <p className="text-xs text-zinc-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-full ${colorClass}`}>
          <Icon className="w-6 h-6" />
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6 pb-10">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row gap-6 items-center bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="w-24 h-24 flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border-4 border-zinc-50 dark:border-zinc-900">
          <User className="w-10 h-10 text-zinc-400" />
        </div>

        <div className="flex-1 space-y-3 text-center md:text-left">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t.common.welcome}, {profile?.full_name?.split(' ')[0] || 'Staff'}!
            </h1>
            <p className="text-zinc-500">{t.dashboard.subtitle}</p>
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-zinc-600 bg-zinc-50 px-3 py-1 rounded-full border">
              <Clock className="h-3.5 w-3.5" />
              <span>{log.login_at ? new Date(log.login_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
            </div>

            {log.latitude && log.longitude && (
              <a
                href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-zinc-600 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 hover:bg-zinc-200 transition-colors dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>On Site</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t.dashboard.totalInventory}
          value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)}
          subtext={`${itemsCount} ${t.dashboard.itemsTotal}`}
          icon={Wallet}
          colorClass="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        />
        <StatCard
          title={t.dashboard.activeUsers}
          value={usersCount || 0}
          subtext={t.dashboard.registeredStaff}
          icon={Users}
          colorClass="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        />
        <StatCard
          title={t.dashboard.itemsInUse}
          value={itemsInUse}
          subtext={`${itemsCount! - itemsInUse} ${t.dashboard.availableRightNow}`}
          icon={Package}
          colorClass="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        />
        <StatCard
          title={t.dashboard.kitStatus}
          value={`${activeKitsCount} / ${kitsCount}`}
          subtext={t.dashboard.kitsInEvents}
          icon={Briefcase}
          colorClass="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        />
      </div>

      {/* Warning/Alert Section if issues exist */}
      {(itemsMaintenance > 0 || itemsDamaged > 0 || itemsLost > 0) && (
        <div className="bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-zinc-600 dark:text-zinc-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">Attention Needed</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              {itemsMaintenance > 0 && <><b>{itemsMaintenance} items</b> in maintenance</>}
              {itemsMaintenance > 0 && itemsDamaged > 0 && ', '}
              {itemsDamaged > 0 && <><b>{itemsDamaged} items</b> damaged</>}
              {(itemsMaintenance > 0 || itemsDamaged > 0) && itemsLost > 0 && ' and '}
              {itemsLost > 0 && <><b>{itemsLost} items</b> reported lost</>}
              . Please review the inventory.
            </p>
            <Link href="/items?status=maintenance" className="text-sm font-medium text-zinc-900 dark:text-zinc-100 underline mt-2 inline-block">View Items &rarr;</Link>
          </div>
        </div>
      )}

      {/* Active Deployments Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{t.dashboard.activeDeployments}</h2>
          {activeKitsWithDetails && activeKitsWithDetails.length > 0 && (
            <span className="text-sm text-zinc-500">{activeKitsWithDetails.length} active</span>
          )}
        </div>
        <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Mobile View: Compact Cards */}
          <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[400px] overflow-y-auto">
            {activeKitsWithDetails?.map((kit: any) => (
              <div key={kit.id} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 flex items-center justify-center shrink-0">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">{kit.name}</h3>
                    <p className="text-xs text-zinc-500 truncate">{kit.events?.name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-zinc-400">
                    {kit.events?.event_date ? new Date(kit.events.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
                  </span>
                  <Link href={`/events/${kit.events?.id}/check-kits`}>
                    <div className="px-2.5 py-1 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md">
                      Track
                    </div>
                  </Link>
                </div>
              </div>
            ))}
            {(!activeKitsWithDetails || activeKitsWithDetails.length === 0) && (
              <div className="py-8 text-center text-zinc-500 text-sm">
                {t.dashboard.noDeployments}
              </div>
            )}
          </div>

          {/* Desktop View: Compact Table */}
          <div className="hidden md:block overflow-x-auto max-h-[350px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-4 font-medium text-zinc-500 text-xs uppercase tracking-wide">{t.nav.kits}</th>
                  <th className="py-2.5 px-4 font-medium text-zinc-500 text-xs uppercase tracking-wide">{t.nav.events}</th>
                  <th className="py-2.5 px-4 font-medium text-zinc-500 text-xs uppercase tracking-wide w-24">Date</th>
                  <th className="py-2.5 px-4 font-medium text-zinc-500 text-right text-xs uppercase tracking-wide w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {activeKitsWithDetails?.map((kit: any) => (
                  <tr key={kit.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 flex items-center justify-center shrink-0">
                          <Briefcase className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">{kit.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-zinc-700 dark:text-zinc-300 truncate block max-w-[200px]">
                        {kit.events?.name || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-zinc-500 text-sm">
                      {kit.events?.event_date ? new Date(kit.events.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link href={`/events/${kit.events?.id}/check-kits`}>
                        <div className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 transition-opacity">
                          Track
                        </div>
                      </Link>
                    </td>
                  </tr>
                ))}
                {(!activeKitsWithDetails || activeKitsWithDetails.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-500">
                      {t.dashboard.noDeployments}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Templates Table */}
      {templates && <TemplatesTable templates={templates} />}

      {/* Quick Links */}
      <h2 className="text-lg font-semibold tracking-tight mt-8">{t.dashboard.quickAccess}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/items" className="group">
          <Card className="hover:shadow-lg transition-all border-zinc-200 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 h-full group-hover:scale-[1.02]">
            <CardHeader className="p-5">
              <div className="mb-4 p-2 bg-white/20 dark:bg-black/10 w-fit rounded-lg">
                <Package className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">{t.nav.inventory}</CardTitle>
              <CardDescription className="text-zinc-400 dark:text-zinc-500 text-xs">{t.dashboard.manageEquipment}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/kits" className="group">
          <Card className="hover:shadow-lg transition-all border-zinc-200 dark:border-zinc-800 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 h-full group-hover:scale-[1.02]">
            <CardHeader className="p-5">
              <div className="mb-4 p-2 bg-white/20 dark:bg-black/10 w-fit rounded-lg">
                <Briefcase className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">{t.nav.kits}</CardTitle>
              <CardDescription className="text-zinc-400 dark:text-zinc-500 text-xs">{t.dashboard.bagManagement}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/events" className="group">
          <Card className="hover:shadow-lg transition-all border-zinc-200 dark:border-zinc-800 bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900 h-full group-hover:scale-[1.02]">
            <CardHeader className="p-5">
              <div className="mb-4 p-2 bg-white/20 dark:bg-black/10 w-fit rounded-lg">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">{t.nav.events}</CardTitle>
              <CardDescription className="text-zinc-300 dark:text-zinc-500 text-xs">{t.dashboard.checkInOut}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/example-kits" className="group">
          <Card className="hover:shadow-lg transition-all border-zinc-200 dark:border-zinc-800 bg-zinc-600 dark:bg-zinc-400 text-white dark:text-zinc-900 h-full group-hover:scale-[1.02]">
            <CardHeader className="p-5">
              <div className="mb-4 p-2 bg-white/20 dark:bg-black/10 w-fit rounded-lg">
                <LayoutTemplate className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">{t.dashboard.templates}</CardTitle>
              <CardDescription className="text-zinc-300 dark:text-zinc-600 text-xs">{t.dashboard.standardSets}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}

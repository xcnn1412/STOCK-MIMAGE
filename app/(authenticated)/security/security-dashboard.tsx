'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Shield, ShieldAlert, ShieldCheck, Users, Lock, Unlock, Globe, Trash2,
    LogIn, LogOut, UserPlus, Activity, Clock, Plus, Ban, AlertTriangle, Wifi
} from 'lucide-react'
import { createIpRule, deleteIpRule, toggleIpRule } from './ip-actions'
import { unlockUser, forceLogout } from '../users/user-actions'

interface SecurityDashboardProps {
    recentLogins: any[]
    failedAttempts: any[]
    activeSessions: any[]
    lockedAccounts: any[]
    ipRules: any[]
    securityEvents: any[]
    todayLoginCount: number
    weekLoginCount: number
}

const eventIcons: Record<string, typeof Activity> = {
    LOGIN: LogIn,
    LOGOUT: LogOut,
    REGISTER: UserPlus,
    ACCOUNT_LOCKED: Lock,
    ACCOUNT_UNLOCKED: Unlock,
    LOGIN_BLOCKED_IP: Ban,
    SESSION_TIMEOUT: Clock,
    IP_RULE_CREATED: ShieldCheck,
    IP_RULE_DELETED: ShieldAlert,
}

const eventColors: Record<string, string> = {
    LOGIN: 'text-green-600 bg-green-50 dark:bg-green-950/30',
    LOGOUT: 'text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50',
    REGISTER: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    ACCOUNT_LOCKED: 'text-red-600 bg-red-50 dark:bg-red-950/30',
    ACCOUNT_UNLOCKED: 'text-green-600 bg-green-50 dark:bg-green-950/30',
    LOGIN_BLOCKED_IP: 'text-red-600 bg-red-50 dark:bg-red-950/30',
    SESSION_TIMEOUT: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
    IP_RULE_CREATED: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
    IP_RULE_DELETED: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30',
}

function formatTime(date: string) {
    return new Date(date).toLocaleString('th-TH', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    })
}

export default function SecurityDashboard({
    recentLogins, failedAttempts, activeSessions, lockedAccounts,
    ipRules, securityEvents, todayLoginCount, weekLoginCount
}: SecurityDashboardProps) {
    const [isPending, startTransition] = useTransition()
    const [newIp, setNewIp] = useState('')
    const [newReason, setNewReason] = useState('')
    const [ruleType, setRuleType] = useState<'block' | 'allow'>('block')
    const [msg, setMsg] = useState('')

    const handleCreateRule = () => {
        if (!newIp.trim()) return
        startTransition(async () => {
            const res = await createIpRule({
                ip_address: newIp.trim(),
                rule_type: ruleType,
                reason: newReason || undefined,
            })
            if (res.error) setMsg(res.error)
            else {
                setNewIp('')
                setNewReason('')
                setMsg('')
            }
        })
    }

    const handleDeleteRule = (id: string) => {
        startTransition(async () => {
            await deleteIpRule(id)
        })
    }

    const handleUnlock = (userId: string) => {
        startTransition(async () => {
            await unlockUser(userId)
        })
    }

    const handleForceLogout = (userId: string) => {
        startTransition(async () => {
            await forceLogout(userId)
        })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-rose-600">
                    <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Security Dashboard</h1>
                    <p className="text-sm text-zinc-500">ภาพรวมความปลอดภัยของระบบ</p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                                <LogIn className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{todayLoginCount}</p>
                                <p className="text-xs text-zinc-500">Login วันนี้</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                                <Activity className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{weekLoginCount}</p>
                                <p className="text-xs text-zinc-500">Login สัปดาห์นี้</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                                <Users className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{activeSessions.length}</p>
                                <p className="text-xs text-zinc-500">Active Sessions</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${lockedAccounts.length > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-zinc-50 dark:bg-zinc-800/50'}`}>
                                <Lock className={`h-5 w-5 ${lockedAccounts.length > 0 ? 'text-red-600' : 'text-zinc-400'}`} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{lockedAccounts.length}</p>
                                <p className="text-xs text-zinc-500">Locked Accounts</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Active Sessions */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4" /> Active Sessions
                        </CardTitle>
                        <CardDescription>ผู้ใช้ที่กำลังออนไลน์</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {activeSessions.length === 0 ? (
                            <p className="text-sm text-zinc-400 text-center py-4">ไม่มี session ที่ active</p>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {activeSessions.map((s: any) => (
                                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                        <div>
                                            <p className="text-sm font-medium">{s.full_name}</p>
                                            <p className="text-xs text-zinc-500">{s.phone} · {s.role}</p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleForceLogout(s.id)}
                                            disabled={isPending}
                                        >
                                            <LogOut className="h-3 w-3 mr-1" /> Logout
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Locked Accounts */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Lock className="h-4 w-4 text-red-500" /> Locked Accounts
                        </CardTitle>
                        <CardDescription>บัญชีที่ถูกล็อคจากการใส่รหัสผิด</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {lockedAccounts.length === 0 ? (
                            <div className="flex flex-col items-center py-4 text-zinc-400">
                                <ShieldCheck className="h-8 w-8 mb-2" />
                                <p className="text-sm">ไม่มีบัญชีที่ถูกล็อค</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {lockedAccounts.map((u: any) => (
                                    <div key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                                        <div>
                                            <p className="text-sm font-medium">{u.full_name}</p>
                                            <p className="text-xs text-zinc-500">
                                                {u.phone} · {u.failed_login_attempts} ครั้ง ·
                                                หมดอายุ {formatTime(u.locked_until)}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-green-300 text-green-700 hover:bg-green-50"
                                            onClick={() => handleUnlock(u.id)}
                                            disabled={isPending}
                                        >
                                            <Unlock className="h-3 w-3 mr-1" /> Unlock
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* IP Rules */}
                <Card className="md:col-span-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Globe className="h-4 w-4" /> IP Rules
                        </CardTitle>
                        <CardDescription>จัดการ Allowlist / Blocklist ของ IP</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Add Rule Form */}
                        <div className="flex flex-wrap gap-2 items-end">
                            <div className="flex-1 min-w-[160px]">
                                <label className="text-xs text-zinc-500 mb-1 block">IP Address</label>
                                <Input
                                    placeholder="192.168.1.1 หรือ ::1"
                                    value={newIp}
                                    onChange={e => setNewIp(e.target.value)}
                                    className="h-9"
                                />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <label className="text-xs text-zinc-500 mb-1 block">เหตุผล</label>
                                <Input
                                    placeholder="เหตุผล (ไม่บังคับ)"
                                    value={newReason}
                                    onChange={e => setNewReason(e.target.value)}
                                    className="h-9"
                                />
                            </div>
                            <div className="flex gap-1">
                                <Button
                                    size="sm"
                                    variant={ruleType === 'block' ? 'destructive' : 'outline'}
                                    onClick={() => setRuleType('block')}
                                    className="h-9"
                                >
                                    <Ban className="h-3 w-3 mr-1" /> Block
                                </Button>
                                <Button
                                    size="sm"
                                    variant={ruleType === 'allow' ? 'default' : 'outline'}
                                    onClick={() => setRuleType('allow')}
                                    className="h-9"
                                >
                                    <ShieldCheck className="h-3 w-3 mr-1" /> Allow
                                </Button>
                            </div>
                            <Button
                                size="sm"
                                onClick={handleCreateRule}
                                disabled={isPending || !newIp.trim()}
                                className="h-9"
                            >
                                <Plus className="h-3 w-3 mr-1" /> เพิ่ม
                            </Button>
                        </div>

                        {msg && <Alert variant="destructive"><AlertDescription>{msg}</AlertDescription></Alert>}

                        {/* Rules List */}
                        {ipRules.length === 0 ? (
                            <p className="text-sm text-zinc-400 text-center py-4">ไม่มี IP rules</p>
                        ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {ipRules.map((rule: any) => (
                                    <div key={rule.id} className={`flex items-center justify-between p-2 rounded-lg border ${rule.rule_type === 'block'
                                            ? 'bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/20'
                                            : 'bg-green-50/50 dark:bg-green-950/10 border-green-100 dark:border-green-900/20'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={rule.rule_type === 'block' ? 'destructive' : 'default'} className="text-[10px] px-1.5">
                                                {rule.rule_type === 'block' ? 'BLOCK' : 'ALLOW'}
                                            </Badge>
                                            <code className="text-sm font-mono">{rule.ip_address}</code>
                                            {rule.reason && <span className="text-xs text-zinc-500">— {rule.reason}</span>}
                                            {!rule.is_active && <Badge variant="outline" className="text-[10px]">ปิดใช้งาน</Badge>}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-zinc-400">
                                                {rule.creator?.full_name} · {formatTime(rule.created_at)}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-500"
                                                onClick={() => handleDeleteRule(rule.id)}
                                                disabled={isPending}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Security Events Timeline */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Security Events
                    </CardTitle>
                    <CardDescription>เหตุการณ์ด้านความปลอดภัยล่าสุด</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                        {securityEvents.length === 0 ? (
                            <p className="text-sm text-zinc-400 text-center py-4">ไม่มีเหตุการณ์</p>
                        ) : (
                            securityEvents.map((event: any) => {
                                const IconComp = eventIcons[event.action_type] || Activity
                                const colorClass = eventColors[event.action_type] || 'text-zinc-500 bg-zinc-50'
                                return (
                                    <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <div className={`p-1.5 rounded-md mt-0.5 ${colorClass}`}>
                                            <IconComp className="h-3.5 w-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{event.action_type.replace(/_/g, ' ')}</span>
                                                {event.user?.full_name && (
                                                    <span className="text-xs text-zinc-500">— {event.user.full_name}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[11px] text-zinc-400">{formatTime(event.created_at)}</span>
                                                {event.ip_address && event.ip_address !== 'unknown' && (
                                                    <span className="text-[11px] text-zinc-400 flex items-center gap-0.5">
                                                        <Wifi className="h-2.5 w-2.5" /> {event.ip_address}
                                                    </span>
                                                )}
                                                {event.location && (
                                                    <span className="text-[11px] text-zinc-400">{event.location}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

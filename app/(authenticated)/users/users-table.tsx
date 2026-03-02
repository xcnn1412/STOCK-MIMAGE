'use client'

import { useState, useRef, useEffect } from 'react'
import { toggleUserApproval, updateUserRole, deleteUser, updateUserModules, updateUserProfile } from './actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, Shield, User, Trash2, Clock, Pencil, AlertTriangle, ChevronDown, CreditCard, MapPin, IdCard, Building2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import BankSelect from '@/components/bank-select'
import ThaiAddressInput from '@/components/thai-address-input'
import { toast } from "sonner"
import { useLanguage } from '@/contexts/language-context'
import { parseAddress, serializeAddress, formatAddress, EMPTY_ADDRESS, type AddressData } from '@/lib/thai-address'
import { ALL_MODULES, type ModuleKey } from '@/lib/nav-config'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

interface UserWithLogin {
    id: string
    full_name: string
    nickname: string | null
    phone: string
    role: string
    is_approved: boolean
    allowed_modules: string[]
    last_login_at: string | null
    national_id: string | null
    address: string | null
    bank_name: string | null
    bank_account_number: string | null
    account_holder_name: string | null
}

// ============================================================================
// Inline Multi-select Dropdown for Modules
// ============================================================================
function ModuleDropdown({
    user, loadingId, onToggle, getGroupLabel
}: {
    user: UserWithLogin
    loadingId: string | null
    onToggle: (userId: string, moduleKey: string, currentModules: string[]) => void
    getGroupLabel: (key: string) => string
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const count = user.allowed_modules.length
    const isLoading = loadingId === user.id

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors min-w-[140px] disabled:opacity-50"
            >
                <span className="flex-1 text-left truncate">
                    {count === 0 ? (
                        <span className="text-zinc-400">ไม่มีสิทธิ์</span>
                    ) : count === ALL_MODULES.length ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">ทั้งหมด ({count})</span>
                    ) : (
                        <span>{count} โมดูล</span>
                    )}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                        สิทธิ์การเข้าถึง
                    </div>
                    <div className="py-1 max-h-60 overflow-y-auto">
                        {ALL_MODULES.map(moduleKey => {
                            const active = user.allowed_modules.includes(moduleKey)
                            return (
                                <button
                                    key={moduleKey}
                                    onClick={() => onToggle(user.id, moduleKey, user.allowed_modules)}
                                    disabled={isLoading}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-50"
                                >
                                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${active
                                        ? 'bg-emerald-500 border-emerald-500'
                                        : 'border-zinc-300 dark:border-zinc-600'
                                        }`}>
                                        {active && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className={active ? 'font-medium text-zinc-800 dark:text-zinc-200' : 'text-zinc-500'}>
                                        {getGroupLabel(moduleKey)}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// Profile Completeness Indicator
// ============================================================================
function ProfileBadge({ user }: { user: UserWithLogin }) {
    const checks = [
        !!user.full_name,
        !!user.nickname,
        !!user.national_id && user.national_id.length === 13,
        !!user.address && user.address.length > 10,
        !!user.bank_name,
        !!user.bank_account_number,
        !!user.account_holder_name,
    ]
    const filled = checks.filter(Boolean).length
    const total = checks.length
    if (filled === total) return <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 text-[10px]">ครบ</Badge>
    return <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 text-[10px]">{filled}/{total}</Badge>
}

// ============================================================================
// Expandable Row Detail
// ============================================================================
function UserDetail({ user }: { user: UserWithLogin }) {
    const addr = user.address ? formatAddress(parseAddress(user.address)) : null

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-zinc-50/50 dark:bg-zinc-800/20 rounded-lg text-sm">
            {/* ข้อมูลส่วนตัว */}
            <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                    <User className="h-3 w-3" /> ข้อมูลส่วนตัว
                </p>
                <div className="space-y-1">
                    <div className="flex gap-2">
                        <span className="text-zinc-400 w-16 shrink-0">ชื่อเล่น</span>
                        <span className="font-medium">{user.nickname || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-zinc-400 flex items-center gap-1 w-16 shrink-0"><IdCard className="h-3 w-3" /> บัตร ปชช.</span>
                        <span className="font-mono text-xs">{user.national_id || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</span>
                    </div>
                </div>
            </div>

            {/* ที่อยู่ */}
            <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> ที่อยู่ตามบัตร ปชช.
                </p>
                <p className="text-xs leading-relaxed">
                    {addr || <span className="text-zinc-300 dark:text-zinc-600">ยังไม่ได้กรอก</span>}
                </p>
            </div>

            {/* ข้อมูลการชำระเงิน */}
            <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> ข้อมูลเบิกจ่าย
                </p>
                <div className="space-y-1">
                    <div className="flex gap-2">
                        <span className="text-zinc-400 flex items-center gap-1 w-16 shrink-0"><Building2 className="h-3 w-3" /> ธนาคาร</span>
                        <span className="text-xs">{user.bank_name || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-zinc-400 w-16 shrink-0">เลขบัญชี</span>
                        <span className="font-mono text-xs">{user.bank_account_number || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-zinc-400 w-16 shrink-0">ชื่อบัญชี</span>
                        <span className="text-xs">{user.account_holder_name || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// Main Table Component
// ============================================================================
export default function UsersTable({ users }: { users: UserWithLogin[] }) {
    const { t } = useLanguage()
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
    const [editProfile, setEditProfile] = useState<{
        id: string; full_name: string; nickname: string; national_id: string;
        address: AddressData;
        bank_name: string; bank_account_number: string; account_holder_name: string
    } | null>(null)
    const [saving, setSaving] = useState(false)

    const openEdit = (user: UserWithLogin) => setEditProfile({
        id: user.id,
        full_name: user.full_name,
        nickname: user.nickname || '',
        national_id: user.national_id || '',
        address: parseAddress(user.address),
        bank_name: user.bank_name || '',
        bank_account_number: user.bank_account_number || '',
        account_holder_name: user.account_holder_name || '',
    })

    const handleSaveProfile = async () => {
        if (!editProfile) return
        setSaving(true)
        const res = await updateUserProfile(editProfile.id, {
            full_name: editProfile.full_name,
            nickname: editProfile.nickname || undefined,
            national_id: editProfile.national_id || undefined,
            address: serializeAddress(editProfile.address),
            bank_name: editProfile.bank_name || undefined,
            bank_account_number: editProfile.bank_account_number || undefined,
            account_holder_name: editProfile.account_holder_name || undefined,
        })
        if (res?.error) toast.error(res.error)
        else {
            toast.success('บันทึกข้อมูลสำเร็จ')
            setEditProfile(null)
        }
        setSaving(false)
    }

    const handleToggle = async (id: string, status: boolean) => {
        setLoadingId(id)
        const res = await toggleUserApproval(id, status)
        if (res?.error) toast.error(res.error)
        else toast.success(t.common.save)
        setLoadingId(null)
    }

    const handleRole = async (id: string, role: string) => {
        const newRole = role === 'admin' ? 'staff' : 'admin'
        setLoadingId(id)
        const res = await updateUserRole(id, newRole)
        if (res?.error) toast.error(res.error)
        else toast.success(t.common.save)
        setLoadingId(null)
    }

    const handleDeleteConfirmed = async () => {
        if (!deleteConfirm) return
        const id = deleteConfirm.id
        setDeleteConfirm(null)
        setLoadingId(id)
        const res = await deleteUser(id)
        if (res?.error) toast.error(res.error)
        else toast.success(t.common.delete)
        setLoadingId(null)
    }

    const handleModuleToggle = async (userId: string, moduleKey: string, currentModules: string[]) => {
        const newModules = currentModules.includes(moduleKey)
            ? currentModules.filter(m => m !== moduleKey)
            : [...currentModules, moduleKey]

        setLoadingId(userId)
        const res = await updateUserModules(userId, newModules)
        if (res?.error) toast.error(res.error)
        else toast.success(t.common.save)
        setLoadingId(null)
    }

    const getGroupLabel = (key: string): string => {
        return (t.navGroups as Record<string, string>)?.[key] ?? key
    }

    const formatLoginTime = (dateString: string | null) => {
        if (!dateString) return null
        const date = new Date(dateString)
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <>
            {/* ====== Desktop View ====== */}
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead>ชื่อ-นามสกุล</TableHead>
                            <TableHead>เบอร์โทร</TableHead>
                            <TableHead>สิทธิ์</TableHead>
                            <TableHead>สถานะ</TableHead>
                            <TableHead>โมดูล</TableHead>
                            <TableHead>โปรไฟล์</TableHead>
                            <TableHead>Login ล่าสุด</TableHead>
                            <TableHead className="text-right w-[160px]">จัดการ</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <>
                                <TableRow
                                    key={user.id}
                                    className={`cursor-pointer transition-colors ${expandedId === user.id ? 'bg-zinc-50 dark:bg-zinc-800/30' : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20'}`}
                                    onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                                >
                                    <TableCell>
                                        <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                            <User className="h-4 w-4 text-zinc-400" />
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="min-w-[120px]">
                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.full_name}</span>
                                            {user.nickname && (
                                                <span className="text-xs text-zinc-400 ml-1">({user.nickname})</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">{user.phone}</span>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={user.role === 'admin' ? 'default' : 'secondary'}
                                            className={user.role === 'admin' ? 'bg-purple-600' : ''}
                                        >
                                            {user.role === 'admin' ? 'Admin' : 'Staff'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {user.is_approved ? (
                                            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800">
                                                <Check className="h-3 w-3 mr-1" /> อนุมัติ
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                                                <Clock className="h-3 w-3 mr-1" /> รออนุมัติ
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell onClick={e => e.stopPropagation()}>
                                        <ModuleDropdown
                                            user={user}
                                            loadingId={loadingId}
                                            onToggle={handleModuleToggle}
                                            getGroupLabel={getGroupLabel}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <ProfileBadge user={user} />
                                    </TableCell>
                                    <TableCell>
                                        {user.last_login_at ? (
                                            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                                <Clock className="h-3 w-3" />
                                                <span>{formatLoginTime(user.last_login_at)}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggle(user.id, user.is_approved)}
                                                disabled={loadingId === user.id}
                                                title={user.is_approved ? 'ระงับสิทธิ์' : 'อนุมัติ'}
                                                className="h-8 w-8 p-0"
                                            >
                                                {user.is_approved ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRole(user.id, user.role)}
                                                disabled={loadingId === user.id}
                                                title="สลับ Admin/Staff"
                                                className="h-8 w-8 p-0"
                                            >
                                                <Shield className={`h-3.5 w-3.5 ${user.role === 'admin' ? 'text-purple-600' : 'text-zinc-400'}`} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEdit(user)}
                                                disabled={loadingId === user.id}
                                                title="แก้ไขข้อมูล"
                                                className="h-8 w-8 p-0"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setDeleteConfirm({ id: user.id, name: user.full_name })}
                                                disabled={loadingId === user.id}
                                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                title="ลบ"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {/* Expanded Detail */}
                                {expandedId === user.id && (
                                    <TableRow key={`${user.id}-detail`}>
                                        <TableCell colSpan={9} className="py-2 px-4">
                                            <UserDetail user={user} />
                                        </TableCell>
                                    </TableRow>
                                )}
                            </>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* ====== Mobile View ====== */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
                {users.map((user) => (
                    <div key={user.id} className="border rounded-xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                        {/* Header */}
                        <div
                            className="flex items-start gap-3 p-4 cursor-pointer"
                            onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                        >
                            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-zinc-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="truncate">
                                        <span className="font-semibold text-sm">{user.full_name}</span>
                                        {user.nickname && <span className="text-xs text-zinc-400 ml-1">({user.nickname})</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className={`text-[10px] ${user.role === 'admin' ? 'bg-purple-600' : ''}`}>
                                            {user.role === 'admin' ? 'Admin' : 'Staff'}
                                        </Badge>
                                        <ProfileBadge user={user} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <a href={`tel:${user.phone}`} className="text-xs text-blue-600 font-mono">{user.phone}</a>
                                    {user.is_approved ? (
                                        <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> อนุมัติ</span>
                                    ) : (
                                        <span className="text-[10px] text-amber-600 flex items-center gap-0.5"><Clock className="h-3 w-3" /> รออนุมัติ</span>
                                    )}
                                </div>
                                {user.last_login_at && (
                                    <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-1">
                                        <Clock className="h-2.5 w-2.5" />
                                        {formatLoginTime(user.last_login_at)}
                                    </div>
                                )}
                            </div>
                            <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform mt-1 shrink-0 ${expandedId === user.id ? 'rotate-180' : ''}`} />
                        </div>

                        {/* Expanded */}
                        {expandedId === user.id && (
                            <div className="border-t border-zinc-100 dark:border-zinc-800">
                                <div className="p-4">
                                    <UserDetail user={user} />
                                </div>

                                {/* Module dropdown */}
                                <div className="px-4 pb-3 space-y-2">
                                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">สิทธิ์โมดูล</p>
                                    <ModuleDropdown
                                        user={user}
                                        loadingId={loadingId}
                                        onToggle={handleModuleToggle}
                                        getGroupLabel={getGroupLabel}
                                    />
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 text-xs"
                                        onClick={() => handleToggle(user.id, user.is_approved)}
                                        disabled={loadingId === user.id}
                                    >
                                        {user.is_approved ? (
                                            <><X className="h-3.5 w-3.5 mr-1" /> ระงับ</>
                                        ) : (
                                            <><Check className="h-3.5 w-3.5 mr-1" /> อนุมัติ</>
                                        )}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleRole(user.id, user.role)} disabled={loadingId === user.id} className="text-xs">
                                        <Shield className={`h-3.5 w-3.5 ${user.role === 'admin' ? 'text-purple-600' : 'text-zinc-400'}`} />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => openEdit(user)} disabled={loadingId === user.id} className="text-xs">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDeleteConfirm({ id: user.id, name: user.full_name })}
                                        disabled={loadingId === user.id}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 text-xs"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            ยืนยันการลบ
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            คุณต้องการลบผู้ใช้ <strong>{deleteConfirm?.name}</strong> ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirmed}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            ลบผู้ใช้
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Edit Profile Dialog */}
            <Dialog open={!!editProfile} onOpenChange={(open) => !open && setEditProfile(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="h-4 w-4 text-emerald-500" />
                            แก้ไขข้อมูลส่วนตัว
                        </DialogTitle>
                    </DialogHeader>
                    {editProfile && (
                        <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-1">
                            {/* ข้อมูลส่วนตัว */}
                            <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">ข้อมูลส่วนตัว</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-name">ชื่อ-นามสกุล</Label>
                                    <Input
                                        id="edit-name"
                                        value={editProfile.full_name}
                                        onChange={e => setEditProfile({ ...editProfile, full_name: e.target.value })}
                                        placeholder="ชื่อ นามสกุล"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-nickname">ชื่อเล่น</Label>
                                    <Input
                                        id="edit-nickname"
                                        value={editProfile.nickname}
                                        onChange={e => setEditProfile({ ...editProfile, nickname: e.target.value })}
                                        placeholder="ชื่อเล่น"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-nid">เลขบัตรประชาชน (13 หลัก)</Label>
                                <Input
                                    id="edit-nid"
                                    value={editProfile.national_id}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, '').slice(0, 13)
                                        setEditProfile({ ...editProfile, national_id: v })
                                    }}
                                    placeholder="X-XXXX-XXXXX-XX-X"
                                    maxLength={13}
                                    className="font-mono tracking-wider"
                                />
                                {editProfile.national_id && editProfile.national_id.length !== 13 && (
                                    <p className="text-[10px] text-amber-500">กรุณากรอกให้ครบ 13 หลัก ({editProfile.national_id.length}/13)</p>
                                )}
                            </div>
                            {/* ที่อยู่ (ตามบัตรประชาชน) */}
                            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-2">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-3">ที่อยู่ตามบัตรประชาชน</p>
                                <ThaiAddressInput
                                    value={editProfile.address}
                                    onChange={addr => setEditProfile({ ...editProfile, address: addr })}
                                />
                            </div>

                            {/* ข้อมูลการชำระเงิน */}
                            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-2">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-3">ข้อมูลการชำระเงิน (เบิกจ่าย)</p>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label>ธนาคาร</Label>
                                        <BankSelect
                                            value={editProfile.bank_name}
                                            onChange={v => setEditProfile({ ...editProfile, bank_name: v })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="edit-account">เลขบัญชี</Label>
                                            <Input
                                                id="edit-account"
                                                value={editProfile.bank_account_number}
                                                onChange={e => {
                                                    const v = e.target.value.replace(/[^0-9-]/g, '')
                                                    setEditProfile({ ...editProfile, bank_account_number: v })
                                                }}
                                                placeholder="XXX-X-XXXXX-X"
                                                className="font-mono tracking-wider"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="edit-holder">ชื่อบัญชี</Label>
                                            <Input
                                                id="edit-holder"
                                                value={editProfile.account_holder_name}
                                                onChange={e => setEditProfile({ ...editProfile, account_holder_name: e.target.value })}
                                                placeholder="ชื่อเจ้าของบัญชี"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={() => setEditProfile(null)}>ยกเลิก</Button>
                                <Button
                                    onClick={handleSaveProfile}
                                    disabled={saving || !editProfile.full_name.trim()}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}

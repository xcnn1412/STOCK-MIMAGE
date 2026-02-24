'use client'

import { useState } from 'react'
import { toggleUserApproval, updateUserRole, deleteUser, updateUserModules } from './actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Check, X, Shield, User, Trash2, Camera, Clock, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from '@/contexts/language-context'
import { ALL_MODULES, type ModuleKey } from '@/lib/nav-config'
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

interface UserWithLogin {
    id: string
    full_name: string
    phone: string
    role: string
    is_approved: boolean
    allowed_modules: string[]
    last_login_at: string | null
    last_login_selfie_url: string | null
}

export default function UsersTable({ users }: { users: UserWithLogin[] }) {
    const { t } = useLanguage()
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [selectedImage, setSelectedImage] = useState<{ url: string; name: string; time: string } | null>(null)
    const [editingModules, setEditingModules] = useState<{ userId: string; modules: string[] } | null>(null)

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

    const handleDelete = async (id: string) => {
        if (!confirm(t.common.confirm)) return
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

    const ModuleCheckboxes = ({ user }: { user: UserWithLogin }) => (
        <div className="flex flex-wrap gap-2">
            {ALL_MODULES.map((moduleKey) => (
                <label
                    key={moduleKey}
                    className="flex items-center gap-1.5 cursor-pointer text-sm"
                >
                    <Checkbox
                        checked={user.allowed_modules.includes(moduleKey)}
                        onCheckedChange={() => handleModuleToggle(user.id, moduleKey, user.allowed_modules)}
                        disabled={loadingId === user.id}
                    />
                    <span className={user.allowed_modules.includes(moduleKey) ? 'font-medium' : 'text-muted-foreground'}>
                        {getGroupLabel(moduleKey)}
                    </span>
                </label>
            ))}
        </div>
    )

    return (
        <>
            {/* Image Preview Modal */}
            <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Camera className="h-5 w-5" />
                            {selectedImage?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4">
                        {selectedImage?.url && (
                            <img
                                src={selectedImage.url}
                                alt="Login Selfie"
                                className="w-full max-h-[400px] object-contain rounded-lg border"
                            />
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{selectedImage?.time}</span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Desktop View */}
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[80px]">ภาพ Login</TableHead>
                            <TableHead>{t.users.columns.name}</TableHead>
                            <TableHead>{t.users.columns.phone}</TableHead>
                            <TableHead>{t.users.columns.role}</TableHead>
                            <TableHead>{t.users.columns.status}</TableHead>
                            <TableHead>{(t.users as Record<string, unknown>).modules as string}</TableHead>
                            <TableHead>Login ล่าสุด</TableHead>
                            <TableHead className="text-right">{t.users.columns.actions}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    {user.last_login_selfie_url ? (
                                        <button
                                            onClick={() => setSelectedImage({
                                                url: user.last_login_selfie_url!,
                                                name: user.full_name,
                                                time: formatLoginTime(user.last_login_at) || ''
                                            })}
                                            className="relative group cursor-pointer"
                                        >
                                            <img
                                                src={user.last_login_selfie_url}
                                                alt={`${user.full_name} login`}
                                                className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 hover:border-blue-400 transition-colors"
                                            />
                                            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Camera className="h-4 w-4 text-white" />
                                            </div>
                                        </button>
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                                            <User className="h-5 w-5 text-gray-400" />
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="font-medium">{user.full_name}</TableCell>
                                <TableCell>{user.phone}</TableCell>
                                <TableCell>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                        {user.role}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {user.is_approved ? (
                                        <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Approved</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">Pending</Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <ModuleCheckboxes user={user} />
                                </TableCell>
                                <TableCell>
                                    {user.last_login_at ? (
                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span>{formatLoginTime(user.last_login_at)}</span>
                                        </div>
                                    ) : (
                                        <span className="text-sm text-gray-400">-</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => handleToggle(user.id, user.is_approved)}
                                            disabled={loadingId === user.id}
                                            title={user.is_approved ? "Revoke Approval" : "Approve User"}
                                        >
                                            {user.is_approved ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => handleRole(user.id, user.role)}
                                            disabled={loadingId === user.id}
                                            title="Toggle Admin/Staff role"
                                        >
                                            <Shield className={`h-4 w-4 ${user.role === 'admin' ? 'text-blue-600' : 'text-zinc-400'}`} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => handleDelete(user.id)}
                                            disabled={loadingId === user.id}
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile View */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
                {users.map((user) => (
                    <div key={user.id} className="flex flex-col gap-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                        <div className="flex items-start gap-3">
                            {/* Selfie Image */}
                            {user.last_login_selfie_url ? (
                                <button
                                    onClick={() => setSelectedImage({
                                        url: user.last_login_selfie_url!,
                                        name: user.full_name,
                                        time: formatLoginTime(user.last_login_at) || ''
                                    })}
                                    className="relative group cursor-pointer shrink-0"
                                >
                                    <img
                                        src={user.last_login_selfie_url}
                                        alt={`${user.full_name} login`}
                                        className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
                                    />
                                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Camera className="h-4 w-4 text-white" />
                                    </div>
                                </button>
                            ) : (
                                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 shrink-0">
                                    <User className="h-6 w-6 text-gray-400" />
                                </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-semibold leading-none tracking-tight truncate">{user.full_name}</h3>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                        {user.role}
                                    </Badge>
                                </div>
                                {user.phone && (
                                    <a href={`tel:${user.phone}`} className="text-sm text-blue-600 hover:underline mt-1 block">
                                        {user.phone}
                                    </a>
                                )}
                                {!user.phone && <p className="text-sm text-muted-foreground mt-1">No phone</p>}
                                
                                {/* Login Time */}
                                {user.last_login_at && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                        <Clock className="h-3 w-3" />
                                        <span>{formatLoginTime(user.last_login_at)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status</span>
                            {user.is_approved ? (
                                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Approved</Badge>
                            ) : (
                                <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">Pending</Badge>
                            )}
                        </div>

                        {/* Module Permissions */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                <Settings2 className="h-3.5 w-3.5" />
                                <span>{(t.users as Record<string, unknown>).modules as string}</span>
                            </div>
                            <ModuleCheckboxes user={user} />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t">
                            <Button 
                                variant="outline" 
                                className="flex-1"
                                onClick={() => handleToggle(user.id, user.is_approved)}
                                disabled={loadingId === user.id}
                            >
                                {user.is_approved ? (
                                    <><X className="h-4 w-4 mr-2" /> Revoke</>
                                ) : (
                                    <><Check className="h-4 w-4 mr-2" /> Approve</>
                                )}
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => handleRole(user.id, user.role)}
                                disabled={loadingId === user.id}
                            >
                                <Shield className={`h-4 w-4 ${user.role === 'admin' ? 'text-blue-600' : 'text-zinc-400'}`} />
                            </Button>
                            <Button 
                                variant="ghost" 
                                onClick={() => handleDelete(user.id)}
                                disabled={loadingId === user.id}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}

'use client'

import { useState } from 'react'
import { toggleUserApproval, updateUserRole, deleteUser } from './actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Check, X, Shield, User, Trash2 } from "lucide-react"
import { toast } from "sonner"

export default function UsersTable({ users }: { users: any[] }) {
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const handleToggle = async (id: string, status: boolean) => {
        setLoadingId(id)
        const res = await toggleUserApproval(id, status)
        if (res?.error) toast.error(res.error)
        else toast.success("Status updated")
        setLoadingId(null)
    }

    const handleRole = async (id: string, role: string) => {
        const newRole = role === 'admin' ? 'staff' : 'admin'
        setLoadingId(id)
        const res = await updateUserRole(id, newRole)
        if (res?.error) toast.error(res.error)
        else toast.success(`User is now ${newRole}`)
        setLoadingId(null)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this user?")) return
        setLoadingId(id)
        const res = await deleteUser(id)
        if (res?.error) toast.error(res.error)
        else toast.success("User deleted")
        setLoadingId(null)
    }

    return (
        <>
            {/* Desktop View */}
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
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
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-semibold leading-none tracking-tight">{user.full_name}</h3>
                                {user.phone && (
                                    <a href={`tel:${user.phone}`} className="text-sm text-blue-600 hover:underline mt-1 block">
                                        {user.phone}
                                    </a>
                                )}
                                {!user.phone && <p className="text-sm text-muted-foreground mt-1">No phone</p>}
                            </div>
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                {user.role}
                            </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status</span>
                            {user.is_approved ? (
                                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Approved</Badge>
                            ) : (
                                <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">Pending</Badge>
                            )}
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

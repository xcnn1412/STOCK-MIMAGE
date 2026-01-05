import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

function FormatDate({ date }: { date: string }) {
    if (!date) return null
    return <span className="whitespace-nowrap">{new Date(date).toLocaleString('th-TH')}</span>
}

export const revalidate = 0

export default async function ActivityLogsPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    if (role !== 'admin') {
        redirect('/dashboard')
    }

    const { data: logs, error } = await supabase
        .from('activity_logs')
        .select(`
            *,
            user:user_id (full_name, role),
            target:target_user_id (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)
    
    // Fallback if relation fails (e.g. if foreign keys aren't set up exactly matching the query expectation)
    // My SQL used typical references, so supabase should detect them if refreshed.
    
    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">System Logs</h2>
                <p className="text-sm md:text-base text-zinc-500">View user activities and system events.</p>
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded text-sm mt-2">
                        Error loading logs: {error.message}. Please checking RLS policies.
                    </div>
                )}
            </div>

            <Card>
                <CardHeader className="px-4 py-4 md:px-6 md:py-6">
                    <CardTitle>Activity Log</CardTitle>
                    <CardDescription>Latest 100 system activities.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 md:p-0">
                    {/* Desktop View */}
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">Timestamp</TableHead>
                                    <TableHead>User</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Details</TableHead>
                                    <TableHead className="text-right">IP Address</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs?.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-muted-foreground text-sm">
                                            <FormatDate date={log.created_at} />
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {log.user?.full_name || 'System'} 
                                            {log.user?.role && <Badge variant="outline" className="ml-2 text-xs">{log.user.role}</Badge>}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{log.action_type}</Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate text-sm">
                                            {log.target && <span className="font-semibold mr-1">Target: {log.target.full_name}</span>}
                                            <span className="text-muted-foreground">
                                                {JSON.stringify(log.details)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground font-mono">
                                            {log.ip_address}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!logs?.length && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            No logs found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden divide-y">
                        {logs?.map((log) => (
                            <div key={log.id} className="p-4 flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-sm">{log.user?.full_name || 'System'}</span>
                                        <span className="text-xs text-muted-foreground"><FormatDate date={log.created_at} /></span>
                                    </div>
                                    <Badge variant="outline">{log.action_type}</Badge>
                                </div>
                                
                                <div className="text-xs bg-muted/50 p-2 rounded text-muted-foreground break-words font-mono">
                                     {log.target && <div className="font-semibold mb-1">On: {log.target.full_name}</div>}
                                     {JSON.stringify(log.details, null, 2)}
                                </div>
                                
                                <div className="flex justify-end items-center gap-2 text-xs text-muted-foreground">
                                    <span>IP: {log.ip_address}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

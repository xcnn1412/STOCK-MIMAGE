'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Archive, Image as ImageIcon, Loader2 } from 'lucide-react'
import { uploadTicketAttachments, deleteTicketAttachment } from '@/app/(authenticated)/jobs/actions'
import { compressImage } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

interface PendingFile {
    file: File
    preview: string | null // blob URL for images
    uploading: boolean
    error: string | null
}

interface FileUploadZoneProps {
    uploadedUrls: string[]
    onUrlsChange: (urls: string[]) => void
    maxFiles?: number
    maxSizeMB?: number
    folder?: string
    compact?: boolean
}

// ============================================================================
// Helpers
// ============================================================================

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const DOC_EXTENSIONS = ['pdf', 'docx', 'xlsx']
const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z']

const ACCEPT_STRING = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
].join(',')

function getFileExt(nameOrUrl: string) {
    return (nameOrUrl.split('.').pop() || '').toLowerCase().split('?')[0]
}

function isImageFile(nameOrUrl: string) {
    return IMAGE_EXTENSIONS.includes(getFileExt(nameOrUrl))
}

function getFileIcon(nameOrUrl: string) {
    const ext = getFileExt(nameOrUrl)
    if (DOC_EXTENSIONS.includes(ext)) return <FileText className="h-5 w-5" />
    if (ARCHIVE_EXTENSIONS.includes(ext)) return <Archive className="h-5 w-5" />
    return <FileText className="h-5 w-5" />
}

function getFileName(url: string) {
    const parts = url.split('/')
    const last = parts[parts.length - 1] || 'file'
    // Remove the unique prefix (timestamp_hash.)
    const match = last.match(/^\d+_[a-z0-9]+\.(.+)$/)
    if (match) return `file.${match[1]}`
    return decodeURIComponent(last.split('?')[0])
}

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================================
// FileUploadZone Component
// ============================================================================

export default function FileUploadZone({
    uploadedUrls,
    onUrlsChange,
    maxFiles = 10,
    maxSizeMB = 10,
    folder = 'general',
    compact = false,
}: FileUploadZoneProps) {
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const totalFiles = uploadedUrls.length + pendingFiles.length

    // ── Handle file selection ──────────────────────────────────────────
    const addFiles = useCallback(async (fileList: FileList | File[]) => {
        const files = Array.from(fileList)
        const available = maxFiles - totalFiles
        if (available <= 0) return

        const toAdd = files.slice(0, available)

        // Compress images before uploading to reduce size (especially from mobile)
        const compressedFiles = await Promise.all(
            toAdd.map(file =>
                file.type.startsWith('image/') ? compressImage(file) : file
            )
        )

        const newPending: PendingFile[] = compressedFiles.map(file => ({
            file,
            preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
            uploading: true,
            error: null,
        }))

        setPendingFiles(prev => [...prev, ...newPending])

        // Upload immediately
        const formData = new FormData()
        compressedFiles.forEach(f => formData.append('files', f))
        formData.set('folder', folder)

        const result = await uploadTicketAttachments(formData)

        if (result.urls && result.urls.length > 0) {
            onUrlsChange([...uploadedUrls, ...result.urls])
        }

        // Clean up pending files (revoke blob URLs)
        setPendingFiles(prev => {
            const remaining = prev.filter(p => !toAdd.includes(p.file))
            newPending.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
            // If there were errors, keep those
            if (result.errors) {
                const errorFiles = toAdd
                    .filter((_, i) => !result.urls || i >= result.urls.length)
                    .map((file, i) => ({
                        file,
                        preview: null,
                        uploading: false,
                        error: result.errors?.[i] || 'อัปโหลดไม่สำเร็จ',
                    }))
                return [...remaining, ...errorFiles]
            }
            return remaining
        })
    }, [uploadedUrls, onUrlsChange, folder, maxFiles, totalFiles])

    // ── Remove uploaded file ───────────────────────────────────────────
    const removeUploadedUrl = useCallback(async (url: string) => {
        onUrlsChange(uploadedUrls.filter(u => u !== url))
        await deleteTicketAttachment(url)
    }, [uploadedUrls, onUrlsChange])

    const removePendingFile = useCallback((file: File) => {
        setPendingFiles(prev => {
            const item = prev.find(p => p.file === file)
            if (item?.preview) URL.revokeObjectURL(item.preview)
            return prev.filter(p => p.file !== file)
        })
    }, [])

    // ── Drag & Drop handlers ──────────────────────────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        if (e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files)
        }
    }, [addFiles])

    const handleClick = () => inputRef.current?.click()

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addFiles(e.target.files)
            e.target.value = ''
        }
    }

    // ── Render ─────────────────────────────────────────────────────────
    const hasFiles = uploadedUrls.length > 0 || pendingFiles.length > 0

    return (
        <div className="space-y-2">
            {/* Drop Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
                className={`
                    relative border-2 border-dashed rounded-xl cursor-pointer transition-all
                    ${compact ? 'px-3 py-2' : 'px-4 py-6'}
                    ${isDragging
                        ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30'
                    }
                `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_STRING}
                    onChange={handleInputChange}
                    className="hidden"
                />

                <div className={`flex items-center gap-2 justify-center ${compact ? '' : 'flex-col gap-1.5'}`}>
                    <Upload className={`${compact ? 'h-4 w-4' : 'h-6 w-6'} text-zinc-400`} />
                    <div className={`text-center ${compact ? 'text-xs' : 'text-sm'} text-zinc-500 dark:text-zinc-400`}>
                        {isDragging ? (
                            <span className="text-violet-600 dark:text-violet-400 font-medium">วางไฟล์ที่นี่</span>
                        ) : compact ? (
                            <span>แนบไฟล์ (ลากวาง/คลิก)</span>
                        ) : (
                            <>
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">ลากไฟล์มาวางที่นี่</span>
                                <span> หรือ </span>
                                <span className="font-medium text-violet-600 dark:text-violet-400">เลือกไฟล์</span>
                                <p className="text-[10px] text-zinc-400 mt-1">
                                    รูปภาพ, PDF, DOCX, XLSX, ZIP (สูงสุด {maxSizeMB}MB/ไฟล์, {maxFiles} ไฟล์)
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Drag overlay */}
                {isDragging && (
                    <div className="absolute inset-0 rounded-xl bg-violet-500/10 pointer-events-none" />
                )}
            </div>

            {/* File List */}
            {hasFiles && (
                <div className="flex flex-wrap gap-2.5">
                    {/* Uploaded files */}
                    {uploadedUrls.map((url, i) => (
                        <div key={`uploaded-${i}`} className="relative">
                            {isImageFile(url) ? (
                                <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shadow-sm">
                                    <img src={url} alt="" className="h-full w-full object-cover" />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeUploadedUrl(url) }}
                                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-md"
                                        title="ลบไฟล์"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 shadow-sm">
                                    <span className="text-zinc-400">{getFileIcon(url)}</span>
                                    <span className="max-w-[100px] truncate font-medium">{getFileName(url)}</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeUploadedUrl(url) }}
                                        className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-700 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 flex items-center justify-center transition-colors shrink-0"
                                        title="ลบไฟล์"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Pending files */}
                    {pendingFiles.map((pf, i) => (
                        <div key={`pending-${i}`} className="relative">
                            {pf.preview ? (
                                <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shadow-sm">
                                    <img src={pf.preview} alt="" className="h-full w-full object-cover opacity-50" />
                                    {pf.uploading && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                                        </div>
                                    )}
                                    {!pf.uploading && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removePendingFile(pf.file) }}
                                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-md"
                                            title="ลบไฟล์"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-500 shadow-sm">
                                    {pf.uploading ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> : <span className="text-zinc-400">{getFileIcon(pf.file.name)}</span>}
                                    <span className="max-w-[80px] truncate font-medium">{pf.file.name}</span>
                                    <span className="text-[10px] text-zinc-400">{formatFileSize(pf.file.size)}</span>
                                    {!pf.uploading && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removePendingFile(pf.file) }}
                                            className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-700 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 flex items-center justify-center transition-colors shrink-0"
                                            title="ลบไฟล์"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                            {pf.error && (
                                <p className="text-[10px] text-red-500 mt-0.5 max-w-[100px] truncate">{pf.error}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

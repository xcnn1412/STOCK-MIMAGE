'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface ImageLightboxProps {
    images: string[]
    initialIndex?: number
    onClose: () => void
}

// ============================================================================
// ImageLightbox Component
// ============================================================================

export default function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex)

    const goNext = useCallback(() => {
        setCurrentIndex(prev => (prev + 1) % images.length)
    }, [images.length])

    const goPrev = useCallback(() => {
        setCurrentIndex(prev => (prev - 1 + images.length) % images.length)
    }, [images.length])

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowRight') goNext()
            else if (e.key === 'ArrowLeft') goPrev()
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [onClose, goNext, goPrev])

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    if (!images.length) return null

    return (
        <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
            >
                <X className="h-5 w-5" />
            </button>

            {/* Counter */}
            {images.length > 1 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/70 font-medium z-10">
                    {currentIndex + 1} / {images.length}
                </div>
            )}

            {/* Navigation buttons */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); goPrev() }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
                    >
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); goNext() }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
                    >
                        <ChevronRight className="h-6 w-6" />
                    </button>
                </>
            )}

            {/* Image */}
            <img
                src={images[currentIndex]}
                alt={`Image ${currentIndex + 1}`}
                className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
            />
        </div>
    )
}

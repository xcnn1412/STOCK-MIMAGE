'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function ItemImagePreview({ images, alt }: { images: string[], alt: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!images || images.length === 0) {
      return <div className="h-10 w-10 bg-zinc-100 rounded-md flex items-center justify-center text-xs text-zinc-400">No</div>
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length)
  }

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="relative group overflow-hidden rounded-md h-10 w-10">
             <img 
               src={images[0]} 
               alt={alt} 
               className="h-full w-full object-cover transition-transform group-hover:scale-110" 
             />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-black border-zinc-800">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <div className="relative aspect-square w-full flex items-center justify-center bg-black">
          <img
            src={images[currentIndex]}
            alt={`${alt} - ${currentIndex + 1}`}
            className="max-h-full max-w-full object-contain"
          />
          
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full"
                onClick={handlePrev}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full"
                onClick={handleNext}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_, idx) => (
                  <div 
                    key={idx} 
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${idx === currentIndex ? 'bg-white' : 'bg-white/30'}`} 
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

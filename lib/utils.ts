import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function compressImage(file: File, maxSizeMB: number = 5): Promise<File> {
    if (file.size <= maxSizeMB * 1024 * 1024) {
        return file;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };
        
        reader.onerror = (e) => reject(e);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            
            // Calculate new dimensions (maintain aspect ratio)
            // If image is very large, resizing helps compression
            // Let's cap max dimension at 2500px which is good for web
            let width = img.width;
            let height = img.height;
            const maxDimension = 2500;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file); // Fallback to original
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Attempt compression
            // standard jpeg quality 0.8 is usually safe and efficient
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    
                    // If result is still larger than limit (unlikely with resize), try lower quality
                    if (blob.size > maxSizeMB * 1024 * 1024) {
                         canvas.toBlob((blob2) => {
                             if (blob2) {
                                  const newFile = new File([blob2], file.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now(),
                                });
                                resolve(newFile);
                             } else {
                                resolve(file)
                             }
                         }, 'image/jpeg', 0.6)
                    } else {
                        const newFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    }
                },
                'image/jpeg',
                0.8
            );
        };
        
        reader.readAsDataURL(file);
    });
}

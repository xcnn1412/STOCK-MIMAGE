import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * บีบรูปฝั่ง client ก่อนอัปโหลด (ผลลัพธ์เป็น JPEG เสมอเมื่อมีการบีบจริง)
 *
 * @param maxSizeMB เพดานขนาดไฟล์ (MB)
 * @param maxDimension เพดานด้านยาวสุด (px) — ค่าเริ่มต้น 1600 คงพฤติกรรมเดิม
 *                     ส่งค่าน้อยกว่านี้เพื่อบังคับย่อ เช่น รูปลายเซ็น (400)
 */
export async function compressImage(file: File, maxSizeMB: number = 1, maxDimension: number = 1600): Promise<File> {
    // ข้ามการบีบได้เฉพาะตอนใช้เพดานมาตรฐาน — ถ้าผู้เรียกขอเพดานเล็กกว่า
    // ต้องย่อจริงเสมอ แม้ไฟล์จะเล็กอยู่แล้ว
    if (maxDimension >= 1600 && file.size <= maxSizeMB * 1024 * 1024) {
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
            // Cap max dimension (default 1600px) for bandwidth optimization
            let width = img.width;
            let height = img.height;

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

            // Output is JPEG (no alpha): paint white first so transparent PNGs
            // (e.g. signatures) don't come out as black rectangles.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // Attempt compression
            // Reduced to 0.75 for better savings while maintaining acceptable quality
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    
                    // If result is still larger than limit, try lower quality
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
                0.75
            );
        };
        
        reader.readAsDataURL(file);
    });
}

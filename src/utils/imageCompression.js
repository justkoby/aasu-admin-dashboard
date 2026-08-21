/**
 * Compresses and resizes an image file client-side using HTML5 Canvas.
 * - Resizes images larger than 1600px width while preserving aspect ratio.
 * - Converts output format to WebP.
 * - Quality-tunes to aim for optimal sizes (200-500 KB).
 * 
 * @param {File} file - The original uploaded image File object
 * @param {number} maxWidth - Maximum width boundary (default 1600)
 * @param {number} quality - WebP quality compression ratio (default 0.82)
 * @returns {Promise<Blob>} - Resolves with compressed WebP Blob
 */
export async function compressImage(file, maxWidth = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image.'))
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Apply aspect ratio resizing if width exceeds boundary limit
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return reject(new Error('Failed to get 2D context from canvas.'))
        }

        // Draw image onto canvas boundary
        ctx.drawImage(img, 0, 0, width, height)

        // Convert canvas image to WebP blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Canvas WebP export failed.'))
            }
          },
          'image/webp',
          quality
        )
      }
      img.onerror = () => {
        reject(new Error('Failed to load image for compression.'))
      }
      img.src = event.target.result
    }
    reader.onerror = () => {
      reject(new Error('Failed to read image file data.'))
    }
    reader.readAsDataURL(file)
  })
}

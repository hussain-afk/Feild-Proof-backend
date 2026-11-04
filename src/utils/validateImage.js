import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
];

export const validateImage = async (file) => {
    if (!file || !file.buffer) {
        throw new Error("No image file provided");
    }

    // 1. File size check: maximum 10 MB
    const MAX_SIZE = 10 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
        throw new Error("Image must be smaller than 10 MB");
    }

    // 2. Actual binary signature check
    const detectedType = await fileTypeFromBuffer(file.buffer);

    if (
        !detectedType ||
        !ALLOWED_IMAGE_TYPES.includes(detectedType.mime)
    ) {
        throw new Error("Invalid image file content");
    }

    // 3. Browser-provided MIME type vs detected MIME
    if (file.mimetype !== detectedType.mime) {
        throw new Error("File MIME type does not match actual content");
    }

    // 4. Decode the actual image
    try {
        const metadata = await sharp(file.buffer, {
            limitInputPixels: 40_000_000,
        }).metadata();

        if (!metadata.width || !metadata.height) {
            throw new Error("Invalid image dimensions");
        }

        if (metadata.width > 8000 || metadata.height > 8000) {
            throw new Error("Image dimensions are too large");
        }

        // Decode image data, not just metadata
        await sharp(file.buffer, {
            limitInputPixels: 40_000_000,
        })
            .rotate()
            .jpeg()
            .toBuffer();

    } catch {
        throw new Error("Image is corrupted or cannot be decoded");
    }

    return {
        valid: true,
        mime: detectedType.mime,
    };
};
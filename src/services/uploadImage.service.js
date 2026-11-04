import ImageKit from "@imagekit/nodejs";
import envConfig from "../config/env.config.js";
import { validateImage } from "../utils/validateImage.js";

const imagekit = new ImageKit({
    privateKey: envConfig.imagekitPrivateKey,
});

const uploadImage = async (file) => {
    try {
        // 1. Check whether file exists
        if (!file || !file.buffer) {
            throw new Error("No image file provided");
        }

        // 2. Validate actual image content
        const validatedUrl = await validateImage(file);
        console.log("Validated image URL:", validatedUrl);

        // 3. Generate a safe filename
        const safeFileName = `fieldproof-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}.jpg`;

        // 4. Convert image buffer to Base64
        const base64File = file.buffer.toString("base64");

        // 5. Upload validated image to ImageKit
        const response = await imagekit.files.upload({
            file: base64File,
            fileName: safeFileName,
        });

        return response.url;

    } catch (error) {
        console.error("Error uploading image:", error);
        throw error;
    }
};

export default uploadImage;
const sharp = require("sharp");

async function downscaleImage(base64Data, imageType, resolution, quality) {
    try {
        // Convert base64 to a Buffer
        const imageBuffer = Buffer.from(base64Data, "base64");

        // Resize image using Sharp
        const resizedBuffer = await sharp(imageBuffer)
            .resize({ width: resolution, height: resolution, fit: "inside" }) // Resize while maintaining aspect ratio
            .toFormat(imageType.split('/')[1], { quality: Math.floor(quality * 100) }) // Convert to correct format
            .toBuffer();

        // Convert resized image back to base64
        const resizedBase64 = resizedBuffer.toString("base64");

        // Return the new data URL
        return `data:${imageType};base64,${resizedBase64}`;
    } catch (error) {
        console.error("Image processing error:", error);
        throw new Error("Failed to process image.");
    }
}

// Fetch image data
let base64Data = startTrigger.data.systemMockUpImages[1].base64Data;
let imageType = startTrigger.data.systemMockUpImages[1].type;
let resolution = 500; // Max width/height
let quality = 1; // 100% quality

// Run function and return result
return await downscaleImage(base64Data, imageType, resolution, quality);

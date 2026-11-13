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

        // Convert resized image back to Base64
        const resizedBase64 = resizedBuffer.toString("base64");

        // Return the new Data URL
        return `data:${imageType};base64,${resizedBase64}`;
    } catch (error) {
        console.error("Image processing error:", error);
        throw new Error("Failed to process image.");
    }
}

// Fetch image data
let base64Data = startTrigger.data.systemMockUpImages[0].base64Data;
let imageType = startTrigger.data.systemMockUpImages[0].type;
let resolution = 500;
let quality = 1;


return await downscaleImage(base64Data, imageType, resolution, quality);

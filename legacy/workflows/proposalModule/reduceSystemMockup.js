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
        return `data:${imageType};base64,${resizedBuffer.toString("base64")}`;
    } catch (error) {
        console.error("Image processing error:", error);
        throw new Error("Failed to process image.");
    }
}

async function processAllImages(startTrigger, resolution = 500, quality = 1) {
    const images = startTrigger.data.systemMockUpImages;
    const processedImages = {};

    await Promise.all(
        images.map(async (img, index) => {
            processedImages[`reducedSystemMockup${index + 1}`] = await downscaleImage(img.base64Data, img.type, resolution, quality);
        })
    );

    return processedImages;
}

// Run the function and return result
return await processAllImages(startTrigger);

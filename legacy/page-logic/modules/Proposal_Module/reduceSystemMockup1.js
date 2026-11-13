function getImage(dataUrl)
{
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = dataUrl;
        image.onload = () => {
            resolve(image);
        };
        image.onerror = (el, err) => {
            reject(err.error);
        };
    });
}

async function downscaleImage(
        dataUrl,  
        imageType,  // e.g. 'image/jpeg'
        resolution,  // max width/height in pixels
        quality   // e.g. 0.9 = 90% quality
    ) {

    // Create a temporary image so that we can compute the height of the image.
    const image = await getImage(dataUrl);
    const oldWidth = image.naturalWidth;
    const oldHeight = image.naturalHeight;
    console.log('dims', oldWidth, oldHeight);

    const longestDimension = oldWidth > oldHeight ? 'width' : 'height';
    const currentRes = longestDimension == 'width' ? oldWidth : oldHeight;
    console.log('longest dim', longestDimension, currentRes);

    if (currentRes > resolution) {
        console.log('need to resize...');

        // Calculate new dimensions
        const newSize = longestDimension == 'width' ? Math.floor(oldHeight / oldWidth * resolution) : Math.floor(oldWidth / oldHeight * resolution);
        const newWidth = longestDimension == 'width' ? resolution : newSize;
        const newHeight = longestDimension == 'height' ? resolution : newSize;
        console.log('new width / height', newWidth, newHeight);

        // Create a temporary canvas to draw the downscaled image on.
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Draw the downscaled image on the canvas and return the new data URL.
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, newWidth, newHeight);
        const newDataUrl = canvas.toDataURL(imageType, quality);
        return newDataUrl;
    }
    else {
        return dataUrl;
    }

}

let dataUrl = 'data:'+systemMockups.files[0].type+';base64,'+systemMockups.value[0].base64Data;
let imageType = systemMockups.files[0].type
let resolution = 500
let quality = 1


let ds = downscaleImage(
        dataUrl,  
        imageType,  // e.g. 'image/jpeg'
        resolution,  // max width/height in pixels
        quality   // e.g. 0.9 = 90% quality
    )

return ds
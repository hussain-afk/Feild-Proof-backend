import ImageKit from '@imagekit/nodejs';
import envConfig from '../config/env.config.js';

const imagekit = new ImageKit({
    privateKey: envConfig.imagekitPrivateKey,
});

const uploadImage = async (file) => {
    try {
        const base64File = file.buffer.toString('base64');
        const response = await imagekit.files.upload({
            file: base64File,
            fileName: file.originalname,
        });
        return response.url;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
};


export default uploadImage;
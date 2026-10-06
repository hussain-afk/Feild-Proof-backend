import dotenv from 'dotenv';
dotenv.config();

const envConfig = {
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    imagekitPrivateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    frontendUrl: process.env.FRONTEND_URL,
    // imagekitPublicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    // imagekitUrlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
};

const requiredKeys = ['mongoUri', 'jwtSecret', 'frontendUrl', 'imagekitPrivateKey'];
const missingKeys = requiredKeys.filter((key) => !envConfig[key]);
if (missingKeys.length > 0 && process.env.NODE_ENV !== 'test') {
    throw new Error(`Missing required environment variables: ${missingKeys.join(', ')}`);
}

export default envConfig;
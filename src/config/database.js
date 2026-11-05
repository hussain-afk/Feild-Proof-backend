import mongoose from 'mongoose';
import envConfig from './env.config.js';

const connectDB = async () => {
    try {
        const connection = await mongoose.connect(envConfig.mongoUri,{
            dbName: 'field-proof',
        });
        return connection;
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        throw error; // Rethrow the error to be handled by the caller
    }
}

export default connectDB;
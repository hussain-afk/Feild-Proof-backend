import mongoose from 'mongoose';
import envConfig from './env.config.js';

const connectDB = async () => {
    try {
        const connection = await mongoose.connect(envConfig.mongoUri,{
            dbName: 'field-proof',
        });
        console.log(`MongoDB Connected: ${connection.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
}

export default connectDB;
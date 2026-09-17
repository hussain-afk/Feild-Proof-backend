import Task from "../models/task.model.js";
import Verification from "../models/verification.model.js";

export const checkIn = async (req, res) => {
    const { taskId, latitude, longitude, photoUrl } = req.body;
    const workerId = req.user._id || req.user.id; // Token se worker ki ID

    try {
        // 1. Check karein ke required data aaya hai ya nahi
        if (!taskId || latitude === undefined || longitude === undefined || !photoUrl) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // 2. Database se Task dhoondhein
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // 3. Simple Distance Check (Lat/Lon Match)
        // Production mein exact distance calculate hota hai, basic logic yeh hai:
        const isNearby = 
            Math.abs(task.siteLocation.latitude - latitude) < 0.01 &&
            Math.abs(task.siteLocation.longitude - longitude) < 0.01;

        if (!isNearby) {
            return res.status(400).json({ message: 'Check-in failed. You are not at the site location!' });
        }

        // 4. Verification Database mein Entry Save Karein
        const newVerification = await Verification.create({
            task: taskId,
            worker: workerId,
            checkIn: {
                time: new Date(),
                latitude,
                longitude,
                photoUrl
            },
            isVerified: true
        });

        // 5. Task Status update karein -> 'in-progress'
        task.status = 'in-progress';
        await task.save();

        return res.status(201).json({
            message: 'Check-in successful! Task is now in-progress.',
            verification: newVerification
        });

    } catch (error) {
        return res.status(500).json({ message: 'Error during check-in', error: error.message });
    }
};

export const checkOut = async (req, res) => {
    const { taskId, latitude, longitude, photoUrl } = req.body;
    const workerId = req.user._id || req.user.id;

    try {
        // 1. Validation Check
        if (!taskId || latitude === undefined || longitude === undefined || !photoUrl) {
            return res.status(400).json({ message: 'Missing required check-out fields' });
        }

        // 2. Existing active check-in record search karein
        const verification = await Verification.findOne({
            task: taskId,
            worker: workerId,
            'checkOut.time': { $exists: false } // Jo abhi tak check-out na hua ho
        });

        if (!verification) {
            return res.status(404).json({ message: 'Active check-in record not found for this task' });
        }

        const checkOutTime = new Date();
        const checkInTime = new Date(verification.checkIn.time);

        // 3. Working Hours Calculation (Milliseconds to Hours)
        const diffInMs = checkOutTime - checkInTime;
        const totalHours = Number((diffInMs / (1000 * 60 * 60)).toFixed(2)); // Round off 2 decimals

        // 4. Update Verification Document
        verification.checkOut = {
            time: checkOutTime,
            latitude,
            longitude,
            photoUrl
        };
        verification.totalHours = totalHours > 0 ? totalHours : 0.01; // Minimum basic unit
        await verification.save();

        // 5. Update Task Status -> 'completed'
        await Task.findByIdAndUpdate(taskId, { status: 'completed' });

        return res.status(200).json({
            message: 'Check-out successful! Task marked as completed.',
            totalHoursWorked: verification.totalHours,
            verification
        });

    } catch (error) {
        return res.status(500).json({ message: 'Error during check-out', error: error.message });
    }
};
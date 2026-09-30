import Task from "../models/task.model.js";
import Verification from "../models/verification.model.js";
import uploadImage from "../services/uploadImage.service.js";
import User from "../models/user.model.js";

// Helper function: Real-world distance in meters using Haversine formula
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

export const checkIn = async (req, res) => {
  const { taskId, latitude, longitude } = req.body;
  const photoUrl = req.file;
  const worker = req.user;

  try {
    if (!taskId || latitude === undefined || longitude === undefined || !photoUrl) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const user = await User.findById(worker._id || worker.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.paymentMethod) {
      return res.status(400).json({ message: 'Payment method not set' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // 3. Accurate Geofence Distance Check (Meters)
    const workerLat = Number(latitude);
    const workerLng = Number(longitude);
    const siteLat = Number(task.siteLocation.latitude);
    const siteLng = Number(task.siteLocation.longitude);
    const maxRadius = Number(task.siteLocation.radiusInMeters) || 100; // Default 100m radius

    const distanceInMeters = getDistanceInMeters(workerLat, workerLng, siteLat, siteLng);

    // If worker distance is greater than task radius, reject check-in
    if (distanceInMeters > maxRadius) {
      return res.status(400).json({
        message: `Check-in failed! You are ${Math.round(distanceInMeters)}m away from the site location. Maximum allowed radius is ${maxRadius}m.`
      });
    }

    const uploadedImageUrl = await uploadImage(photoUrl);

    // 4. Verification Record Entry
    const newVerification = await Verification.create({
      task: taskId,
      worker: worker._id || worker.id,
      checkIn: {
        time: new Date(),
        latitude: workerLat,
        longitude: workerLng,
        photoUrl: uploadedImageUrl
      },
      isVerified: true
    });

    // 5. Update Task Status
    task.status = 'in-progress';
    await task.save();

    return res.status(201).json({
      message: 'Check-in successful! Task is now in-progress.',
      distanceFromSiteMeters: Math.round(distanceInMeters),
      verification: newVerification
    });

  } catch (error) {
    return res.status(500).json({ message: 'Error during check-in', error: error.message });
  }
};

export const checkOut = async (req, res) => {
  const { taskId, latitude, longitude } = req.body;
  const photoUrl = req.file;
  const workerId = req.user._id || req.user.id;

  try {
    if (!taskId || latitude === undefined || longitude === undefined || !photoUrl) {
      return res.status(400).json({ message: 'Missing required check-out fields' });
    }

    const verification = await Verification.findOne({
      task: taskId,
      worker: workerId,
      'checkOut.time': { $exists: false }
    });

    if (!verification) {
      return res.status(404).json({ message: 'Active check-in record not found for this task' });
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(verification.checkIn.time);

    const diffInMs = checkOutTime - checkInTime;
    const totalHours = Number((diffInMs / (1000 * 60 * 60)).toFixed(2));
    const uploadedImageUrl = await uploadImage(photoUrl);

    verification.checkOut = {
      time: checkOutTime,
      latitude: Number(latitude),
      longitude: Number(longitude),
      photoUrl: uploadedImageUrl
    };
    verification.totalHours = totalHours > 0 ? totalHours : 0.01;
    await verification.save();

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

export const getAllVerifications = async (req, res) => {
    const user = req.user; // Token se user ki details
    try {
        if (user.role !== 'manager') {
            return res.status(403).json({ message: 'Access denied. Only managers can view all verifications.' });
        }
        const verifications = await Verification.find()
            .populate('task', 'title siteLocation status') // Task ke title, siteLocation aur status ko populate karein
            .populate('worker', 'name email'); // Worker ke name aur email ko populate karein
        return res.status(200).json(verifications);
    }catch(error){
        return res.status(500).json({ message: 'Error fetching verifications', error: error.message });
    }
}

export const deleteVerification = async (req, res) => {
    try {
        const verificationId = req.params.id;
        const user = req.user; // Token se user ki details
        if (user.role !== 'manager') {
            return res.status(403).json({ message: 'Access denied. Only managers can delete verifications.' });
        }
        const deletedVerification = await Verification.findByIdAndDelete(verificationId);
        if (!deletedVerification) {
            return res.status(404).json({ message: 'Verification not found' });
        }
        return res.status(200).json({ message: 'Verification deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Error deleting verification'});
    }
}
import Task from "../models/task.model.js";
import Verification from "../models/verification.model.js";
import uploadImage from "../services/uploadImage.service.js";
import User from "../models/user.model.js";
import adminInfo from "../models/adminInfo.model.js";

// Agar true ho to worker check-out bhi site ke radius ke andar se hi kar sakega
const ENFORCE_CHECKOUT_GEOFENCE = false;

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
  return R * c;
}

// Worker site ke radius ke andar hai ya nahi
function checkGeofence(task, lat, lng) {
  const siteLat = Number(task.siteLocation?.latitude);
  const siteLng = Number(task.siteLocation?.longitude);
  const maxRadius = Number(task.siteLocation?.radiusInMeters) || 100;

  // Agar coordinates number nahi hain to distance NaN banta hai aur check bypass ho jata hai
  if (![lat, lng, siteLat, siteLng].every(Number.isFinite)) {
    return { valid: false };
  }

  const distance = getDistanceInMeters(lat, lng, siteLat, siteLng);
  return { valid: true, inside: distance <= maxRadius, distance, maxRadius };
}

// Event ko kai rooms me bhejna (room name = user id)
const emitToRooms = (io, rooms, event, payload) => {
  if (!io) return;
  [...new Set(rooms.filter(Boolean).map(String))].forEach((room) =>
    io.to(room).emit(event, payload)
  );
};

// Check-in/out ya delete ke baad: manager, worker aur admin ki screens update
const broadcastVerificationChange = (io, task, workerId, status) => {
  if (!io || !task) return;

  // Task ka status badla (worker aur manager ki task list me merge hota hai)
  if (status) {
    emitToRooms(io, [task.createdBy, workerId], 'task_status_updated', {
      task: { _id: String(task._id), status },
    });
  }

  // Manager ki verification list reload
  emitToRooms(io, [task.createdBy], 'verification_updated', {});

  // Admin dashboard (AdminInfo me nayi row aayi)
  io.to('admins').emit('admin_info_updated');
};

// ---------------------------------------------------------------
// CHECK IN
// ---------------------------------------------------------------
export const checkIn = async (req, res) => {
  const { taskId, latitude, longitude } = req.body;
  const photoFile = req.file;
  const workerId = String(req.user._id || req.user.id);

  try {
    if (!taskId || latitude === undefined || longitude === undefined || !photoFile) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const user = await User.findById(workerId);
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

    // Security: sirf assigned worker hi check-in kar sake
    const isAssigned = (task.assignedWorker || []).some((id) => String(id) === workerId);
    if (!isAssigned) {
      return res.status(403).json({ message: 'This task is not assigned to you' });
    }

    // Duplicate check-in rokna (pehle wala check-out hone tak)
    const alreadyActive = await Verification.findOne({
      task: taskId,
      worker: workerId,
      'checkOut.time': { $exists: false },
    });
    if (alreadyActive) {
      return res.status(400).json({ message: 'You have already checked in for this task' });
    }

    // Geofence check
    const workerLat = Number(latitude);
    const workerLng = Number(longitude);
    const geo = checkGeofence(task, workerLat, workerLng);

    if (!geo.valid) {
      return res.status(400).json({ message: 'Invalid location data. Please try again.' });
    }

    if (!geo.inside) {
      return res.status(400).json({
        message: `Check-in failed! You are ${Math.round(geo.distance)}m away from the site location. Maximum allowed radius is ${geo.maxRadius}m.`,
      });
    }

    const uploadedImageUrl = await uploadImage(photoFile);

    const newVerification = await Verification.create({
      task: taskId,
      worker: workerId,
      checkIn: {
        time: new Date(),
        latitude: workerLat,
        longitude: workerLng,
        photoUrl: uploadedImageUrl,
      },
      isVerified: true,
    });

    task.status = 'in-progress';
    await task.save();

    await adminInfo.create({
      message: `Worker ${user.name} checked in for task "${task.title}" at ${new Date().toLocaleString()}.`,
    });

    broadcastVerificationChange(req.app.get('io'), task, workerId, 'in-progress');

    return res.status(201).json({
      message: 'Check-in successful! Task is now in-progress.',
      distanceFromSiteMeters: Math.round(geo.distance),
      verification: newVerification,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error during check-in', error: error.message });
  }
};

// ---------------------------------------------------------------
// CHECK OUT
// ---------------------------------------------------------------
export const checkOut = async (req, res) => {
  const { taskId, latitude, longitude } = req.body;
  const photoFile = req.file;
  const workerId = String(req.user._id || req.user.id);

  try {
    if (!taskId || latitude === undefined || longitude === undefined || !photoFile) {
      return res.status(400).json({ message: 'Missing required check-out fields' });
    }

    const verification = await Verification.findOne({
      task: taskId,
      worker: workerId,
      'checkOut.time': { $exists: false },
    });

    if (!verification) {
      return res.status(404).json({ message: 'Active check-in record not found for this task' });
    }

    // Task chahiye (title ke liye aur status badalne ke liye)
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const workerLat = Number(latitude);
    const workerLng = Number(longitude);

    if (ENFORCE_CHECKOUT_GEOFENCE) {
      const geo = checkGeofence(task, workerLat, workerLng);
      if (!geo.valid) {
        return res.status(400).json({ message: 'Invalid location data. Please try again.' });
      }
      if (!geo.inside) {
        return res.status(400).json({
          message: `Check-out failed! You are ${Math.round(geo.distance)}m away from the site. Maximum allowed radius is ${geo.maxRadius}m.`,
        });
      }
    }

    const checkOutTime = new Date();
    const diffInMs = checkOutTime - new Date(verification.checkIn.time);
    const totalHours = Number((diffInMs / (1000 * 60 * 60)).toFixed(2));
    const uploadedImageUrl = await uploadImage(photoFile);

    verification.checkOut = {
      time: checkOutTime,
      latitude: workerLat,
      longitude: workerLng,
      photoUrl: uploadedImageUrl,
    };
    verification.totalHours = totalHours > 0 ? totalHours : 0.01;
    await verification.save();

    task.status = 'completed';
    await task.save();

    await adminInfo.create({
      message: `Worker ${req.user.name} checked out for task "${task.title}" at ${checkOutTime.toLocaleString()}.`,
    });

    broadcastVerificationChange(req.app.get('io'), task, workerId, 'completed');

    return res.status(200).json({
      message: 'Check-out successful! Task marked as completed.',
      totalHoursWorked: verification.totalHours,
      verification,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error during check-out', error: error.message });
  }
};

// ---------------------------------------------------------------
// GET ALL VERIFICATIONS
// ---------------------------------------------------------------
export const getAllVerifications = async (req, res) => {
  const user = req.user;
  try {
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only managers can view all verifications.' });
    }

    // Manager sirf apne banaye hue tasks ki verifications dekhe; admin sab dekhe
    const filter = {};
    if (user.role === 'manager') {
      const myTaskIds = await Task.find({ createdBy: user._id || user.id }).distinct('_id');
      filter.task = { $in: myTaskIds };
    }

    const verifications = await Verification.find(filter)
      .populate('task', 'title siteLocation status')
      .populate('worker', 'name email');

    return res.status(200).json(verifications);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching verifications', error: error.message });
  }
};

// ---------------------------------------------------------------
// DELETE VERIFICATION
// ---------------------------------------------------------------
export const deleteVerification = async (req, res) => {
  try {
    const verificationId = req.params.id;
    const user = req.user;

    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only managers or admins can delete verifications.' });
    }

    // Pehle populate karke lo, taake message me task aur worker ka naam aaye
    const verification = await Verification.findById(verificationId)
      .populate('task', 'title createdBy')
      .populate('worker', 'name');

    if (!verification) {
      return res.status(404).json({ message: 'Verification not found' });
    }

    // Manager sirf apne task ki verification delete kar sake
    const userId = String(user._id || user.id);
    if (user.role === 'manager' && String(verification.task?.createdBy) !== userId) {
      return res.status(403).json({ message: 'You can only delete verifications of your own tasks' });
    }

    await verification.deleteOne();

    await adminInfo.create({
      message: `Verification for task "${verification.task?.title}" by worker "${verification.worker?.name}" deleted by ${user.role} "${user.name}".`,
    });

    broadcastVerificationChange(req.app.get('io'), verification.task, null, null);

    return res.status(200).json({ message: 'Verification deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Error deleting verification', error: error.message });
  }
};
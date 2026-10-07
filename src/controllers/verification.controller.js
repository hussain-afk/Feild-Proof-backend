import Task from "../models/task.model.js";
import Verification from "../models/verification.model.js";
import uploadImage from "../services/uploadImage.service.js";
import User from "../models/user.model.js";
import adminInfo from "../models/adminInfo.model.js";

// Agar true ho to worker check-out bhi site ke radius ke andar se hi kar sakega
const ENFORCE_CHECKOUT_GEOFENCE = true;

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
// =====================================================================
// 1) In 3 helpers ko apni file me controllers se UPAR paste karo.
//    (checkGeofence, uploadImage, broadcastVerificationChange waghera
//     aapki file me pehle se hain, unko mat chhedna.)
// =====================================================================

// "", null, undefined ko "value nahi di gayi" maano
const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

// Task me asli site location hai ya nahi. (0, 0) ko "nahi" maante hain.
const taskHasLocation = (task) => {
  const loc = task.siteLocation;
  if (!hasValue(loc?.latitude) || !hasValue(loc?.longitude)) return false;

  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

/**
 * Worker ki location ko task ke hisaab se check karta hai.
 *
 * Rule:
 *  - Task me site location HAI  -> worker ki location zaroori, aur radius ke andar honi chahiye
 *  - Task me site location NAHI -> location optional, bas mil jaye to save kar lo
 *
 * Wapas deta hai: { error } ya { location, distance }
 */
const verifyWorkerLocation = (task, latitude, longitude, label, enforce = true) => {
  const hasLat = hasValue(latitude);
  const hasLng = hasValue(longitude);

  // Dono honi chahiye ya dono nahi
  if (hasLat !== hasLng) {
    return { error: "Both latitude and longitude are required" };
  }

  let location = null;

  if (hasLat && hasLng) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180
    ) {
      return { error: "Invalid location data. Please try again." };
    }

    location = { lat, lng };
  }

  // Geofence lagani hi nahi (task me location nahi, ya is step par check band hai)
  if (!enforce || !taskHasLocation(task)) {
    return { location, distance: null };
  }

  // Task me location hai, to worker ki location ke bina aage nahi badh sakte
  if (!location) {
    return {
      error: `Your location is required for ${label.toLowerCase()}. Turn on GPS and try again.`,
    };
  }

  const geo = checkGeofence(task, location.lat, location.lng);

  if (!geo.valid) {
    return { error: "This task has an invalid site location. Please contact your manager." };
  }

  if (!geo.inside) {
    return {
      error: `${label} failed! You are ${Math.round(geo.distance)}m away from the site. Maximum allowed radius is ${geo.maxRadius}m.`,
    };
  }

  return { location, distance: Math.round(geo.distance) };
};

// =====================================================================
// 2) Ye dono controllers apne purane checkIn / checkOut ki jagah paste karo
// =====================================================================

// ---------------------------------------------------------------
// CHECK IN
// ---------------------------------------------------------------
export const checkIn = async (req, res) => {
  const { taskId, latitude, longitude } = req.body;
  const photoFile = req.file;
  const workerId = String(req.user._id || req.user.id);

  try {
    // 1. Required fields
    if (!taskId || !photoFile) {
      return res.status(400).json({ message: "Task ID and check-in photo are required" });
    }

    // 2. Find worker
    const user = await User.findById(workerId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3. Payment method check
    if (!user.paymentMethod) {
      return res.status(400).json({ message: "Payment method not set" });
    }

    // 4. Find task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // 5. Worker is task par assigned hai?
    const isAssigned = (task.assignedWorker || []).some((id) => String(id) === workerId);
    if (!isAssigned) {
      return res.status(403).json({ message: "This task is not assigned to you" });
    }

    // 6. Is worker ka is task par pehle se record hai?
    const existing = await Verification.findOne({ task: taskId, worker: workerId });

    if (existing) {
      return res.status(400).json({
        message: existing.checkOut?.time
          ? "You have already completed this task"
          : "You have already checked in for this task",
      });
    }

    // 7. Location check (task me location ho to zaroori, warna optional)
    const { location, distance, error: locationError } = verifyWorkerLocation(
      task,
      latitude,
      longitude,
      "Check-in"
    );

    if (locationError) {
      return res.status(400).json({ message: locationError });
    }

    // 8. Upload check-in photo
    const uploadedImageUrl = await uploadImage(photoFile);

    // 9. Verification record banao (location sirf tab jab mili ho)
    const newVerification = await Verification.create({
      task: taskId,
      worker: workerId,
      checkIn: {
        time: new Date(),
        photoUrl: uploadedImageUrl,
        ...(location && { latitude: location.lat, longitude: location.lng }),
      },
      isVerified: true,
    });

    // 10. Task status
    task.status = "in-progress";
    await task.save();

    // 11. Admin activity
    await adminInfo.create({
      message: `Worker ${user.name} checked in for task "${task.title}" at ${new Date().toLocaleString()}.`,
    });

    // 12. Socket update
    broadcastVerificationChange(req.app.get("io"), task, workerId, "in-progress");

    // 13. Response
    return res.status(201).json({
      message: "Check-in successful! Task is now in-progress.",
      distanceFromSiteMeters: distance,
      verification: newVerification,
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return res.status(500).json({ message: "Error during check-in" });
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
    // 1. Required fields
    if (!taskId || !photoFile) {
      return res.status(400).json({ message: "Task ID and check-out photo are required" });
    }

    // 2. Active check-in dhundo
    const verification = await Verification.findOne({
      task: taskId,
      worker: workerId,
      "checkOut.time": { $exists: false },
    });

    if (!verification) {
      return res.status(404).json({ message: "Active check-in record not found for this task" });
    }

    // 3. Find task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // 4. Location check
    //    ENFORCE_CHECKOUT_GEOFENCE false ho to sirf location save hoti hai, radius check nahi
    const { location, distance, error: locationError } = verifyWorkerLocation(
      task,
      latitude,
      longitude,
      "Check-out",
      ENFORCE_CHECKOUT_GEOFENCE
    );

    if (locationError) {
      return res.status(400).json({ message: locationError });
    }

    // 5. Kitne ghante kaam kiya
    const checkOutTime = new Date();
    const diffInMs = checkOutTime - new Date(verification.checkIn.time);
    const totalHours = Number((diffInMs / (1000 * 60 * 60)).toFixed(2));

    // 6. Upload photo
    const uploadedImageUrl = await uploadImage(photoFile);

    // 7. Check-out save karo (location sirf tab jab mili ho)
    verification.checkOut = {
      time: checkOutTime,
      photoUrl: uploadedImageUrl,
      ...(location && { latitude: location.lat, longitude: location.lng }),
    };
    verification.totalHours = totalHours > 0 ? totalHours : 0.01;
    await verification.save();

    // 8. Task tabhi "completed" jab saare assigned workers check-out kar chuke hon.
    //    (Pehle pehla worker check-out karte hi task completed ho jata tha,
    //     chahe baaki workers abhi kaam kar rahe hon.)
    const finishedWorkers = await Verification.distinct("worker", {
      task: taskId,
      "checkOut.time": { $exists: true },
    });

    const finished = new Set(finishedWorkers.map(String));
    const allDone = (task.assignedWorker || []).every((id) => finished.has(String(id)));

    task.status = allDone ? "completed" : "in-progress";
    await task.save();

    // 9. Admin activity
    await adminInfo.create({
      message: `Worker ${req.user.name} checked out for task "${task.title}" at ${checkOutTime.toLocaleString()}.`,
    });

    // 10. Socket update
    broadcastVerificationChange(req.app.get("io"), task, workerId, task.status);

    // 11. Response
    return res.status(200).json({
      message: allDone
        ? "Check-out successful! Task marked as completed."
        : "Check-out successful! The task stays open until all assigned workers check out.",
      totalHoursWorked: verification.totalHours,
      distanceFromSiteMeters: distance,
      verification,
    });
  } catch (error) {
    console.error("Check-out error:", error);
    return res.status(500).json({ message: "Error during check-out" });
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
    console.error('Verification fetch error:', error);
    return res.status(500).json({ message: 'Error fetching verifications' });
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
    console.error('Verification delete error:', error);
    return res.status(500).json({ message: 'Error deleting verification' });
  }
};
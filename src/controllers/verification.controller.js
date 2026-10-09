import Task from "../models/task.model.js";
import Verification from "../models/verification.model.js";
import uploadImage from "../services/uploadImage.service.js";
import User from "../models/user.model.js";
import adminInfo from "../models/adminInfo.model.js";

/*
 * ZAROORI (kai workers ke liye): verification.model.js me ye hona chahiye
 *
 *     verificationSchema.index({ task: 1, worker: 1 }, { unique: true });   // har worker ka task par ek record
 *
 * Aur "task" par akeli unique index NAHI honi chahiye (task: { unique: true } ya index({ task: 1 }, { unique: true })).
 * Wo hogi to task par doosre worker ka check-in "E11000 duplicate key" se fail hota hai.
 * Purani index hatane ke liye ek baar server start par chalao:  await Verification.syncIndexes();
 */

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

// true ho to check-out bhi site ke radius ke andar se hi hoga
const ENFORCE_CHECKOUT_GEOFENCE = true;

// GPS hamesha thoda galat hota hai. Agar phone kehta hai "meri location 30 m tak galat ho sakti hai",
// to worker ko utna hi extra faasla (zyada se zyada 50 m) maaf karte hain.
const MAX_GPS_ALLOWANCE = 50;

// Isse zyada kharab GPS signal ho to check-in/out nahi (sirf production me, taake laptop par test ho sake)
const MAX_GPS_ACCURACY = process.env.NODE_ENV === "production" ? 150 : Infinity;

/* ------------------------------------------------------------------ */
/* Location ke helpers                                                  */
/* ------------------------------------------------------------------ */

// "", null, undefined = value nahi di gayi
const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const isValidLatLng = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Do jagahon ke beech ka faasla (meters me), Haversine formula
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // zameen ka radius
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Task me asli site location hai ya nahi. (0, 0) ko "nahi" maante hain.
function taskHasLocation(task) {
  const loc = task.siteLocation;
  if (!hasValue(loc?.latitude) || !hasValue(loc?.longitude)) return false;

  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  return isValidLatLng(lat, lng) && !(lat === 0 && lng === 0);
}

/**
 * Worker ki location check karta hai.
 *
 * Rule:
 *   - Task me site location HAI  -> worker ki location zaroori, aur radius ke andar honi chahiye
 *   - Task me site location NAHI -> location optional, mil jaye to save kar lo
 *
 * Wapas deta hai:  { error }  ya  { location, distance }
 */
function checkWorkerLocation({ task, latitude, longitude, accuracy, label, enforce = true }) {
  // 1. Worker ki location padho (dono honi chahiye ya dono nahi)
  const hasLat = hasValue(latitude);
  const hasLng = hasValue(longitude);

  if (hasLat !== hasLng) {
    return { error: "Both latitude and longitude are required" };
  }

  let location = null;

  if (hasLat) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!isValidLatLng(lat, lng)) {
      return { error: "Invalid location data. Please try again." };
    }
    location = { lat, lng };
  }

  // 2. Compare karne ke liye kuch nahi (task me location nahi, ya yahan check band hai)
  if (!enforce || !taskHasLocation(task)) {
    return { location, distance: null };
  }

  // 3. Task me location hai, to worker ki location ke bina aage nahi
  if (!location) {
    return { error: `Your location is required to ${label.toLowerCase().replace("-", " ")}. Turn on GPS and try again.` };
  }

  // 4. GPS signal kitna sahi hai?
  const gpsAccuracy = Math.max(Number(accuracy) || 0, 0);

  if (gpsAccuracy > MAX_GPS_ACCURACY) {
    return {
      error: `Your GPS signal is weak (accurate to about ${Math.round(gpsAccuracy)} m). Move to an open area and try again.`,
    };
  }

  // 5. Faasla napo
  const siteLat = Number(task.siteLocation.latitude);
  const siteLng = Number(task.siteLocation.longitude);
  const radius = Number(task.siteLocation.radiusInMeters) || 100;

  const distance = getDistanceInMeters(location.lat, location.lng, siteLat, siteLng);
  const allowance = Math.min(gpsAccuracy, MAX_GPS_ALLOWANCE);

  // Development me console me dikhao, taake galat location foran pakdi ja sake
  if (process.env.NODE_ENV !== "production") {
    console.log("[geofence]", {
      worker: location,
      site: { lat: siteLat, lng: siteLng },
      distance: Math.round(distance),
      radius,
      gpsAccuracy: Math.round(gpsAccuracy),
    });
  }

  if (distance > radius + allowance) {
    return {
      error:
        `${label} failed! You are about ${Math.round(distance)} m from the site, ` +
        `but the allowed distance is ${radius} m.` +
        (gpsAccuracy ? ` (Your GPS accuracy is about ${Math.round(gpsAccuracy)} m.)` : ""),
    };
  }

  return { location, distance: Math.round(distance) };
}

/* ------------------------------------------------------------------ */
/* Task ka status aur socket updates                                    */
/* ------------------------------------------------------------------ */

/**
 * Task ka status verifications se nikalta hai (ek hi jagah, to kahin ghalti nahi hoti):
 *   koi record nahi                       -> pending
 *   sab assigned workers check-out kar chuke -> completed
 *   baaqi sab                              -> in-progress
 */
async function updateTaskStatus(task) {
  const records = await Verification.find({ task: task._id }).select("worker checkOut.time");

  const finishedWorkers = new Set(
    records.filter((record) => record.checkOut?.time).map((record) => String(record.worker))
  );

  const everyoneDone = (task.assignedWorker || []).every((id) => finishedWorkers.has(String(id)));

  if (records.length === 0) task.status = "pending";
  else if (everyoneDone) task.status = "completed";
  else task.status = "in-progress";

  await task.save();
  return task.status;
}

// Ek event ko kai rooms me bhejna (room ka naam = user ki id)
const emitToRooms = (io, rooms, event, payload) => {
  if (!io) return;
  [...new Set(rooms.filter(Boolean).map(String))].forEach((room) =>
    io.to(room).emit(event, payload)
  );
};

/**
 * Screens ko batao ke kuch badla:
 *   - task banane wale manager ko: task ka naya status
 *   - jis worker ne kiya: status + uski apni progress ("myProgress")
 *   - admin dashboard ko: activity log me nayi row
 *
 * myProgress: "not_started" | "checked_in" | "checked_out"
 * (Har worker ka card isi se dikhata hai ke use Check In dabana hai ya Check Out.)
 */
function notifyChange({ io, task, workerId, myProgress }) {
  if (!io || !task) return;

  const taskId = String(task._id);

  emitToRooms(io, [task.createdBy], "task_status_updated", {
    task: { _id: taskId, status: task.status },
  });

  emitToRooms(io, [workerId], "task_status_updated", {
    task: { _id: taskId, status: task.status, myProgress },
  });

  emitToRooms(io, [task.createdBy], "verification_updated", {});
  io.to("admins").emit("admin_info_updated");
}

// Duplicate-key error (E11000) ko samajhna
function handleDuplicateKey(error, res) {
  if (error.code !== 11000) return null;

  // Wahi worker dobara check-in kar raha hai (jaise double tap)
  if (error.keyPattern?.worker) {
    return res.status(400).json({ message: "You have already checked in for this task" });
  }

  // Warna model me "task" par akeli unique index hai (file ke upar wala comment dekho)
  console.error(
    "Verification model me 'task' par unique index hai, isliye doosra worker check-in nahi kar pa raha. " +
      "Fix: verificationSchema.index({ task: 1, worker: 1 }, { unique: true }) rakho aur Verification.syncIndexes() chalao."
  );
  return res.status(500).json({ message: "Server setup problem. Please contact the admin." });
}

/* ------------------------------------------------------------------ */
/* CHECK IN                                                             */
/* ------------------------------------------------------------------ */
export const checkIn = async (req, res) => {
  const { taskId, latitude, longitude, accuracy } = req.body;
  const photoFile = req.file;
  const workerId = String(req.user._id || req.user.id);

  try {
    // 1. Zaroori cheezein
    if (!taskId || !photoFile) {
      return res.status(400).json({ message: "Task ID and check-in photo are required" });
    }

    // 2. Worker aur task dhundo
    const user = await User.findById(workerId).select("name");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // 3. Ye task is worker ko diya gaya hai?
    const isAssigned = (task.assignedWorker || []).some((id) => String(id) === workerId);
    if (!isAssigned) {
      return res.status(403).json({ message: "This task is not assigned to you" });
    }

    // 4. Is worker ka is task par pehle se record hai? (baaqi workers ka record is se farq nahi padta)
    const existing = await Verification.findOne({ task: taskId, worker: workerId });
    if (existing) {
      return res.status(400).json({
        message: existing.checkOut?.time
          ? "You have already completed this task"
          : "You have already checked in for this task",
      });
    }

    // 5. Location check
    const { location, distance, error: locationError } = checkWorkerLocation({
      task,
      latitude,
      longitude,
      accuracy,
      label: "Check-in",
    });
    if (locationError) {
      return res.status(400).json({ message: locationError });
    }

    // 6. Photo upload aur record banao
    const photoUrl = await uploadImage(photoFile);

    const verification = await Verification.create({
      task: taskId,
      worker: workerId,
      checkIn: {
        time: new Date(),
        photoUrl,
        ...(location && { latitude: location.lat, longitude: location.lng }),
      },
      isVerified: true,
    });

    // 7. Task ka status, admin log, socket
    await updateTaskStatus(task);

    await adminInfo.create({
      message: `Worker ${user.name} checked in for task "${task.title}" at ${new Date().toLocaleString()}.`,
    });

    notifyChange({ io: req.app.get("io"), task, workerId, myProgress: "checked_in" });

    // 8. Jawab
    return res.status(201).json({
      message: "Check-in successful!",
      distanceFromSiteMeters: distance,
      verification,
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return (
      handleDuplicateKey(error, res) ||
      res.status(500).json({ message: "Error during check-in" })
    );
  }
};

/* ------------------------------------------------------------------ */
/* CHECK OUT                                                            */
/* ------------------------------------------------------------------ */
export const checkOut = async (req, res) => {
  const { taskId, latitude, longitude, accuracy } = req.body;
  const photoFile = req.file;
  const workerId = String(req.user._id || req.user.id);

  try {
    // 1. Zaroori cheezein
    if (!taskId || !photoFile) {
      return res.status(400).json({ message: "Task ID and check-out photo are required" });
    }

    // 2. Is worker ka chalta hua check-in dhundo ("checkOut.time": null = abhi check-out nahi hua)
    const verification = await Verification.findOne({
      task: taskId,
      worker: workerId,
      "checkOut.time": null,
    });
    if (!verification) {
      return res.status(404).json({ message: "You have not checked in for this task yet" });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // 3. Location check (ENFORCE_CHECKOUT_GEOFENCE false ho to sirf location save hoti hai)
    const { location, distance, error: locationError } = checkWorkerLocation({
      task,
      latitude,
      longitude,
      accuracy,
      label: "Check-out",
      enforce: ENFORCE_CHECKOUT_GEOFENCE,
    });
    if (locationError) {
      return res.status(400).json({ message: locationError });
    }

    // 4. Kitne ghante kaam kiya
    const checkOutTime = new Date();
    const hoursWorked = (checkOutTime - new Date(verification.checkIn.time)) / (1000 * 60 * 60);

    // 5. Photo upload aur check-out save
    const photoUrl = await uploadImage(photoFile);

    verification.checkOut = {
      time: checkOutTime,
      photoUrl,
      ...(location && { latitude: location.lat, longitude: location.lng }),
    };
    verification.totalHours = Math.max(Number(hoursWorked.toFixed(2)), 0.01);
    await verification.save();

    // 6. Task tabhi completed jab SAB assigned workers check-out kar chuke hon
    const status = await updateTaskStatus(task);

    await adminInfo.create({
      message: `Worker ${req.user.name} checked out for task "${task.title}" at ${checkOutTime.toLocaleString()}.`,
    });

    notifyChange({ io: req.app.get("io"), task, workerId, myProgress: "checked_out" });

    // 7. Jawab
    return res.status(200).json({
      message:
        status === "completed"
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

/* ------------------------------------------------------------------ */
/* GET ALL VERIFICATIONS                                                */
/* ------------------------------------------------------------------ */
export const getAllVerifications = async (req, res) => {
  const user = req.user;

  try {
    if (user.role !== "manager" && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Only managers or admins can view verifications." });
    }

    // Manager sirf apne banaye hue tasks ki verifications dekhe; admin sab dekhe
    const filter = {};
    if (user.role === "manager") {
      const myTaskIds = await Task.find({ createdBy: user._id || user.id }).distinct("_id");
      filter.task = { $in: myTaskIds };
    }

    const verifications = await Verification.find(filter)
      .populate("task", "title siteLocation status")
      .populate("worker", "name email");

    return res.status(200).json(verifications);
  } catch (error) {
    console.error("Verification fetch error:", error);
    return res.status(500).json({ message: "Error fetching verifications" });
  }
};

/* ------------------------------------------------------------------ */
/* DELETE VERIFICATION                                                  */
/* ------------------------------------------------------------------ */
export const deleteVerification = async (req, res) => {
  const user = req.user;

  try {
    if (user.role !== "manager" && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Only managers or admins can delete verifications." });
    }

    // Populate pehle, taake log me task aur worker ka naam aaye
    const verification = await Verification.findById(req.params.id)
      .populate("task", "title createdBy")
      .populate("worker", "name");

    if (!verification) {
      return res.status(404).json({ message: "Verification not found" });
    }

    // Manager sirf apne task ki verification delete kar sake
    const userId = String(user._id || user.id);
    if (user.role === "manager" && String(verification.task?.createdBy) !== userId) {
      return res.status(403).json({ message: "You can only delete verifications of your own tasks" });
    }

    const workerId = String(verification.worker?._id);
    const taskId = verification.task?._id;

    await verification.deleteOne();

    await adminInfo.create({
      message: `Verification for task "${verification.task?.title}" by worker "${verification.worker?.name}" deleted by ${user.role} "${user.name}".`,
    });

    // Record hat gaya, to task ka status dobara nikalo aur worker dobara check-in kar sake
    const task = taskId ? await Task.findById(taskId) : null;
    if (task) {
      await updateTaskStatus(task);
      notifyChange({ io: req.app.get("io"), task, workerId, myProgress: "not_started" });
    }

    return res.status(200).json({ message: "Verification deleted successfully" });
  } catch (error) {
    console.error("Verification delete error:", error);
    return res.status(500).json({ message: "Error deleting verification" });
  }
};
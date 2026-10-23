
import Maintenance from "../models/maintenance.model.js";

const DEFAULT_MESSAGE =
  "We are making FieldProof better. We will be back very soon. Thank you for your patience.";

// Read the current maintenance status
const readStatus = async () => {
  const saved = await Maintenance.findOne({ key: "main" }).lean();

  const active =
    Boolean(saved?.enabled) &&
    (!saved.endsAt || new Date(saved.endsAt) > new Date());

  return {
    active,
    message: saved?.message || DEFAULT_MESSAGE,
    endsAt: saved?.endsAt || null,
  };
};

// Used by authentication middleware
export const maintenanceBlocks = async (user) => {
  const status = await readStatus();

  return status.active && user?.role !== "admin" ? status : null;
};

// GET /maintenance/status
export const getStatus = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json(await readStatus());
  } catch (error) {
    console.error("Maintenance status error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// PUT /admin/maintenance
export const setStatus = async (req, res) => {
  try {
    const { enabled, message = "", minutes = null } = req.body ?? {};

    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        message: "enabled must be true or false",
      });
    }

    if (typeof message !== "string" || message.length > 500) {
      return res.status(400).json({
        message: "The message can have at most 500 characters",
      });
    }

    if (
      minutes !== null &&
      (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
    ) {
      return res.status(400).json({
        message: "minutes must be between 1 and 10080 (7 days)",
      });
    }

    const endsAt =
      enabled && minutes !== null
        ? new Date(Date.now() + minutes * 60 * 1000)
        : null;

    await Maintenance.findOneAndUpdate(
      { key: "main" },
      {
        enabled,
        message: message.trim(),
        endsAt,
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        new: true,
      }
    );

    // Read the final status from the database
    const updatedStatus = await readStatus();

    // Broadcast to all connected clients using the EXISTING Socket.IO instance
    const io = req.app.get("io");

    if (io) {
      io.emit("maintenance:updated", updatedStatus);
    } else {
      console.error(
        "Socket.IO instance missing: app.set('io', io) was not configured"
      );
    }

    return res.json(updatedStatus);
  } catch (error) {
    console.error("Maintenance update error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

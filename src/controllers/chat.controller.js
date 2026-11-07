import { canChat } from '../services/chat.service.js';
import Message from '../models/message.model.js';
import mongoose from 'mongoose';

const MAX_TEXT = 2000;
const DEFAULT_LIMIT = 50;

export const getMessages = async (req, res) => {
    try {
        const me = req.user._id || req.user.id;
        const otherUserId = req.params.otherUserId;
        if (!mongoose.isValidObjectId(otherUserId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }
        const allowed = await canChat(me, otherUserId);
        if (!allowed) {
            return res.status(403).json({ message: 'You are not allowed to chat with this user' });
        }
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 100)
            : DEFAULT_LIMIT;
        const messages = await Message.find({
            $or: [
                { sender: me, receiver: otherUserId },
                { sender: otherUserId, receiver: me },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('sender', 'username avatar')
            .populate('receiver', 'username avatar');
        return res.json(messages.reverse());
    } catch (error) {
        console.error("getMessages error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const sendMessage = async (req, res) => {
    try {
        const me = req.user._id || req.user.id;
        const { toUserId, text } = req.body;
        if (!mongoose.isValidObjectId(toUserId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }
        const allowed = await canChat(me, toUserId);
        if (!allowed) {
            return res.status(403).json({ message: 'You are not allowed to chat with this user' });
        }
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
            return res.status(400).json({ message: 'Invalid message text' });
        }
        const message = await Message.create({
            sender: me,
            receiver: toUserId,
            text: text.trim(),
        });
        const payload = message.toObject();
        const io = req.app.get('io');
        if(io) {
            io.to(toUserId).emit('chat:message', payload);
            io.to(me).emit('chat:message', payload);
        }
        return res.status(201).json(payload);
    } catch (error) {
        console.error("sendMessage error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
}
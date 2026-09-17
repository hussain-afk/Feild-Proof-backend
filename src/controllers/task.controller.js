import Task from '../models/task.model.js';

export const createTask = async (req, res) => {
    const { title, description, assignedWorker, client, siteLocation, dueDate } = req.body;
    const user = req.user;
    // console.log('User creating task:', user);
    try {
        if(user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can create a task' });
        }
        if (!title || !assignedWorker || !siteLocation || !dueDate) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const newTask = await Task.create({
            title,
            description,
            assignedWorker,
            client,
            siteLocation,
            dueDate,
            createdBy: user.id,
        });
        res.status(201).json({ message: 'Task created successfully', task: newTask });
        
    } catch (error) {
        res.status(500).json({ message: 'Error creating task', error: error.message });
    }
}

export const getTaskById = async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        if(user.role !== 'admin' && user.role !== 'worker') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const task = await Task.findById(id).populate('assignedWorker');
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json( task );
    } catch (error) {
        res.status(500).json({ message: 'Error fetching task', error: error.message });
    }
}

export const getAllTasks = async (req, res) => {
    const user = req.user;
    try {
        if(user.role !== 'admin' && user.role !== 'worker') {
            return res.status(403).json({ message: 'Access denied' });
        }
        const tasks = await Task.find({}).populate('assignedWorker');
        res.status(200).json( tasks );
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tasks', error: error.message });
    }
}
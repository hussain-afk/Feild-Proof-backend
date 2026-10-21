const isManager = (req, res, next) => {
    const loggedInUser = req.user;
    if(!loggedInUser || loggedInUser.role !== "manager") {
        return res.status(403).json({ message: "Access denied. You are not a manager." });
    }
    next();
}

export default isManager;
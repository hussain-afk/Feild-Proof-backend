const isAdmin = (req, res, next) => {
    const loggedInUser = req.user;
    if (!loggedInUser || loggedInUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied. You are not an admin." });
    }
    next();
}

export default isAdmin;
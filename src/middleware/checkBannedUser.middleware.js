const checkUser = (req, res, next) => {
    const loggedInUser = req.user;
    if (!loggedInUser ) {
        return res.status(401).json({ message: "Unauthorized. User not logged in." });
    }
    if (loggedInUser.isBanned === true) {
        return res.status(403).json({ message: "Access denied. User is banned." });
    }
    next();
}

export default checkUser;
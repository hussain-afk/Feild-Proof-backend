const safeUserFields = [
    "_id",
    "name",
    "email",
    "phone",
    "hourlyRate",
    "avatar",
    "managerId",
    "role",
    "isVerified",
    "isBanned",
    "createdAt",
    "updatedAt",
];

export const toSafeUser = (user) => {
    if (!user) return null;

    const source = typeof user.toObject === "function" ? user.toObject() : user;
    return safeUserFields.reduce((safeUser, field) => {
        if (source[field] !== undefined) safeUser[field] = source[field];
        return safeUser;
    }, {});
};

export default toSafeUser;

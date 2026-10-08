import crypto from "crypto";

const verificationCode = () => {
    const code = crypto.randomInt(100000, 1000000).toString();
    return code;
};

export default verificationCode;
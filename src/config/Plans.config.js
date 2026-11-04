const PLANS = {
    FREE: {
        name: "Free",
        price: 0,
        workerLimit: 5,
        taskLimit: 20,
    },
    TRIAL: {
        name: "Trial",
        price: 0,
        workerLimit: 10,
        taskLimit: 50,
        days: 14, // trial period in days
    },
    BASIC: {
        name: "Basic",
        price: 9.99,
        workerLimit: 20,
        taskLimit: 100,
        days: 30, // basic period in days
    },
    PRO: {
        name: "Pro",
        price: 19.99,
        workerLimit: 50,
        taskLimit: 500,
        days: 30, // pro period in days
    },
    ENTERPRISE: {
        name: "Enterprise",
        price: 49.99,
        workerLimit: 100,
        taskLimit: 1000,
        days: 365, // enterprise period in days
    }
}

export default PLANS;
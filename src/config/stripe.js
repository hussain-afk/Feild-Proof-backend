import Stripe from "stripe";
import envConfig from "./env.config.js";

export const STRIPE_CURRENCY = "pkr";

const stripe = envConfig.stripeSecretKey
  ? new Stripe(envConfig.stripeSecretKey)
  : null;

export default stripe;
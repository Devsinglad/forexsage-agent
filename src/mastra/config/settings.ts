import dotenv from "dotenv";
dotenv.config();
const currencyKey = process.env.CURRENCYLAYER_API_KEY

export const config = {
    currencyKey,
};
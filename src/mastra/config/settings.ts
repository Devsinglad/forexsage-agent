require('dotenv').config();

const currencyKey = process.env.CURRENCYLAYER_API_KEY

export const config = {
    currencyKey,
};
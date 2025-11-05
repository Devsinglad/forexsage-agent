import dotenv from "dotenv";
dotenv.config();
const currencyKey = process.env.CURRENCYLAYER_API_KEY
const zhipuaiBaseUrl = process.env.ZAI_BASE_URL
const zhipuApiKEY = process.env.ZHIPU_API_KEY
export const config = {
    currencyKey,
    zhipuaiBaseUrl,
    zhipuApiKEY
};
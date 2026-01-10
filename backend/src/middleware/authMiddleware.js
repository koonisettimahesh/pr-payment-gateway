import {pool} from "../config/db.js";
import {apiError} from "../utils/errors.js";

export async function authenticateMerchant(req, res, next){
    const apikey = req.header("X-Api-Key");
    const apiSecret = req.header("X-Api-Secret");

    if(!apikey || !apiSecret){
        return next(
            apiError(401, "AUTHENTICATION_ERROR", "Invalid API credentials")
        );
    }

    const {rows} = await pool.query(
        `SELECT id, name, email
         FROM merchants
         WHERE api_key = $1 AND api_secret = $2 AND is_active = true`,
         [apikey, apiSecret]
    );

    if(rows.length === 0){
        return next(
            apiError(401, "AUTHENTICATION_ERROR", "Invalid API credentials")
        )
    }

    req.merchant = rows[0];
    next();
}
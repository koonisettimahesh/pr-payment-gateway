import { apiError } from "../utils/errors.js";
import { verifyProviderToken } from "../utils/jwt.js";
import { findProviderById } from "../repositories/provider.repo.js";

export async function authenticateProvider(req, res, next) {
  try {
    const authorization = req.header("Authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return next(
        apiError(
          401,
          "AUTHENTICATION_ERROR",
          "Provider authentication required"
        )
      );
    }

    const token = authorization.substring(7);

    const payload = verifyProviderToken(token);

    const provider = await findProviderById(payload.sub);

    if (!provider) {
      return next(
        apiError(
          401,
          "AUTHENTICATION_ERROR",
          "Invalid provider token"
        )
      );
    }

    req.provider = provider;

    next();
  } catch (err) {
    next(
      apiError(
        401,
        "AUTHENTICATION_ERROR",
        "Invalid or expired provider token"
      )
    );
  }
}

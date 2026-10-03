import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing");
}

export function generateProviderToken(provider) {
  return jwt.sign(
    {
      sub: provider.id,
      email: provider.email,
      role: "provider"
    },
    JWT_SECRET,
    {
      expiresIn: "1h"
    }
  );
}

export function verifyProviderToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

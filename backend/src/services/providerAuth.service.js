import bcrypt from "bcryptjs";
import crypto from "crypto";
import { apiError } from "../utils/errors.js";
import {
  findProviderByEmail,
  createProvider,
} from "../repositories/provider.repo.js";
import { generateProviderToken } from "../utils/jwt.js";

export async function registerProvider(body) {
  const { name, email, password } = body;

  if (!name || !name.trim()) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Provider name is required"
    );
  }

  if (!email || !email.trim()) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Provider email is required"
    );
  }

  if (!password || password.length < 8) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Password must be at least 8 characters"
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingProvider = await findProviderByEmail(normalizedEmail);

  if (existingProvider) {
    throw apiError(
      409,
      "CONFLICT_ERROR",
      "Provider with this email already exists"
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const provider = await createProvider({
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    password_hash: passwordHash,
  });

  return provider;
}

export async function loginProvider(body) {
  const { email, password } = body;

  if (!email || !email.trim()) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Provider email is required"
    );
  }

  if (!password) {
    throw apiError(
      400,
      "BAD_REQUEST_ERROR",
      "Password is required"
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const provider = await findProviderByEmail(normalizedEmail);

  if (!provider) {
    throw apiError(
      401,
      "AUTHENTICATION_ERROR",
      "Invalid email or password"
    );
  }

  const passwordValid = await bcrypt.compare(
    password,
    provider.password_hash
  );

  if (!passwordValid) {
    throw apiError(
      401,
      "AUTHENTICATION_ERROR",
      "Invalid email or password"
    );
  }

  const token = generateProviderToken(provider);

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      email: provider.email,
    },
    token,
  };
}
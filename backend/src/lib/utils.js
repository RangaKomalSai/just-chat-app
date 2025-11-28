import jwt from "jsonwebtoken";
import crypto from "crypto";
import RefreshToken from "../models/refreshToken.model.js";

// Generate short-lived access token (15 minutes)
export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "15m", // 15 minutes for security
  });
};

// Generate long-lived refresh token (30 days)
export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d", // 30 days
  });
};

// Generate and store both tokens
export const generateTokens = async (userId, res, req) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Store refresh token in database
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

  await RefreshToken.create({
    userId,
    token: refreshToken,
    expiresAt,
    userAgent: req?.headers["user-agent"],
    ipAddress: req?.ip || req?.connection?.remoteAddress,
  });

  // Set access token in cookie (short-lived)
  res.cookie("accessToken", accessToken, {
    maxAge: 15 * 60 * 1000, // 15 minutes in MS
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV !== "development",
  });

  // Set refresh token in cookie (long-lived)
  res.cookie("refreshToken", refreshToken, {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in MS
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV !== "development",
    // No path restriction - needed for refresh endpoint to receive it
  });

  return { accessToken, refreshToken };
};

// Verify access token
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Verify refresh token
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
};

// Revoke refresh token (for logout/security)
export const revokeRefreshToken = async (token) => {
  await RefreshToken.updateOne({ token }, { isRevoked: true });
};

// Revoke all user's refresh tokens (logout all devices)
export const revokeAllUserTokens = async (userId) => {
  await RefreshToken.updateMany({ userId }, { isRevoked: true });
};

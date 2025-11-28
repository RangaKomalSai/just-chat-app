import {
  generateTokens,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from "../lib/utils.js";
import User from "../models/user.model.js";
import RefreshToken from "../models/refreshToken.model.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";

export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;
  console.log(fullName, email, password);
  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email });

    if (user) return res.status(400).json({ message: "Email already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    if (newUser) {
      // generate access + refresh tokens
      await newUser.save();
      const { accessToken } = await generateTokens(newUser._id, res, req);

      res.status(201).json({
        _id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        profilePic: newUser.profilePic,
        accessToken, // Return access token for client-side Socket.IO
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const { accessToken } = await generateTokens(user._id, res, req);

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
      accessToken, // Return access token for client-side Socket.IO
    });
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    // Revoke the refresh token if it exists
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Clear cookies
    res.cookie("accessToken", "", { maxAge: 0 });
    res.cookie("refreshToken", "", { maxAge: 0 });
    res.cookie("jwt", "", { maxAge: 0 }); // Legacy support

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = req.user._id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile pic is required" });
    }

    const uploadResponse = await cloudinary.uploader.upload(profilePic);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const checkAuth = (req, res) => {
  try {
    // Include access token from cookie in response for Socket.IO
    const accessToken = req.cookies.accessToken;

    res.status(200).json({
      ...req.user.toObject(),
      accessToken: accessToken || undefined,
    });
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Refresh access token using refresh token
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token not provided" });
    }

    // Verify refresh token JWT
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Check if token exists in database and is not revoked
    const storedToken = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false,
    });

    if (!storedToken) {
      return res
        .status(401)
        .json({ message: "Refresh token revoked or not found" });
    }

    // Check if token is expired
    if (new Date() > storedToken.expiresAt) {
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // Generate new access token and refresh token (token rotation)
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
      decoded.userId,
      res,
      req
    );

    // Revoke old refresh token (token rotation for security)
    await RefreshToken.updateOne(
      { token: refreshToken },
      { isRevoked: true, replacedBy: newRefreshToken }
    );

    res.status(200).json({
      accessToken,
      message: "Access token refreshed successfully",
    });
  } catch (error) {
    console.log("Error in refreshAccessToken controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Logout from all devices (revoke all refresh tokens)
export const logoutAll = async (req, res) => {
  try {
    const userId = req.user._id;

    // Revoke all refresh tokens for this user
    await revokeAllUserTokens(userId);

    // Clear cookies
    res.cookie("accessToken", "", { maxAge: 0 });
    res.cookie("refreshToken", "", { maxAge: 0 });

    res.status(200).json({ message: "Logged out from all devices" });
  } catch (error) {
    console.log("Error in logoutAll controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

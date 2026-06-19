const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { notify } = require('./notificationController');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, phone, referralCode } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (!referrer) return res.status(400).json({ error: 'Invalid referral code.' });
    }

    const user = await User.create({ name, email, password, phone, referredBy: referrer?._id || null });

    if (referrer) {
      referrer.referralCount += 1;
      await referrer.save({ validateBeforeSave: false });
      // Notify referrer
      await notify(referrer._id, 'referral_joined', 'New referral joined! 🤝',
        `${name} just signed up using your referral code.`, { newUserId: user._id });
    }

    // Welcome notification
    await notify(user._id, 'system', 'Welcome to GigWork! 👋',
      'Your account is ready. Start by browsing available tasks and earning your first payment.', {});

    const token = signToken(user._id);
    res.status(201).json({ message: 'Account created successfully', token, user: user.toPublicJSON() });
  } catch (err) { next(err); }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Incorrect email or password.' });
    if (!user.isActive) return res.status(401).json({ error: 'Account is deactivated.' });

    const token = signToken(user._id);
    res.json({ message: 'Login successful', token, user: user.toPublicJSON() });
  } catch (err) { next(err); }
};

// GET /api/auth/me
exports.getMe = async (req, res) => res.json({ user: req.user.toPublicJSON() });

// PATCH /api/auth/update-profile
exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'notifPrefs'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ message: 'Profile updated', user: user.toPublicJSON() });
  } catch (err) { next(err); }
};

// PATCH /api/auth/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword)))
      return res.status(400).json({ error: 'Current password is incorrect.' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) { next(err); }
};

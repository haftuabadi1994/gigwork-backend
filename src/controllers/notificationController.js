const Notification = require('../models/Notification');

// Helper used by other controllers to fire notifications
const notify = async (userId, type, title, body, data = {}) => {
  try {
    await Notification.create({ user: userId, type, title, body, data });
  } catch (e) {
    console.error('notify error:', e.message);
  }
};

// GET /api/notifications
exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, unread } = req.query;
    const query = { user: req.user._id };
    if (unread === 'true') query.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: req.user._id, isRead: false })
    ]);

    res.json({ notifications, total, unreadCount, page: Number(page) });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/read-all
exports.markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/:id/read
exports.markRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isRead: true });
    res.json({ message: 'Marked as read.' });
  } catch (err) { next(err); }
};

// DELETE /api/notifications — clear all
exports.clearAll = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.json({ message: 'Notifications cleared.' });
  } catch (err) { next(err); }
};

exports.notify = notify;

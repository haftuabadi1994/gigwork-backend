const Handbook = require('../models/Handbook');
const LevelRule = require('../models/LevelRule');

// GET /api/handbook — all published sections
exports.list = async (req, res, next) => {
  try {
    const sections = await Handbook.find({ isPublished: true }).sort({ order: 1 });
    const rules = await LevelRule.find({ isActive: true }).sort({ level: 1 });
    res.json({ sections, levelRules: rules });
  } catch (err) { next(err); }
};

// Admin: GET /api/admin/handbook
exports.adminList = async (req, res, next) => {
  try {
    const sections = await Handbook.find().sort({ order: 1 });
    const rules = await LevelRule.find().sort({ level: 1 });
    res.json({ sections, levelRules: rules });
  } catch (err) { next(err); }
};

// Admin: POST /api/admin/handbook
exports.create = async (req, res, next) => {
  try {
    const s = await Handbook.create(req.body);
    res.status(201).json({ section: s });
  } catch (err) { next(err); }
};

// Admin: PATCH /api/admin/handbook/:id
exports.update = async (req, res, next) => {
  try {
    const s = await Handbook.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ section: s });
  } catch (err) { next(err); }
};

// Admin: DELETE /api/admin/handbook/:id
exports.remove = async (req, res, next) => {
  try {
    await Handbook.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
};

// Admin: PUT /api/admin/level-rules
exports.updateLevelRules = async (req, res, next) => {
  try {
    const { rules } = req.body; // array of rule objects
    for (const r of rules) {
      await LevelRule.findOneAndUpdate({ level: r.level }, r, { upsert: true, new: true });
    }
    const updated = await LevelRule.find().sort({ level: 1 });
    res.json({ levelRules: updated });
  } catch (err) { next(err); }
};

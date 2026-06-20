require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const mongoose  = require('mongoose');
const cron      = require('node-cron');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*', credentials: false }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 200 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/wallet',        require('./routes/wallet'));
app.use('/api/referral',      require('./routes/referral'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/deposits',      require('./routes/deposits'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/income',        require('./routes/income'));
app.use('/api/team',          require('./routes/team'));
app.use('/api/handbook',      require('./routes/handbook'));
app.use('/api/equb',          require('./routes/equb.routes'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message });
});

// ── DB + Server ───────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');

    // ── Equb scheduler: runs every hour at :00 ────────────────────────────────
    const { processEqubRounds } = require('./services/equbScheduler');
    cron.schedule('0 * * * *', () => {
      console.log('[cron] Running equb round processor');
      processEqubRounds();
    });
    console.log('✅ Equb scheduler started');

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT} (listening on 0.0.0.0)`));
  })
  .catch(err => { console.error('❌', err.message); process.exit(1); });

module.exports = app;
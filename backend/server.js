require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const dns      = require('dns');

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const metricRoutes      = require('./routes/metricRoutes');
const userRoutes        = require('./routes/userRoutes');
const healthRoutes      = require('./routes/healthRoutes');
const ideationRoutes    = require('./routes/IdeationRoutes');
const ehsRoutes          = require('./routes/ehsRoutes');
const engineeringRoutes  = require('./routes/engineeringRoutes');
const hrRoutes           = require('./routes/hrRoutes');
const timeLockRoutes     = require('./routes/timeLockRoutes');
const loginLogRoutes     = require('./routes/loginLogRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

app.use('/api/metrics',      metricRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/health',       healthRoutes);
app.use('/api/ideation',     ideationRoutes);
app.use('/api/ehs',           ehsRoutes);
app.use('/api/engineering',   engineeringRoutes);
app.use('/api/hr',            hrRoutes);
app.use('/api/timelock',      timeLockRoutes);
app.use('/api/loginlog',      loginLogRoutes);
app.use('/api/notifications', notificationRoutes);


// ✅ CENTRAL CONFIG (IMPORTANT — SAME AS FRONTEND)
const DEPT_CONFIG = {
  fgmw: 'Finished Goods Warehouse',
  pmw: 'Packing Material Warehouse',
  rmw: 'Raw Material Warehouse',
  ppp: 'Primary Packing Production',
  pop: 'Post Production',
  qcmad: 'QC & Microbiology Lab',
  pro: 'Production',
  spp: 'Secondary Packing Production',
  fac: 'Facilities'
};

const LETTERS = ['Q', 'D', 'S', 'H', 'I'];

const TYPE_MAP = {
  Q: 'Quality',
  D: 'Delivery',
  S: 'Safety',
  H: 'Health',
  I: 'Improvement'
};


// ✅ SMART LABEL
const getLabel = (letter, dept) => {
  const deptName = DEPT_CONFIG[dept] || 'General';
  const isProduction = ['ppp', 'pro', 'spp'].includes(dept);

  const type =
    letter === 'D'
      ? (isProduction ? 'Production' : 'Dispatch')
      : TYPE_MAP[letter] || 'Metric';

  return `${deptName} ${type}`;
};


// 🔄 OLD → NEW DEPT MIGRATION MAP
const OLD_TO_NEW_DEPT = {
  fg: 'fgmw',
  pm: 'pmw',
  rm: 'rmw',
  pp: 'ppp'
};


mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected');

    const Metric = require('./models/Metrics');
    const Health = require('./models/Health');


    // ── 1. Drop old index ─────────────────────────────
    try {
      await Metric.collection.dropIndex('letter_1');
      console.log('✅ Dropped legacy index');
    } catch (_) {}


    // ── 2. MIGRATE OLD DEPT VALUES ────────────────────
    for (const [oldDept, newDept] of Object.entries(OLD_TO_NEW_DEPT)) {
      const res = await Metric.collection.updateMany(
        { dept: oldDept },
        { $set: { dept: newDept } }
      );

      if (res.modifiedCount > 0) {
        console.log(`✅ Migrated ${res.modifiedCount} docs: ${oldDept} → ${newDept}`);
      }
    }


    // ── 3. FIX EMPTY / NULL DEPTS ─────────────────────
    await Metric.collection.updateMany(
      { $or: [{ dept: { $exists: false } }, { dept: null }, { dept: '' }] },
      { $set: { dept: 'fgmw' } }
    );


    // ── 4. UPDATE LABELS (IMPORTANT) ──────────────────
    const allMetrics = await Metric.find();

    for (const m of allMetrics) {
      const newLabel = getLabel(m.letter, m.dept);

      if (m.label !== newLabel) {
        m.label = newLabel;
        await m.save();
      }
    }

    console.log('✅ Labels synced');


    // ── 5. INITIALISE ALL (LETTER × DEPT) ─────────────
    let created = 0;

    for (const letter of LETTERS) {
      for (const dept of Object.keys(DEPT_CONFIG)) {
        const result = await Metric.collection.updateOne(
          { letter, dept },
          {
            $setOnInsert: {
              letter,
              dept,
              label: getLabel(letter, dept),
              shifts: { '1': {}, '2': {}, '3': {} }
            }
          },
          { upsert: true }
        );

        if (result.upsertedCount > 0) created++;
      }
    }

    console.log(`✅ Initialised ${created} metric stubs`);


    // ── 6. HEALTH COLLECTION MIGRATION ────────────────
    await Health.collection.updateMany(
      { $or: [{ dept: 'COMMON' }, { dept: { $exists: false } }] },
      { $set: { dept: 'fgmw' } }
    );

    console.log('✅ Health migration done');

  })
  .catch(err => console.error('❌ MongoDB error:', err.message));


// Graceful Shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🛑 MongoDB connection closed');
  process.exit(0);
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
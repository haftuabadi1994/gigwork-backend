require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const LevelRule = require('../models/LevelRule');
const Handbook = require('../models/Handbook');

const LEVEL_RULES = [
  { level:'intern', label:'Probationary member',  depositRequiredETB:0,       taskCountPerDay:5,  rewardPerTaskETB:22,   referralCommission:2,  teamBonusPercent:0,  minTasksToAdvance:20,  color:'#6B7280' },
  { level:'job1',   label:'Entry-level worker',   depositRequiredETB:4800,    taskCountPerDay:5,  rewardPerTaskETB:31,   referralCommission:5,  teamBonusPercent:1,  minTasksToAdvance:50,  color:'#10B981' },
  { level:'job2',   label:'Intermediate worker',  depositRequiredETB:12000,   taskCountPerDay:10, rewardPerTaskETB:40,   referralCommission:7,  teamBonusPercent:2,  minTasksToAdvance:100, color:'#3B82F6' },
  { level:'job3',   label:'Senior worker',        depositRequiredETB:30000,   taskCountPerDay:15, rewardPerTaskETB:69,   referralCommission:10, teamBonusPercent:4,  minTasksToAdvance:200, color:'#8B5CF6' },
  { level:'job4',   label:'Team lead',            depositRequiredETB:69000,   taskCountPerDay:30, rewardPerTaskETB:82,   referralCommission:12, teamBonusPercent:5,  minTasksToAdvance:400, color:'#F59E0B' },
  { level:'job5',   label:'Senior lead',          depositRequiredETB:158600,  taskCountPerDay:50, rewardPerTaskETB:118,  referralCommission:15, teamBonusPercent:7,  minTasksToAdvance:700, color:'#EF4444' },
  { level:'job6',   label:'Manager',              depositRequiredETB:349000,  taskCountPerDay:80, rewardPerTaskETB:168,  referralCommission:18, teamBonusPercent:9,  minTasksToAdvance:1000,color:'#EC4899' },
  { level:'job7',   label:'Senior manager',       depositRequiredETB:733000,  taskCountPerDay:130,rewardPerTaskETB:226,  referralCommission:20, teamBonusPercent:11, minTasksToAdvance:1500,color:'#14B8A6' },
  { level:'job8',   label:'Director',             depositRequiredETB:1466000, taskCountPerDay:200,rewardPerTaskETB:305,  referralCommission:22, teamBonusPercent:13, minTasksToAdvance:2000,color:'#F97316' },
  { level:'job9',   label:'Senior director',      depositRequiredETB:2932000, taskCountPerDay:350,rewardPerTaskETB:349,  referralCommission:25, teamBonusPercent:15, minTasksToAdvance:3000,color:'#6366F1' },
  { level:'job10',  label:'Executive',            depositRequiredETB:5570000, taskCountPerDay:600,rewardPerTaskETB:403,  referralCommission:30, teamBonusPercent:20, minTasksToAdvance:5000,color:'#D97706' },
];

const HANDBOOK_SECTIONS = [
  { slug:'welcome',       order:1, title:'Welcome to GigWork', content:'Welcome to GigWork — the platform where your time equals real income. This handbook explains how to earn, grow, and succeed on our platform.' },
  { slug:'how-it-works',  order:2, title:'How It Works', content:'1. Register and start as an Intern.\n2. Complete tasks to earn ETB.\n3. Refer friends to earn bonuses.\n4. Deposit to unlock higher-paying levels.\n5. Build your team for passive team bonuses.' },
  { slug:'task-rules',    order:3, title:'Task Rules & Quality', content:'Every task must be completed honestly and thoroughly. Submissions are reviewed by our team. Low-quality submissions reduce your quality score. Maintain above 80% to keep your level.' },
  { slug:'income-rules',  order:4, title:'Income & Level Rules', content:'Each level unlocks more tasks per day and higher earnings per task. See the Level Income Table for full details. Deposits are refundable when you withdraw your balance.' },
  { slug:'referral-rules',order:5, title:'Referral & Team Rules', content:'Share your unique code to refer friends. When they complete their first task, you earn a bonus. Team leaders also earn a percentage of their team members\' daily income.' },
  { slug:'disputes',      order:6, title:'Disputes & Support', content:'If you believe a task was unfairly rejected, contact support via the Help section within 48 hours. Provide your submission details and we will re-review within 24 hours.' },
  { slug:'fraud-policy',  order:7, title:'Fraud Prevention', content:'Any attempt to game the system, create fake accounts, or submit fraudulent work will result in immediate account suspension and forfeiture of all earnings.' },
];

const SAMPLE_TASKS = [
  { title:'Rate a film trailer', description:'Watch a 2-minute trailer and give a star rating plus 3-sentence review.', category:'Video Rating', earningETB:85, estimatedMinutes:5, totalSlots:200, requirements:['Watch the full trailer','Give 1–5 star rating','Write 3-sentence review'], trailerVideoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ', trailerPlatform:'youtube' },
  { title:'Product description writing', description:'Write an 80-word description for an Ethiopian honey brand targeting export markets.', category:'Writing', earningETB:120, estimatedMinutes:20, totalSlots:50, requirements:['Exactly 80 words','Mention origin & quality','No grammatical errors'] },
  { title:'Customer satisfaction survey', description:'Complete a 10-question survey for an e-commerce app.', category:'Survey', earningETB:60, estimatedMinutes:5, totalSlots:500, requirements:['Answer all 10 questions','~5 minutes','Finish in one session'] },
  { title:'Data labeling — product images', description:'Label 50 product images by category using our tagging tool. Accuracy ≥ 95%.', category:'Data Entry', earningETB:200, estimatedMinutes:30, totalSlots:100, requirements:['Label all 50 images','Accuracy ≥ 95%','Use provided categories'] },
  { title:'Social engagement — Facebook post', description:'Like, comment and share a sponsored Facebook post. Screenshot required.', category:'Social Engagement', earningETB:45, estimatedMinutes:3, totalSlots:1000, requirements:['Like the post','Leave a meaningful comment','Share to your timeline','Screenshot proof'] },
  { title:'Amharic to English translation', description:'Translate a 300-word business letter from Amharic to English.', category:'Translation', earningETB:250, estimatedMinutes:45, totalSlots:30, minLevel:'job1', requirements:['Native/fluent Amharic','Professional English','Delivered within 2 hours'] },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  // Admin
  if (!await User.findOne({ email: 'admin@gigwork.et' })) {
    await User.create({ name:'Admin', email:'admin@gigwork.et', password:'admin123456', role:'admin', isVerified:true });
    console.log('✅ Admin: admin@gigwork.et / admin123456');
  }

  // Level rules
  await LevelRule.deleteMany({});
  await LevelRule.insertMany(LEVEL_RULES);
  console.log('✅ Level rules seeded');

  // Handbook
  await Handbook.deleteMany({});
  await Handbook.insertMany(HANDBOOK_SECTIONS);
  console.log('✅ Handbook sections seeded');

  // Tasks
  await Task.deleteMany({});
  await Task.insertMany(SAMPLE_TASKS);
  console.log(`✅ ${SAMPLE_TASKS.length} tasks seeded`);

  // Test worker
  if (!await User.findOne({ email: 'worker@gigwork.et' })) {
    await User.create({ name:'Abebe Kebede', email:'worker@gigwork.et', password:'worker123456', role:'worker', level:'intern', isVerified:true });
    console.log('✅ Worker: worker@gigwork.et / worker123456');
  }

  await mongoose.disconnect();
  console.log('Done!');
}

seed().catch(console.error);

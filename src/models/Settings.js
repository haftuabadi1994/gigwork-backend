const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  appName:               { type:String, default:'GigWork' },
  etbToUsdRate:          { type:Number, default:56.5, min:1 },
  minWithdrawalETB:      { type:Number, default:200,  min:1 },
  referralBonusPercent:  { type:Number, default:10, min:0, max:100 },
  internTaskCount:       { type:Number, default:5 },
  minQualityScore:       { type:Number, default:80, min:0, max:100 },
  maintenanceMode:       { type:Boolean, default:false },
  allowNewRegistrations: { type:Boolean, default:true },
  autoApproveWithdrawals:{ type:Boolean, default:false },
  maxTasksPerDay:        { type:Number, default:20 },
  withdrawalMethods: {
    telebirr:    { type:Boolean, default:true },
    cbeBirr:     { type:Boolean, default:true },
    bankTransfer:{ type:Boolean, default:true }
  },
  announcementBanner: { type:String, default:'' },
  supportEmail:       { type:String, default:'support@gigwork.et' }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);

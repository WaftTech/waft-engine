const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const holidaySchema = new Schema({
  title: { type: String, required: true },
  titleNepali: { type: String },
  date: { type: Date, required: true, unique: true },
  isActive: { type: Boolean, required: true, default: true },
  applicableTo: { type: String, required: true, enum: ['All', 'Male', 'Female', 'Other'] },
  isHalfDay: { type: Boolean, required: true, default: false },
  addedBy: { type: Schema.Types.ObjectId, requires: true, ref: 'users' },
  applicableReligion: { type: String, required: true, enum: ['All', 'Hindu', 'Muslim', 'Christian', 'Buddisht', 'Other'], default: 'All' },
  addedDate: { type: Date, required: true, default: Date.now },
  holidayDay:{type:Number, required:true, enum:[0,1,2,3,4,5,6] },
  IsDeleted: {
    type: Boolean,
    default: false,
    required: true,
  },
  Deleted_by: {
    type: Schema.Types.ObjectId,
  },
  Deleted_at: {
    type: Date,
  },
});

module.exports = holidaylist = mongoose.model('holidaylist', holidaySchema);
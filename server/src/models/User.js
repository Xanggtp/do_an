import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    bio: { type: String, default: '', trim: true, maxlength: 280 },
    passwordHash: { type: String, required: true, select: false },
    securityQuestion: { type: String, required: true, trim: true, maxlength: 160 },
    securityAnswerHash: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);

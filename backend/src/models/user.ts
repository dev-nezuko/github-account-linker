import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  githubId: string;
  accessToken: string;
  sessionHash: string;
  sessionExpiresAt: Date;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true },
  githubId: { type: String, required: true },
  accessToken: { type: String },
  sessionHash: {type: String, index: true},
  sessionExpiresAt: {type: Date},
});

export default mongoose.model<IUser>('User', UserSchema);

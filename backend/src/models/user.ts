import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  githubId: string;
  accessToken: string;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true },
  githubId: { type: String, required: true },
  accessToken: { type: String },
});

export default mongoose.model<IUser>('User', UserSchema);
